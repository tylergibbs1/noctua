import type { PipelineState } from "../state.js";

/**
 * Stage 1a: RECON EXPLORE — use tools to analyze the target site
 * No outputType — the model freely explores and summarizes findings as text.
 */
export function buildReconExplorePrompt(state: PipelineState): string {
	return `<context>
<target_url>${state.targetUrl}</target_url>
<goal>${state.userIntent}</goal>
</context>

<instructions>
Explore this website to understand how to scrape it. Your goal is to find actual data records and map out the site structure.

Steps:
1. Use web_probe on ${state.targetUrl} to get a page analysis
2. Find the actual data source — many sites (especially government/court) embed data in iframes or link to subdomains. If the main page only shows navigation, follow links like "Search", "Case Inquiry", "Records Search", or probe iframe src URLs directly.
3. Once you find the data portal: identify forms (fields, selectors, submit buttons), perform a sample search (use "Smith" for name searches), and map the results structure.
4. Use web_intercept_api to discover hidden JSON APIs if the site appears to be an SPA
5. Check for anti-bot measures (CAPTCHA, Cloudflare, rate limiting)
6. Extract 3-5 real sample data records

When you have enough information, write a detailed summary of your findings including: site type, form fields with selectors, results structure with selectors, sample data, pagination patterns, API endpoints, and anti-bot measures. Be specific about CSS selectors and HTML structure.
</instructions>`;
}

/**
 * Stage 1b: RECON SYNTHESIZE — convert exploration findings into structured report
 * Uses outputType, no tools — single-turn synthesis.
 */
export function buildReconSynthesizePrompt(
	state: PipelineState,
	findings: string,
): string {
	return `<exploration_findings>
${findings}
</exploration_findings>

<context>
<target_url>${state.targetUrl}</target_url>
<goal>${state.userIntent}</goal>
</context>

<instructions>
Convert the exploration findings above into a structured recon report. Fill in all fields based on the findings. Each sampleData entry must be a JSON-stringified object (a string), not a raw object. The sampleData should contain real records from the site.

Return a JSON object matching this structure:
{
  "url": "...",
  "siteName": "...",
  "siteType": "static_html|spa|api_first|hybrid|unknown",
  "pages": [
    {
      "url": "...",
      "purpose": "search|listing|detail|login|other",
      "formFields": [{ "name": "...", "selector": "...", "type": "...", "required": true/false, "options": [...] }],
      "dataElements": [{ "name": "...", "selector": "...", "sampleValue": "..." }],
      "pagination": { "type": "next_link|url_param|none", "selector": "...", "paramName": "..." }
    }
  ],
  "apiEndpoints": [{ "url": "...", "method": "GET/POST", "contentType": "...", "responseShape": "..." }],
  "antiBot": { "hasCaptcha": false, "hasCloudflare": false, "hasRateLimit": false, "requiresAuth": false },
  "sampleData": ["JSON-stringified record 1", "JSON-stringified record 2", ...],
  "suggestedStrategy": "form_search|listing|api_direct|browser_only"
}
</instructions>`;
}

/**
 * Stage 2: SCHEMA — generate Zod schema from recon data
 */
export function buildSchemaPrompt(state: PipelineState): string {
	return `<context>
<recon_report_path>${state.workDir}/recon-report.json</recon_report_path>
<output_path>${state.scraperDir}/schema.ts</output_path>
</context>

<instructions>
Read the recon report, then generate a Zod schema for the scraper's output data and save it with write_file.

The schema file should:
1. Import { z } from "zod"
2. Define a Zod object schema for a single record — use z.string() for text, z.string().nullable() for optional fields, z.enum() for known value sets
3. Export the single record schema, the array schema, and the inferred TypeScript type

Keep validation practical — use .nullable() generously for fields that might be empty so legitimate data passes.
</instructions>

<example>
import { z } from "zod";

export const CaseRecord = z.object({
  caseNumber: z.string(),
  dateFiled: z.string().nullable(),
  caseTitle: z.string().nullable(),
  caseType: z.string().nullable(),
  caseStatus: z.string().nullable(),
});

export const CaseRecordArray = z.array(CaseRecord);
export type CaseRecord = z.infer<typeof CaseRecord>;
</example>`;
}

/**
 * Stage 3: CODEGEN — generate the scraper code
 */
export function buildCodegenPrompt(state: PipelineState): string {
	// Compute the correct relative path from the scraper dir to the scaffold
	const scraperDir = state.scraperDir!;
	const projectRoot = state.workDir.replace(/\/.noctua\/pipelines\/[^/]+$/, "");

	// Count directory levels from scraperDir to project root
	const relParts = scraperDir.replace(projectRoot + "/", "").split("/");
	const relPrefix = relParts.map(() => "..").join("/");
	const scaffoldRelPath = `${relPrefix}/src/templates/scaffold.ts`;

	const reconSummary = state.reconReport
		? `\n<recon_summary>\n${JSON.stringify(state.reconReport, null, 2)}\n</recon_summary>`
		: "";

	return `<context>
<recon_report_path>${state.workDir}/recon-report.json</recon_report_path>
<schema_path>${scraperDir}/schema.ts</schema_path>
<output_dir>${scraperDir}</output_dir>
<scaffold_import_path>${scaffoldRelPath}</scaffold_import_path>
${reconSummary}
</context>

<instructions>
Read the recon report and schema, then generate two files using write_file:

1. scraper.ts — ScraperConfig with navigate, extractPage, hasNextPage, goNextPage
2. index.ts — CLI entry point with --limit and --output flags

Key points:
- The scaffold import path is exactly "${scaffoldRelPath}"
- Copy selectors verbatim from the recon report — do not invent new ones
- Use page.$$() (double dollar) when extracting multiple rows — page.$() returns only one element
- Use the recon report's default values for form field CLI params
- After form submission, wait for results to load before extracting
- Make all form field values configurable via CLI params
</instructions>

<example_scraper>
import type { Page } from "playwright";
import type { ScraperConfig } from "${scaffoldRelPath}";
import { RecordArray, type Record } from "./schema.js";

export const scraperConfig: ScraperConfig<Record> = {
  name: "example-scraper",
  baseUrl: "https://example.com/search",
  schema: RecordArray,

  navigate: async (page: Page, params: Record<string, string>) => {
    await page.goto("https://example.com/search", { waitUntil: "domcontentloaded" });
    await page.fill("#searchField", params.query || "default");
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes("/api/search")),
      page.click("#submitBtn"),
    ]);
    await page.waitForSelector(".results-row", { timeout: 15000 });
  },

  extractPage: async (page: Page) => {
    return page.$$eval(".results-row", rows =>
      rows.map(row => ({
        field1: row.querySelector(".col1")?.textContent?.trim() || "",
        field2: row.querySelector(".col2")?.textContent?.trim() || null,
      }))
    );
  },

  hasNextPage: async (page: Page) => {
    const btn = await page.$(".next-page:not([disabled])");
    return btn !== null;
  },

  goNextPage: async (page: Page) => {
    await page.click(".next-page");
    await page.waitForSelector(".results-row", { timeout: 15000 });
  },
};
</example_scraper>

<example_index>
import { chromium } from "playwright";
import { runScraper } from "${scaffoldRelPath}";
import { scraperConfig } from "./scraper.js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    query: { type: "string", default: "default" },
    limit: { type: "string" },
    output: { type: "string", default: "output.json" },
  },
});

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const result = await runScraper(scraperConfig, async () => page, {
  limit: values.limit ? Number(values.limit) : undefined,
  delayMs: 1000,
  params: { query: values.query ?? "default" },
});

await Bun.write(values.output ?? "output.json", JSON.stringify(result.records, null, 2));
console.log(\`extracted \${result.records.length} records in \${result.durationMs}ms\`);
if (result.errors.length > 0) console.error(\`\${result.errors.length} error(s):\`, result.errors);
await browser.close();
process.exit(result.success ? 0 : 1);
</example_index>`;
}

/**
 * Stage 4: TEST — run the scraper and validate output
 */
export function buildTestPrompt(state: PipelineState): string {
	const prevResults = state.testResults.length > 0
		? `\n<previous_test_results>\n${JSON.stringify(state.testResults[state.testResults.length - 1], null, 2)}\n</previous_test_results>`
		: "";

	return `<context>
<scraper_dir>${state.scraperDir}</scraper_dir>
<run_command>cd "${state.scraperDir}" && bun run index.ts --limit 5 --output test-output.json 2>&1</run_command>
${prevResults}
</context>

<instructions>
Test the generated scraper and produce a test report.

1. Verify required files exist (index.ts, scraper.ts, schema.ts)
2. Run the scraper with the command above
3. Capture the exit code
4. If test-output.json was created, validate: record count, schema conformance, field coverage, data quality

If the scraper crashes, capture the full error output (selectors, timeouts, module paths) in schemaErrors — the repair agent needs exact error details to diagnose issues.
</instructions>

<output_format>
Return a JSON object as your final response. Each sampleRecords entry must be a JSON-stringified string. Each fieldCoverage entry must be a "fieldName:percentage" string.

{
  "success": true/false,
  "exitCode": 0,
  "timedOut": false,
  "recordCount": 5,
  "schemaErrors": [{ "path": "optional", "message": "error description" }],
  "sampleRecords": ["JSON-stringified record 1", ...],
  "fieldCoverage": ["fieldName:100", "otherField:80", ...],
  "stdout": "...",
  "stderr": "...",
  "durationMs": 1234
}
</output_format>`;
}

/**
 * Stage 5: REPAIR — fix scraper based on test failures
 */
export function buildRepairPrompt(state: PipelineState): string {
	const lastTest = state.testResults[state.testResults.length - 1];
	const testHistory = state.testResults
		.map(
			(t, i) =>
				`  Run ${i + 1}: ${t.success ? "PASS" : "FAIL"} — ${t.recordCount} records, ${t.schemaErrors.length} errors, errors: ${t.schemaErrors.map((e) => e.message).join("; ")}`,
		)
		.join("\n");

	// Detect error category for targeted repair guidance
	const lastError = lastTest?.schemaErrors?.[0]?.message ?? lastTest?.stderr ?? "";
	const isTimeoutError = /timeout/i.test(lastError);
	const isModuleError = /cannot find module/i.test(lastError);
	const isSelectorError = isTimeoutError || /selector|locator/i.test(lastError);
	const isNavigationError = /navigation failed|goto/i.test(lastError);

	// Find the actual search/results URLs from recon
	const searchPages = state.reconReport?.pages?.filter(
		(p: { purpose: string }) => p.purpose === "search" || p.purpose === "listing"
	) ?? [];
	const searchUrls = searchPages.map((p: { url: string }) => p.url).join("\n    ");

	let diagnosisGuidance = "";

	if (isModuleError) {
		diagnosisGuidance = `
<diagnosis type="module_error">
The import paths in index.ts or scraper.ts are likely wrong. The scaffold import should be a relative path from the scraper directory to src/templates/scaffold.ts. Read the files to check the paths and fix them.
</diagnosis>`;
	} else if (isNavigationError) {
		diagnosisGuidance = `
<diagnosis type="navigation_error">
The URL may be wrong or the site may be slow. Check the recon report for correct URLs. The recon found: ${searchUrls}
Use web_probe to verify the URL loads. Increase navigation timeouts if needed. Check for frames/iframes that may contain the actual content.
</diagnosis>`;
	} else if (isSelectorError) {
		diagnosisGuidance = `
<diagnosis type="selector_error">
Elements are not being found on the page. To fix this:
1. Use web_probe on the search/results page to see what elements actually exist: ${searchUrls}
   If there's a search form, use the interactions parameter to fill and submit it, then inspect the results page.
2. Read scraper.ts to see which selectors it uses
3. Compare web_probe output against the scraper's selectors to find the mismatch
4. Fix selectors to match what's actually on the page

Common bugs: page.$() returns one element, page.$$() returns an array. If extractPage iterates rows, use page.$$().
After form submission, the results page may have different HTML structure than expected.
</diagnosis>`;
	} else {
		diagnosisGuidance = `
<diagnosis type="general">
Read the scraper source files, run web_probe on the target site to verify current page structure, and fix the specific error shown in the test report.
</diagnosis>`;
	}

	return `<context>
<scraper_dir>${state.scraperDir}</scraper_dir>
<target_url>${state.targetUrl}</target_url>
<recon_report_path>${state.workDir}/recon-report.json</recon_report_path>
<repair_attempt>${state.repairAttempts}/${state.maxRepairAttempts}</repair_attempt>

<test_history>
${testHistory}
</test_history>

<latest_test_report>
${JSON.stringify(lastTest, null, 2)}
</latest_test_report>
${diagnosisGuidance}
</context>

<instructions>
Fix the scraper based on the test failure. Read the test report and scraper source, then make targeted fixes with edit_file.

For timeout or selector errors, always use web_probe on the target site before making code changes — you need to see what's actually on the page.

Verify after fixing:
- page.$$() (double dollar) for multiple rows, page.$() for single elements
- Selectors match what web_probe shows on the actual page
- Default parameter values match the recon report
- Import paths are correct relative to the scraper directory
</instructions>`;
}

/**
 * Stage 6: HARDEN — add production features to a passing scraper
 */
export function buildHardenPrompt(state: PipelineState): string {
	return `<context>
<scraper_dir>${state.scraperDir}</scraper_dir>
The scraper is currently passing tests.
</context>

<instructions>
Add production features to the working scraper using targeted edit_file calls. Preserve the core extraction logic.

Features to add:
1. Retry logic in scraper.ts — wrap navigation and extraction in a retry helper (3 retries, exponential backoff)
2. Per-record error handling in scraper.ts — catch extraction errors per record, log warnings, continue with remaining records
3. Progress logging in index.ts — log "page N: extracted M records" after each page, totals at end
4. CLI improvements in index.ts — add --delay, --max-pages, --verbose flags; validate required params
5. Graceful degradation in scraper.ts — set optional fields to null on extraction failure; return partial results if pagination fails

Read the files first, then make targeted edits.
</instructions>`;
}
