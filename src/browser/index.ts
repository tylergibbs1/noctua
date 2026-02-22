import type { Browser, Page } from "playwright";

let browser: Browser | null = null;
let page: Page | null = null;
let headless = false;

export function setHeadless(value: boolean) {
	headless = value;
}

async function launchBrowser(): Promise<Browser> {
	const { chromium } = await import("playwright");
	return chromium.launch({ headless });
}

export async function getPage(): Promise<Page> {
	if (!browser) {
		browser = await launchBrowser();
	}
	if (!page || page.isClosed()) {
		page = await browser.newPage();
	}
	return page;
}

export async function closeBrowser(): Promise<void> {
	if (browser) {
		await browser.close();
		browser = null;
		page = null;
	}
}
