import type { Browser, BrowserContext, Page } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let headless = false;

export function setHeadless(value: boolean) {
	headless = value;
}

async function launchBrowser(): Promise<Browser> {
	const { chromium } = await import("playwright");
	return chromium.launch({
		headless,
		args: ["--disable-blink-features=AutomationControlled"],
	});
}

async function getContext(): Promise<BrowserContext> {
	if (!browser) {
		browser = await launchBrowser();
	}
	if (!context) {
		context = await browser.newContext({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		});
		await context.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => false });
		});
	}
	return context;
}

export async function getPage(): Promise<Page> {
	const ctx = await getContext();
	if (!page || page.isClosed()) {
		page = await ctx.newPage();
	}
	return page;
}

export async function closeBrowser(): Promise<void> {
	if (browser) {
		await browser.close();
		browser = null;
		context = null;
		page = null;
	}
}
