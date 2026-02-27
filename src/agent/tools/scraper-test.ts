import { z } from "zod";
import { tool } from "stratus-sdk";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

export const scraperTestTool = tool({
	name: "scraper_test",
	description:
		"Run a generated TypeScript scraper with a small record limit and validate its output against its Zod schema. Returns a structured test report with exit code, schema errors, sample records, and field coverage. Use this to verify a scraper works before delivering it.",
	parameters: z.object({
		scraperDir: z
			.string()
			.describe(
				"Path to the scraper directory (must contain index.ts)",
			),
		params: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				"CLI parameters to pass to the scraper (e.g. { startDate: '2025-01-01' })",
			),
		limit: z
			.number()
			.default(5)
			.describe("Maximum records to extract (keeps test fast)"),
		timeoutSeconds: z
			.number()
			.default(120)
			.describe("Maximum seconds before killing the scraper"),
	}),
	execute: async (_ctx, { scraperDir, params, limit, timeoutSeconds }) => {
		const startTime = Date.now();

		// Build CLI args from params
		const cliArgs: string[] = [];
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				cliArgs.push(`--${key}`, String(value));
			}
		}
		cliArgs.push("--limit", String(limit));

		const outputPath = `${scraperDir}/test-output.json`;
		const command = `cd "${scraperDir}" && bun run index.ts ${cliArgs.join(" ")} --output "${outputPath}" 2>&1`;

		const proc = Bun.spawn(["bash", "-c", command], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		let timedOut = false;
		const timeoutId = setTimeout(() => {
			timedOut = true;
			proc.kill();
		}, timeoutSeconds * 1000);

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		clearTimeout(timeoutId);
		const durationMs = Date.now() - startTime;
		const effectiveExitCode = timedOut ? 124 : exitCode;

		// Check if output file was created
		const outputFile = Bun.file(outputPath);
		const outputExists = await outputFile.exists();

		let records: unknown[] = [];
		let recordCount = 0;
		let schemaErrors: unknown[] = [];
		let sampleRecords: unknown[] = [];
		let fieldCoverage: Record<string, number> = {};

		if (outputExists) {
			try {
				const content = await outputFile.text();
				const parsed = JSON.parse(content);
				records = Array.isArray(parsed) ? parsed : [parsed];
				recordCount = records.length;
				sampleRecords = records.slice(0, 3);

				// Analyze field coverage
				if (records.length > 0 && typeof records[0] === "object" && records[0] !== null) {
					const allFields = new Set<string>();
					for (const record of records) {
						if (typeof record === "object" && record !== null) {
							for (const key of Object.keys(record)) {
								allFields.add(key);
							}
						}
					}

					for (const field of allFields) {
						const populated = records.filter((r) => {
							if (typeof r !== "object" || r === null) return false;
							const val = (r as Record<string, unknown>)[field];
							return val !== null && val !== undefined && val !== "";
						}).length;
						fieldCoverage[field] = Math.round(
							(populated / records.length) * 100,
						);
					}
				}
			} catch (err) {
				schemaErrors.push({
					type: "parse_error",
					message: `failed to parse output file: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}

		const report = {
			success:
				effectiveExitCode === 0 &&
				outputExists &&
				recordCount > 0 &&
				schemaErrors.length === 0,
			execution: {
				exitCode: effectiveExitCode,
				timedOut: effectiveExitCode === 124,
				durationMs,
				stdout: truncate(stdout, 2000),
				stderr: truncate(stderr, 1000),
			},
			output: {
				fileCreated: outputExists,
				recordCount,
				sampleRecords,
				fieldCoverage,
			},
			schemaErrors,
		};

		return JSON.stringify(report, null, 2);
	},
});

export const scraperLintTool = tool({
	name: "scraper_lint",
	description:
		"Check a TypeScript scraper for common quality issues: missing error handling, no rate limiting, hardcoded values, missing CLI args. Returns a list of issues to fix.",
	parameters: z.object({
		path: z.string().describe("Path to the scraper file to lint"),
	}),
	execute: async (_ctx, { path }) => {
		const file = Bun.file(path);
		if (!(await file.exists())) {
			return `file not found: ${path}`;
		}

		const code = await file.text();
		const issues: string[] = [];

		if (!code.includes("try") && !code.includes("catch")) {
			issues.push(
				"NO_ERROR_HANDLING: No try/catch blocks — scraper will crash on first error",
			);
		}

		if (
			!code.includes("waitForTimeout") &&
			!code.includes("setTimeout") &&
			!code.includes("delayMs") &&
			!code.includes("delay")
		) {
			issues.push(
				"NO_RATE_LIMITING: No delay between requests — may trigger anti-bot measures",
			);
		}

		if (
			!code.includes("process.argv") &&
			!code.includes("parseArgs") &&
			!code.includes("commander") &&
			!code.includes("params")
		) {
			issues.push(
				"NO_CLI_ARGS: No command-line argument parsing — scraper is not configurable",
			);
		}

		if (!code.includes("console.log") && !code.includes("console.error")) {
			issues.push(
				"NO_LOGGING: No console output — scraper runs silently with no progress indication",
			);
		}

		const urlMatches = code.match(/https?:\/\/[^\s"'`]+/g);
		if (urlMatches && urlMatches.length > 1) {
			issues.push(
				`HARDCODED_URLS: ${urlMatches.length} hardcoded URLs found — consider making the base URL configurable`,
			);
		}

		if (!code.includes("schema") && !code.includes("z.object") && !code.includes("z.array")) {
			issues.push(
				"NO_SCHEMA: No Zod schema validation — output data is not validated",
			);
		}

		if (
			!code.includes("hasNextPage") &&
			!code.includes("pagination") &&
			!code.includes("nextPage")
		) {
			issues.push(
				"NO_PAGINATION: No pagination handling detected — scraper may only get first page",
			);
		}

		return JSON.stringify(
			{
				path,
				issueCount: issues.length,
				issues,
				quality: issues.length === 0
					? "excellent"
					: issues.length <= 2
						? "acceptable"
						: "needs_improvement",
			},
			null,
			2,
		);
	},
});
