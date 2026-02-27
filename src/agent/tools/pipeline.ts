import { z } from "zod";
import { tool } from "stratus-sdk";
import type { Model } from "stratus-sdk";
import { runPipeline, type PipelineOptions } from "../../pipeline/runner.js";
import type { PipelineEvent } from "../../pipeline/state.js";

/**
 * Creates the pipeline tool with a bound model and event callback.
 * Must be created at session init time since it needs the model reference.
 */
export function createPipelineTool(
	model: Model,
	baseDir: string,
	onEvent?: (event: PipelineEvent) => void,
) {
	return tool({
		name: "delegate_pipeline",
		description:
			"Run the automated scraper development pipeline. Takes a target URL and a description of what data to extract, then autonomously: (1) analyzes the site structure, (2) designs a data schema, (3) generates a TypeScript scraper, (4) tests it, (5) repairs any failures, and (6) hardens it for production. Returns the path to the finished scraper. Use this for any request to BUILD a scraper (not for one-off data extraction — use delegate_scraping for that).",
		parameters: z.object({
			url: z
				.string()
				.describe("Target URL to build a scraper for"),
			intent: z
				.string()
				.describe(
					"What data to extract — e.g. 'court records with case number, parties, filing date' or 'product listings with name, price, rating'",
				),
		}),
		execute: async (_ctx, { url, intent }, options) => {
			const { state } = await runPipeline(url, intent, {
				baseDir,
				model,
				onEvent,
				signal: options?.signal,
			});

			if (state.currentStage === "done") {
				const lastTest = state.testResults[state.testResults.length - 1];
				return [
					`pipeline complete — scraper delivered to ${state.scraperDir}`,
					``,
					`files:`,
					`  ${state.scraperDir}/index.ts    — CLI entry point`,
					`  ${state.scraperDir}/scraper.ts  — core scraper config`,
					`  ${state.scraperDir}/schema.ts   — Zod output schema`,
					``,
					`test results: ${lastTest?.recordCount ?? 0} records extracted, ${lastTest?.schemaErrors.length ?? 0} schema errors`,
					`repair attempts: ${state.repairAttempts}`,
					``,
					`run it:`,
					`  cd ${state.scraperDir} && bun run index.ts --output results.json`,
				].join("\n");
			}

			return [
				`pipeline failed at stage: ${state.currentStage}`,
				`error: ${state.error ?? "unknown"}`,
				`repair attempts: ${state.repairAttempts}/${state.maxRepairAttempts}`,
				``,
				`test history:`,
				...state.testResults.map(
					(t, i) =>
						`  run ${i + 1}: ${t.success ? "PASS" : "FAIL"} — ${t.recordCount} records, ${t.schemaErrors.length} errors`,
				),
				``,
				`workspace: ${state.workDir}`,
				`check ${state.workDir}/state.json for full pipeline state`,
			].join("\n");
		},
	});
}
