import { z } from "zod";
import { tool } from "stratus-sdk";
import { getPage } from "../../browser/index.js";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

export const webProbeTool = tool({
	name: "web_probe",
	description:
		"Deep single-call analysis of a web page. Navigates to the URL, optionally performs interactions first, then returns a structured analysis: forms, data tables, links, pagination patterns, anti-bot signals, and an accessibility snapshot. Much more efficient than calling navigate + snapshot + extract separately.",
	parameters: z.object({
		url: z.string().describe("URL to analyze"),
		interactions: z
			.array(
				z.object({
					action: z
						.enum(["click", "fill", "select", "wait"])
						.describe("Action to perform before analysis"),
					selector: z.string().describe("CSS selector target"),
					value: z
						.string()
						.optional()
						.describe("Value for fill/select actions"),
				}),
			)
			.optional()
			.describe(
				"Optional interactions to perform before analyzing (e.g., fill a search form and submit)",
			),
	}),
	execute: async (_ctx, { url, interactions }) => {
		const page = await getPage();
		await page.goto(url, {
			waitUntil: "domcontentloaded",
			timeout: 30000,
		});

		// Wait for initial rendering
		await page.waitForTimeout(1000);

		// Execute optional interactions before analysis
		if (interactions) {
			for (const step of interactions) {
				try {
					switch (step.action) {
						case "click":
							await page.click(step.selector, { timeout: 10000 });
							await page.waitForTimeout(500);
							break;
						case "fill":
							await page.fill(step.selector, step.value ?? "", {
								timeout: 5000,
							});
							break;
						case "select":
							await page.selectOption(
								step.selector,
								step.value ?? "",
								{ timeout: 5000 },
							);
							break;
						case "wait":
							await page.waitForSelector(step.selector, {
								timeout: 10000,
							});
							break;
					}
				} catch (err) {
					// Continue analysis even if an interaction fails
				}
			}
			// Wait for any dynamic content after interactions
			await page.waitForTimeout(1000);
		}

		// Run comprehensive page analysis in one evaluate call
		const analysis = await page.evaluate(() => {
			// --- Forms ---
			const forms = [...document.querySelectorAll("form")].map(
				(form) => {
					const fields = [
						...form.querySelectorAll(
							"input, select, textarea",
						),
					].map((el) => {
						const input = el as
							| HTMLInputElement
							| HTMLSelectElement
							| HTMLTextAreaElement;
						const field: Record<string, unknown> = {
							tag: el.tagName.toLowerCase(),
							name: input.name || null,
							id: input.id || null,
							type:
								(el as HTMLInputElement).type ||
								el.tagName.toLowerCase(),
							required:
								input.required ||
								input.getAttribute("aria-required") === "true",
							placeholder:
								(el as HTMLInputElement).placeholder || null,
						};

						// Extract select options
						if (el.tagName === "SELECT") {
							field.options = [
								...(el as HTMLSelectElement).options,
							].map((o) => ({
								value: o.value,
								text: o.text.trim(),
								selected: o.selected,
							}));
						}

						// Build a reliable selector
						if (input.id) {
							field.selector = `#${input.id}`;
						} else if (input.name) {
							field.selector = `${el.tagName.toLowerCase()}[name="${input.name}"]`;
						}

						return field;
					});

					// Find submit button
					const submitBtn =
						form.querySelector(
							'button[type="submit"], input[type="submit"]',
						) ||
						form.querySelector("button:not([type])");
					const submitSelector = submitBtn
						? submitBtn.id
							? `#${submitBtn.id}`
							: submitBtn.className
								? `${submitBtn.tagName.toLowerCase()}.${submitBtn.className.split(" ")[0]}`
								: 'button[type="submit"]'
						: null;

					return {
						action: form.action || null,
						method: (form.method || "GET").toUpperCase(),
						id: form.id || null,
						fields: fields.filter(
							(f) => f.type !== "hidden" || f.name,
						),
						hiddenFields: fields
							.filter((f) => f.type === "hidden" && f.name)
							.map((f) => ({
								name: f.name,
								value: (
									form.querySelector(
										`input[name="${f.name}"]`,
									) as HTMLInputElement
								)?.value,
							})),
						submitSelector,
					};
				},
			);

			// --- Data tables ---
			const tables = [...document.querySelectorAll("table")]
				.slice(0, 5)
				.map((table) => {
					const headers = [
						...table.querySelectorAll("thead th, thead td, tr:first-child th"),
					].map((th) => (th as HTMLElement).innerText.trim());

					const rows = [...table.querySelectorAll("tbody tr, tr")]
						.slice(0, 3)
						.map((tr) =>
							[...tr.querySelectorAll("td, th")].map((td) =>
								(td as HTMLElement).innerText
									.trim()
									.slice(0, 100),
							),
						);

					// Build selector for this table
					let selector = "table";
					if (table.id) selector = `#${table.id}`;
					else if (table.className)
						selector = `table.${table.className.split(" ")[0]}`;

					return {
						selector,
						headers,
						rowCount: table.querySelectorAll("tbody tr, tr").length,
						sampleRows: rows,
						hasLinks:
							table.querySelectorAll("a[href]").length > 0,
					};
				});

			// --- Pagination ---
			const paginationSignals: Record<string, unknown> = {
				type: "none",
			};

			// Check for next links
			const nextLink = document.querySelector(
				'a[rel="next"], a:has(> *:only-child), .pagination .next a, .pager .next a, a[aria-label*="next" i], a[title*="next" i]',
			);
			if (!nextLink) {
				// Check by text content
				const allLinks = [...document.querySelectorAll("a")];
				const nextByText = allLinks.find(
					(a) =>
						/^(next|>>|›|→|>)$/i.test(
							(a as HTMLElement).innerText.trim(),
						) ||
						/next/i.test(a.getAttribute("aria-label") || ""),
				);
				if (nextByText) {
					paginationSignals.type = "next_link";
					paginationSignals.selector =
						nextByText.id
							? `#${nextByText.id}`
							: `a[href="${nextByText.getAttribute("href")}"]`;
					paginationSignals.href =
						nextByText.getAttribute("href");
				}
			} else {
				paginationSignals.type = "next_link";
				paginationSignals.selector =
					nextLink.id
						? `#${nextLink.id}`
						: `a[href="${nextLink.getAttribute("href")}"]`;
				paginationSignals.href = nextLink.getAttribute("href");
			}

			// Check for page number links
			if (paginationSignals.type === "none") {
				const pageLinks = document.querySelectorAll(
					".pagination a, nav[aria-label*='page' i] a, .pager a",
				);
				if (pageLinks.length > 2) {
					const hrefs = [...pageLinks]
						.map((a) => a.getAttribute("href"))
						.filter(Boolean);
					// Try to detect page param pattern
					const pageParamMatch = hrefs
						.join(" ")
						.match(/[?&](page|p|pg|offset|start)=(\d+)/i);
					if (pageParamMatch) {
						paginationSignals.type = "url_param";
						paginationSignals.paramName = pageParamMatch[1];
						paginationSignals.sampleValues = hrefs.slice(0, 5);
					}
				}
			}

			// Check for load-more button
			if (paginationSignals.type === "none") {
				const loadMore = document.querySelector(
					'button:has-text("Load More"), button:has-text("Show More"), [class*="load-more"], [class*="show-more"]',
				);
				if (loadMore) {
					paginationSignals.type = "load_more";
					paginationSignals.selector = loadMore.id
						? `#${loadMore.id}`
						: `[class*="load-more"]`;
				}
			}

			// --- Links ---
			const links = [...document.querySelectorAll("a[href]")]
				.slice(0, 20)
				.map((a) => ({
					text: (a as HTMLElement).innerText.trim().slice(0, 80),
					href: a.getAttribute("href"),
				}))
				.filter((l) => l.text && l.href);

			// --- Anti-bot signals ---
			const antiBot = {
				hasCaptcha: !!(
					document.querySelector(
						'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha, [class*="captcha"]',
					)
				),
				hasCloudflare: !!(
					document.querySelector(
						'#cf-wrapper, [class*="cf-browser-verification"]',
					) ||
					document.body.innerText.includes("Checking your browser")
				),
				requiresJavascript:
					document.querySelectorAll("noscript").length > 0,
			};

			// --- Meta info ---
			const meta = {
				title: document.title,
				url: window.location.href,
				charset:
					document.characterSet,
				generator:
					document
						.querySelector('meta[name="generator"]')
						?.getAttribute("content") || null,
			};

			return { meta, forms, tables, paginationSignals, links, antiBot };
		});

		// Get accessibility snapshot
		const snapshot = await page
			.locator(":root")
			.ariaSnapshot()
			.catch(() => "(snapshot failed)");

		return JSON.stringify(
			{
				...analysis,
				accessibilitySnapshot: truncate(snapshot, 3000),
			},
			null,
			2,
		);
	},
});
