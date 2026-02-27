import type { Page } from "playwright";
import type { z } from "zod";

/**
 * ScraperConfig — the contract that generated scrapers must implement.
 * Codegen fills in 4 functions; the scaffold handles the run loop,
 * validation, rate limiting, and error handling.
 */
export interface ScraperConfig<T> {
	/** Human-readable scraper name */
	name: string;

	/** Base URL of the target site */
	baseUrl: string;

	/** Zod schema for validating extracted records */
	schema: z.ZodType<T[]>;

	/** Navigate to the target page and prepare for extraction (fill forms, etc.) */
	navigate: (page: Page, params: Record<string, string>) => Promise<void>;

	/** Extract all records from the current page */
	extractPage: (page: Page) => Promise<unknown[]>;

	/** Check if there is a next page of results */
	hasNextPage: (page: Page) => Promise<boolean>;

	/** Navigate to the next page of results */
	goNextPage: (page: Page) => Promise<void>;
}

export interface ScraperRunOptions {
	/** Maximum number of records to extract (for testing) */
	limit?: number;

	/** Delay between page navigations in ms */
	delayMs?: number;

	/** Maximum number of pages to scrape */
	maxPages?: number;

	/** CLI parameters to pass to navigate() */
	params?: Record<string, string>;

	/** Callback after each page extraction */
	onPage?: (info: {
		page: number;
		pageRecords: number;
		totalRecords: number;
	}) => void;
}

export interface ScraperRunResult<T> {
	success: boolean;
	records: T[];
	errors: { page: number; error: string }[];
	pagesScraped: number;
	durationMs: number;
}

/**
 * Run a scraper defined by a ScraperConfig.
 * Handles pagination loop, validation, rate limiting, and error collection.
 */
export async function runScraper<T>(
	config: ScraperConfig<T>,
	getPage: () => Promise<Page>,
	options: ScraperRunOptions = {},
): Promise<ScraperRunResult<T>> {
	const {
		limit,
		delayMs = 1000,
		maxPages = 100,
		params = {},
		onPage,
	} = options;

	const startTime = Date.now();
	const allRecords: unknown[] = [];
	const errors: { page: number; error: string }[] = [];
	let pageNum = 0;

	const page = await getPage();

	// Navigate to the initial page
	try {
		await config.navigate(page, params);
	} catch (err) {
		return {
			success: false,
			records: [],
			errors: [
				{
					page: 0,
					error: `navigation failed: ${err instanceof Error ? err.message : String(err)}`,
				},
			],
			pagesScraped: 0,
			durationMs: Date.now() - startTime,
		};
	}

	// Pagination loop
	while (pageNum < maxPages) {
		pageNum++;

		try {
			const pageRecords = await config.extractPage(page);
			allRecords.push(...pageRecords);
			onPage?.({
				page: pageNum,
				pageRecords: pageRecords.length,
				totalRecords: allRecords.length,
			});

			// Check limit
			if (limit && allRecords.length >= limit) {
				allRecords.length = limit;
				break;
			}

			// Check for next page
			const hasNext = await config.hasNextPage(page);
			if (!hasNext) break;

			// Rate limiting
			if (delayMs > 0) {
				await page.waitForTimeout(delayMs);
			}

			await config.goNextPage(page);

			// Wait for content to load after navigation
			await page.waitForTimeout(500);
		} catch (err) {
			errors.push({
				page: pageNum,
				error: err instanceof Error ? err.message : String(err),
			});

			// If we have some records already, continue despite errors
			if (allRecords.length > 0) break;

			// If first page fails, abort
			if (pageNum === 1) {
				return {
					success: false,
					records: [],
					errors,
					pagesScraped: pageNum,
					durationMs: Date.now() - startTime,
				};
			}
		}
	}

	// Validate against schema
	const parseResult = config.schema.safeParse(allRecords);

	if (parseResult.success) {
		return {
			success: true,
			records: parseResult.data,
			errors,
			pagesScraped: pageNum,
			durationMs: Date.now() - startTime,
		};
	}

	// Schema validation failed — return raw records + validation errors
	return {
		success: false,
		records: allRecords as T[],
		errors: [
			...errors,
			{
				page: -1,
				error: `schema validation failed: ${JSON.stringify(parseResult.error.issues.slice(0, 10))}`,
			},
		],
		pagesScraped: pageNum,
		durationMs: Date.now() - startTime,
	};
}

/**
 * Template: Form search scraper
 * For sites where you fill a search form, submit, and extract results from a table.
 */
export function formSearchTemplate<T>(config: {
	name: string;
	baseUrl: string;
	schema: z.ZodType<T[]>;
	formFields: { selector: string; paramKey: string }[];
	submitSelector: string;
	resultRowSelector: string;
	fieldSelectors: Record<string, string>;
	nextPageSelector?: string;
}): ScraperConfig<T> {
	return {
		name: config.name,
		baseUrl: config.baseUrl,
		schema: config.schema,

		navigate: async (page, params) => {
			await page.goto(config.baseUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});
			await page.waitForTimeout(1000);

			// Fill form fields from params
			for (const field of config.formFields) {
				const value = params[field.paramKey];
				if (value) {
					await page.fill(field.selector, value, { timeout: 5000 });
				}
			}

			// Submit
			await page.click(config.submitSelector, { timeout: 10000 });
			await page.waitForTimeout(2000);
		},

		extractPage: async (page) => {
			const rows = await page.$$(config.resultRowSelector);
			const records: unknown[] = [];

			for (const row of rows) {
				const record: Record<string, string | null> = {};
				for (const [fieldName, selector] of Object.entries(
					config.fieldSelectors,
				)) {
					const el = await row.$(selector);
					record[fieldName] = el
						? await el.innerText().catch(() => null)
						: null;
				}
				records.push(record);
			}

			return records;
		},

		hasNextPage: async (page) => {
			if (!config.nextPageSelector) return false;
			const next = await page.$(config.nextPageSelector);
			return !!next;
		},

		goNextPage: async (page) => {
			if (!config.nextPageSelector) return;
			await page.click(config.nextPageSelector, { timeout: 10000 });
			await page.waitForTimeout(2000);
		},
	};
}

/**
 * Template: API-backed scraper
 * For sites where data comes from a JSON API endpoint.
 */
export function apiTemplate<T>(config: {
	name: string;
	baseUrl: string;
	schema: z.ZodType<T[]>;
	endpoint: string;
	method?: "GET" | "POST";
	buildParams: (
		params: Record<string, string>,
		pageNum: number,
	) => Record<string, string> | string;
	extractRecords: (responseBody: unknown) => unknown[];
	hasMore: (responseBody: unknown, pageNum: number) => boolean;
}): ScraperConfig<T> {
	let lastResponseBody: unknown = null;
	let currentPage = 0;

	return {
		name: config.name,
		baseUrl: config.baseUrl,
		schema: config.schema,

		navigate: async (page, params) => {
			currentPage = 1;
			const reqParams = config.buildParams(params, currentPage);

			let url: string;
			if (typeof reqParams === "string") {
				// POST body
				const response = await page.evaluate(
					async ([endpoint, body, method]) => {
						const res = await fetch(endpoint, {
							method: method || "POST",
							headers: { "Content-Type": "application/json" },
							body,
						});
						return res.json();
					},
					[config.endpoint, reqParams, config.method || "POST"],
				);
				lastResponseBody = response;
			} else {
				// GET with query params
				const searchParams = new URLSearchParams(reqParams);
				url = `${config.endpoint}?${searchParams}`;
				const response = await page.evaluate(async (fetchUrl) => {
					const res = await fetch(fetchUrl);
					return res.json();
				}, url);
				lastResponseBody = response;
			}
		},

		extractPage: async () => {
			if (!lastResponseBody) return [];
			return config.extractRecords(lastResponseBody);
		},

		hasNextPage: async () => {
			if (!lastResponseBody) return false;
			return config.hasMore(lastResponseBody, currentPage);
		},

		goNextPage: async (page) => {
			currentPage++;
			const reqParams = config.buildParams({}, currentPage);

			if (typeof reqParams === "string") {
				const response = await page.evaluate(
					async ([endpoint, body, method]) => {
						const res = await fetch(endpoint, {
							method: method || "POST",
							headers: { "Content-Type": "application/json" },
							body,
						});
						return res.json();
					},
					[config.endpoint, reqParams, config.method || "POST"],
				);
				lastResponseBody = response;
			} else {
				const searchParams = new URLSearchParams(reqParams);
				const url = `${config.endpoint}?${searchParams}`;
				const response = await page.evaluate(async (fetchUrl) => {
					const res = await fetch(fetchUrl);
					return res.json();
				}, url);
				lastResponseBody = response;
			}
		},
	};
}

/**
 * Template: Listing page scraper
 * For sites with a paginated list of items (no search form needed).
 */
export function listingTemplate<T>(config: {
	name: string;
	startUrl: string;
	schema: z.ZodType<T[]>;
	itemSelector: string;
	fieldSelectors: Record<string, string>;
	nextPageSelector?: string;
	nextPageUrlPattern?: {
		paramName: string;
		start: number;
		increment: number;
	};
}): ScraperConfig<T> {
	let currentPageNum = 0;

	return {
		name: config.name,
		baseUrl: config.startUrl,
		schema: config.schema,

		navigate: async (page) => {
			currentPageNum = config.nextPageUrlPattern?.start ?? 1;
			await page.goto(config.startUrl, {
				waitUntil: "domcontentloaded",
				timeout: 30000,
			});
			await page.waitForTimeout(1000);
		},

		extractPage: async (page) => {
			const items = await page.$$(config.itemSelector);
			const records: unknown[] = [];

			for (const item of items) {
				const record: Record<string, string | null> = {};
				for (const [fieldName, selector] of Object.entries(
					config.fieldSelectors,
				)) {
					const el = await item.$(selector);
					if (el) {
						// Check if it's a link — extract href too
						const href = await el
							.getAttribute("href")
							.catch(() => null);
						const text = await el.innerText().catch(() => null);
						record[fieldName] = text;
						if (href) record[`${fieldName}_url`] = href;
					} else {
						record[fieldName] = null;
					}
				}
				records.push(record);
			}

			return records;
		},

		hasNextPage: async (page) => {
			if (config.nextPageSelector) {
				const next = await page.$(config.nextPageSelector);
				return !!next;
			}
			if (config.nextPageUrlPattern) {
				return true; // Caller controls via maxPages
			}
			return false;
		},

		goNextPage: async (page) => {
			if (config.nextPageSelector) {
				await page.click(config.nextPageSelector, { timeout: 10000 });
				await page.waitForTimeout(2000);
				return;
			}
			if (config.nextPageUrlPattern) {
				const { paramName, increment } = config.nextPageUrlPattern;
				currentPageNum += increment;
				const url = new URL(page.url());
				url.searchParams.set(paramName, String(currentPageNum));
				await page.goto(url.toString(), {
					waitUntil: "domcontentloaded",
					timeout: 30000,
				});
				await page.waitForTimeout(1000);
			}
		},
	};
}
