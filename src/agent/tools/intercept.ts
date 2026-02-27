import { z } from "zod";
import { tool } from "stratus-sdk";
import { getPage } from "../../browser/index.js";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

export const webInterceptApiTool = tool({
	name: "web_intercept_api",
	description:
		"Record all XHR/fetch network requests while performing a sequence of actions on the page. Returns captured API calls with URLs, methods, request bodies, and response previews. Use this to discover hidden JSON APIs behind SPAs — if you find a clean API, the scraper can use it directly instead of parsing HTML.",
	parameters: z.object({
		actions: z
			.array(
				z.object({
					type: z
						.enum(["navigate", "click", "fill", "select", "wait", "submit"])
						.describe("Action to perform"),
					url: z
						.string()
						.optional()
						.describe("URL for navigate action"),
					selector: z
						.string()
						.optional()
						.describe("CSS selector for click/fill/select/wait actions"),
					value: z
						.string()
						.optional()
						.describe("Value for fill/select actions"),
				}),
			)
			.describe("Sequence of actions to perform while recording network traffic"),
		urlFilter: z
			.string()
			.optional()
			.describe(
				"Only capture requests whose URL contains this string (e.g. '/api/' or '.json')",
			),
	}),
	execute: async (_ctx, { actions, urlFilter }) => {
		const page = await getPage();

		interface CapturedRequest {
			url: string;
			method: string;
			resourceType: string;
			postData: string | null;
			requestHeaders: Record<string, string>;
			status?: number;
			contentType?: string;
			responsePreview?: string;
		}

		const captured: CapturedRequest[] = [];

		// Set up request interception
		const onRequest = (request: {
			url: () => string;
			method: () => string;
			resourceType: () => string;
			postData: () => string | null;
			headers: () => Record<string, string>;
		}) => {
			const resType = request.resourceType();
			if (resType !== "xhr" && resType !== "fetch") return;

			const requestUrl = request.url();
			if (urlFilter && !requestUrl.includes(urlFilter)) return;

			captured.push({
				url: requestUrl,
				method: request.method(),
				resourceType: resType,
				postData: request.postData()?.slice(0, 500) ?? null,
				requestHeaders: request.headers(),
			});
		};

		const onResponse = async (response: {
			url: () => string;
			status: () => number;
			headers: () => Record<string, string>;
			text: () => Promise<string>;
			request: () => { resourceType: () => string };
		}) => {
			const resType = response.request().resourceType();
			if (resType !== "xhr" && resType !== "fetch") return;

			const responseUrl = response.url();
			if (urlFilter && !responseUrl.includes(urlFilter)) return;

			const existing = captured.find((r) => r.url === responseUrl && !r.status);
			if (existing) {
				existing.status = response.status();
				existing.contentType = response.headers()["content-type"] ?? undefined;
				try {
					const body = await response.text();
					existing.responsePreview = truncate(body, 1000);
				} catch {
					existing.responsePreview = "(could not read response body)";
				}
			}
		};

		page.on("request", onRequest);
		page.on("response", onResponse);

		try {
			// Execute the action sequence
			for (const action of actions) {
				try {
					switch (action.type) {
						case "navigate":
							if (action.url) {
								await page.goto(action.url, {
									waitUntil: "domcontentloaded",
									timeout: 30000,
								});
							}
							break;
						case "click":
							if (action.selector) {
								await page.click(action.selector, {
									timeout: 10000,
								});
								await page.waitForTimeout(1000);
							}
							break;
						case "fill":
							if (action.selector) {
								await page.fill(
									action.selector,
									action.value ?? "",
									{ timeout: 5000 },
								);
							}
							break;
						case "select":
							if (action.selector) {
								await page.selectOption(
									action.selector,
									action.value ?? "",
									{ timeout: 5000 },
								);
							}
							break;
						case "wait":
							if (action.selector) {
								await page.waitForSelector(action.selector, {
									timeout: 10000,
								});
							} else {
								await page.waitForTimeout(2000);
							}
							break;
						case "submit":
							if (action.selector) {
								await page.click(action.selector, {
									timeout: 10000,
								});
							} else {
								await page.keyboard.press("Enter");
							}
							await page.waitForTimeout(2000);
							break;
					}
				} catch (err) {
					// Continue capturing even if an action fails
				}
			}

			// Wait for any pending responses
			await page.waitForTimeout(2000);

			if (captured.length === 0) {
				return "no XHR/fetch requests captured — the page may use static HTML, server-side rendering, or the urlFilter was too restrictive";
			}

			// Summarize findings
			const jsonApis = captured.filter((r) =>
				r.contentType?.includes("json"),
			);
			const summary = {
				totalCaptured: captured.length,
				jsonApis: jsonApis.length,
				requests: captured.slice(0, 20).map((r) => ({
					method: r.method,
					url: r.url,
					status: r.status,
					contentType: r.contentType,
					hasPostData: !!r.postData,
					postData: r.postData,
					responsePreview: r.responsePreview,
				})),
			};

			return JSON.stringify(summary, null, 2);
		} finally {
			page.removeListener("request", onRequest);
			page.removeListener("response", onResponse);
		}
	},
});
