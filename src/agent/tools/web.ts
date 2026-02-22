import { z } from "zod";
import { tool } from "stratus-sdk";
import { getPage, closeBrowser } from "../../browser/index.js";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

// ─── Navigation ────────────────────────────────────────────────────────────

export const webNavigateTool = tool({
	name: "web_navigate",
	description:
		"Navigate to a URL, go back/forward in history, or reload the page. Returns the page title and text content for the resulting page.",
	parameters: z.object({
		url: z
			.string()
			.optional()
			.describe("URL to navigate to. Omit if using action."),
		action: z
			.enum(["back", "forward", "reload"])
			.optional()
			.describe("Navigation action instead of URL. Omit if providing a URL."),
	}),
	execute: async (_ctx, { url, action }) => {
		const page = await getPage();

		if (url) {
			await page.goto(url, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});
		} else if (action === "back") {
			await page.goBack({ timeout: 10000 }).catch(() => {});
		} else if (action === "forward") {
			await page.goForward({ timeout: 10000 }).catch(() => {});
		} else if (action === "reload") {
			await page.reload({ timeout: 30000 });
		} else {
			return "error: provide either url or action";
		}

		const title = await page.title();
		const text = await page.innerText("body").catch(() => "");
		return `page: ${page.url()}\ntitle: ${title}\n\n${truncate(text, 4000)}`;
	},
});

export const webWaitTool = tool({
	name: "web_wait",
	description:
		"Wait for a condition before continuing. Use after clicking if the page needs time to load, or to wait for dynamic content.",
	parameters: z.object({
		time: z.number().optional().describe("Seconds to wait"),
		text: z.string().optional().describe("Text to wait for on page"),
		textGone: z
			.string()
			.optional()
			.describe("Text to wait for to disappear"),
		selector: z
			.string()
			.optional()
			.describe("CSS selector to wait for to appear"),
	}),
	execute: async (_ctx, { time, text, textGone, selector }) => {
		const page = await getPage();
		if (time) {
			await page.waitForTimeout(time * 1000);
			return `waited ${time}s`;
		}
		if (text) {
			await page.waitForSelector(`text=${text}`, { timeout: 15000 });
			return `found: ${text}`;
		}
		if (textGone) {
			await page.waitForSelector(`text=${textGone}`, {
				state: "hidden",
				timeout: 15000,
			});
			return `gone: ${textGone}`;
		}
		if (selector) {
			await page.waitForSelector(selector, { timeout: 15000 });
			return `found: ${selector}`;
		}
		return "error: provide time, text, textGone, or selector";
	},
});

// ─── Interaction ───────────────────────────────────────────────────────────

export const webClickTool = tool({
	name: "web_click",
	description:
		"Click an element on the page. Supports single click, double-click, and right-click.",
	parameters: z.object({
		selector: z.string().describe("CSS selector of the element to click"),
		doubleClick: z.boolean().optional().describe("Double-click instead"),
		button: z
			.enum(["left", "right", "middle"])
			.optional()
			.describe("Mouse button, defaults to left"),
	}),
	execute: async (_ctx, { selector, doubleClick, button }) => {
		const page = await getPage();
		if (doubleClick) {
			await page.dblclick(selector, { timeout: 10000, button });
		} else {
			await page.click(selector, { timeout: 10000, button });
		}
		return `clicked ${selector}`;
	},
});

export const webHoverTool = tool({
	name: "web_hover",
	description:
		"Hover over an element by CSS selector. Use to reveal dropdown menus, tooltips, or mega-navs that appear on hover.",
	parameters: z.object({
		selector: z.string().describe("CSS selector of the element to hover"),
	}),
	execute: async (_ctx, { selector }) => {
		const page = await getPage();
		await page.hover(selector, { timeout: 10000 });
		return `hovered ${selector}`;
	},
});

export const webFillTool = tool({
	name: "web_fill",
	description:
		"Fill an input field by CSS selector. By default sets the value instantly. Use slowly=true when the page needs keystroke events (autocomplete, live search, filtering). Use submit=true to press Enter after.",
	parameters: z.object({
		selector: z.string().describe("CSS selector of the input element"),
		value: z.string().describe("Text to enter"),
		slowly: z
			.boolean()
			.optional()
			.describe(
				"Type character-by-character to trigger key handlers. Default false.",
			),
		submit: z
			.boolean()
			.optional()
			.describe("Press Enter after filling. Default false."),
	}),
	execute: async (_ctx, { selector, value, slowly, submit }) => {
		const page = await getPage();
		if (slowly) {
			await page.click(selector, { timeout: 5000 });
			await page.keyboard.type(value, { delay: 50 });
		} else {
			await page.fill(selector, value, { timeout: 5000 });
		}
		if (submit) await page.keyboard.press("Enter");
		return `filled ${selector} with "${truncate(value, 60)}"`;
	},
});

export const webPressKeyTool = tool({
	name: "web_press_key",
	description:
		"Press a keyboard key or shortcut. Use for Enter, Escape, Tab, arrow keys, or modifier combos like Control+a.",
	parameters: z.object({
		key: z
			.string()
			.describe(
				"Key name — e.g. Enter, Escape, Tab, ArrowDown, Control+a, Meta+c",
			),
	}),
	execute: async (_ctx, { key }) => {
		const page = await getPage();
		await page.keyboard.press(key);
		return `pressed ${key}`;
	},
});

export const webSelectOptionTool = tool({
	name: "web_select_option",
	description:
		"Select options in a <select> dropdown. Use for any dropdown that isn't a custom JS component.",
	parameters: z.object({
		selector: z.string().describe("CSS selector of the <select> element"),
		values: z
			.array(z.string())
			.describe("Values or visible text of options to select"),
	}),
	execute: async (_ctx, { selector, values }) => {
		const page = await getPage();
		const selected = await page.selectOption(selector, values, {
			timeout: 10000,
		});
		return `selected ${selected.length} option(s) in ${selector}`;
	},
});

export const webFillFormTool = tool({
	name: "web_fill_form",
	description:
		"Fill multiple form fields in one call. More efficient than calling web_fill repeatedly. Each field specifies a selector and value.",
	parameters: z.object({
		fields: z
			.array(
				z.object({
					selector: z.string().describe("CSS selector of the field"),
					value: z.string().describe("Value to fill"),
				}),
			)
			.describe("Array of {selector, value} pairs to fill"),
		submit: z
			.boolean()
			.optional()
			.describe("Press Enter after filling the last field"),
	}),
	execute: async (_ctx, { fields, submit }) => {
		const page = await getPage();
		const results: string[] = [];
		for (const field of fields) {
			try {
				await page.fill(field.selector, field.value, { timeout: 5000 });
				results.push(`${field.selector} = "${truncate(field.value, 30)}"`);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				results.push(`${field.selector} FAILED — field may be disabled or hidden. use web_evaluate to check element state`);
			}
		}
		if (submit) await page.keyboard.press("Enter");
		return `filled ${results.length} field(s):\n${results.join("\n")}`;
	},
});

export const webFileUploadTool = tool({
	name: "web_file_upload",
	description:
		"Upload one or more files to a file input element.",
	parameters: z.object({
		selector: z.string().describe("CSS selector of the file input"),
		paths: z
			.array(z.string())
			.describe("Absolute paths to files to upload"),
	}),
	execute: async (_ctx, { selector, paths }) => {
		const page = await getPage();
		await page.setInputFiles(selector, paths, { timeout: 10000 });
		return `uploaded ${paths.length} file(s) to ${selector}`;
	},
});

// ─── Data extraction ───────────────────────────────────────────────────────

export const webExtractTool = tool({
	name: "web_extract",
	description:
		"Extract text or an attribute from all elements matching a CSS selector. This is the primary scraping tool. Returns up to 50 results.",
	parameters: z.object({
		selector: z.string().describe("CSS selector to match elements"),
		attribute: z
			.string()
			.optional()
			.describe(
				"Attribute to extract (href, src, data-id, etc). Omit for text content.",
			),
	}),
	execute: async (_ctx, { selector, attribute }) => {
		const page = await getPage();
		const results = await page.$$eval(
			selector,
			(elements, attr) =>
				elements.slice(0, 50).map((el) => {
					if (attr) return el.getAttribute(attr) ?? "";
					return (el as HTMLElement).innerText ?? el.textContent ?? "";
				}),
			attribute,
		);

		if (results.length === 0) {
			return `no elements found for "${selector}" — try web_screenshot to see the page, or check the selector`;
		}
		return `${results.length} result(s):\n${results.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
	},
});

export const webSnapshotTool = tool({
	name: "web_snapshot",
	description:
		"Capture the accessibility tree of the current page as structured text. Shows roles, names, and hierarchy of all elements. Use when CSS selectors fail — the snapshot reveals the page structure without needing a screenshot.",
	parameters: z.object({}),
	execute: async () => {
		const page = await getPage();
		const snapshot = await page.locator(":root").ariaSnapshot();
		return truncate(snapshot, 4000);
	},
});

export const webScreenshotTool = tool({
	name: "web_screenshot",
	description:
		"Take a screenshot of the page or a specific element. Use to visually debug selectors or verify page state.",
	parameters: z.object({
		path: z
			.string()
			.default("screenshot.png")
			.describe("File path to save the screenshot"),
		selector: z
			.string()
			.optional()
			.describe("CSS selector of element to screenshot. Omit for full page."),
	}),
	execute: async (_ctx, { path, selector }) => {
		const page = await getPage();
		if (selector) {
			const el = await page.$(selector);
			if (!el)
				return `no element found for "${selector}" — check the selector`;
			await el.screenshot({ path });
		} else {
			await page.screenshot({ path, fullPage: true });
		}
		return `saved screenshot to ${path}`;
	},
});

export const webEvaluateTool = tool({
	name: "web_evaluate",
	description:
		"Run JavaScript in the browser page context. Use for accessing page variables, complex DOM queries, reading console logs, checking network requests, or anything CSS selectors can't express. The expression result is JSON-serialized and returned.",
	parameters: z.object({
		expression: z
			.string()
			.describe(
				"JavaScript expression to evaluate. E.g. 'document.title' or '(() => { return [...document.querySelectorAll(\"a\")].map(a => a.href) })()'",
			),
	}),
	execute: async (_ctx, { expression }) => {
		const page = await getPage();
		try {
			const result = await page.evaluate(expression);
			// Compact JSON to save tokens — no pretty printing
			return truncate(
				typeof result === "string"
					? result
					: JSON.stringify(result),
				3000,
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return `JS error: ${msg} — check your expression syntax`;
		}
	},
});

// ─── Browser management ────────────────────────────────────────────────────

export const webHandleDialogTool = tool({
	name: "web_handle_dialog",
	description:
		"Handle a browser dialog (alert, confirm, prompt). If a click triggered a dialog, the page is frozen until it's handled. Accept or dismiss it.",
	parameters: z.object({
		accept: z
			.boolean()
			.describe("true to accept (OK), false to dismiss (Cancel)"),
		promptText: z
			.string()
			.optional()
			.describe("Text to enter if this is a prompt() dialog"),
	}),
	execute: async (_ctx, { accept, promptText }) => {
		const page = await getPage();
		// Set up dialog handler for the next dialog
		const dialogPromise = new Promise<string>((resolve) => {
			page.once("dialog", async (dialog) => {
				const message = dialog.message();
				const type = dialog.type();
				if (accept) {
					await dialog.accept(promptText);
				} else {
					await dialog.dismiss();
				}
				resolve(`${type} dialog "${truncate(message, 100)}" — ${accept ? "accepted" : "dismissed"}`);
			});
		});

		// Also handle if a dialog is already pending — give it a moment
		const timeout = new Promise<string>((resolve) =>
			setTimeout(
				() => resolve("no dialog appeared — it may have already been handled, or no dialog was triggered"),
				3000,
			),
		);

		return Promise.race([dialogPromise, timeout]);
	},
});

export const webTabsTool = tool({
	name: "web_tabs",
	description:
		"Manage browser tabs — list all open tabs, create a new tab, close a tab, or switch to a tab by index.",
	parameters: z.object({
		action: z
			.enum(["list", "new", "close", "select"])
			.describe("Operation to perform"),
		index: z
			.number()
			.optional()
			.describe("Tab index for close/select"),
	}),
	execute: async (_ctx, { action, index }) => {
		const page = await getPage();
		const context = page.context();
		const pages = context.pages();

		switch (action) {
			case "list": {
				const tabs = await Promise.all(
					pages.map(async (p, i) => {
						const title = await p.title();
						const active = p === page ? " (active)" : "";
						return `${i}: ${title} — ${p.url()}${active}`;
					}),
				);
				return `${tabs.length} tab(s):\n${tabs.join("\n")}`;
			}
			case "new": {
				await context.newPage();
				return `created new tab (${context.pages().length} total)`;
			}
			case "close": {
				const targetIdx = index ?? pages.indexOf(page);
				const target = pages[targetIdx];
				if (!target) return `no tab at index ${targetIdx}`;
				await target.close();
				return `closed tab ${targetIdx}`;
			}
			case "select": {
				if (index === undefined) return "error: index required for select";
				const target = pages[index];
				if (!target) return `no tab at index ${index}`;
				await target.bringToFront();
				return `switched to tab ${index}: ${await target.title()}`;
			}
		}
	},
});

export const webCloseTool = tool({
	name: "web_close",
	description:
		"Close the browser completely. Use when done with all web tasks to free resources.",
	parameters: z.object({}),
	execute: async () => {
		await closeBrowser();
		return "browser closed";
	},
});
