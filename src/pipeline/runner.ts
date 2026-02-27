import {
	prompt,
	withTrace,
	createCostEstimator,
	MaxBudgetExceededError,
	OutputParseError,
	ModelError,
} from "stratus-sdk";
import type {
	Model,
	Trace,
	ReasoningEffort,
	AgentHooks,
	CostEstimator,
	RunHooks,
	ToolErrorFormatter,
	ToolInputGuardrail,
} from "stratus-sdk";
import { webProbeTool } from "../agent/tools/probe.js";
import { webInterceptApiTool } from "../agent/tools/intercept.js";
import { scraperTestTool, scraperLintTool } from "../agent/tools/scraper-test.js";
import {
	type PipelineState,
	type PipelineEvent,
	type PipelineStage,
	type ReconReport,
	type TestReport,
	type ReconReportOutput,
	type TestReportOutput,
	ReconReportOutput as ReconReportOutputSchema,
	TestReportOutput as TestReportOutputSchema,
	createInitialState,
	saveState,
	slugify,
} from "./state.js";
import {
	buildReconExplorePrompt,
	buildReconSynthesizePrompt,
	buildSchemaPrompt,
	buildCodegenPrompt,
	buildTestPrompt,
	buildRepairPrompt,
	buildHardenPrompt,
} from "./stages/index.js";
import { readFileTool, writeFileTool, editFileTool, globFilesTool } from "../agent/tools/files.js";
import { bashTool } from "../agent/tools/bash.js";
import { grepTool } from "../agent/tools/grep.js";
// ─── Stage budgets and reasoning effort ──────────────────────────────────

const STAGE_BUDGETS: Record<string, number> = {
	recon: 100,
	schema: 100,
	codegen: 100,
	test: 100,
	repair: 100,
	harden: 100,
};

const STAGE_REASONING: Record<string, ReasoningEffort> = {
	recon: "medium",
	schema: "low",
	codegen: "high",
	test: "low",
	repair: "high",
	harden: "medium",
};

export interface PipelineOptions {
	/** Base directory for pipeline workspaces */
	baseDir: string;

	/** LLM model to use for all stages */
	model: Model;

	/** Maximum repair attempts before failing */
	maxRepairAttempts?: number;

	/** Callback for pipeline events (for TUI) */
	onEvent?: (event: PipelineEvent) => void;

	/** Abort signal */
	signal?: AbortSignal;

	/** Cost estimator for budget enforcement (optional — uses default if not provided) */
	costEstimator?: CostEstimator;
}

// ─── Default cost estimator (Claude Sonnet pricing) ──────────────────────

const DEFAULT_COST_ESTIMATOR = createCostEstimator({
	inputTokenCostPer1k: 0.003,
	outputTokenCostPer1k: 0.015,
	cachedInputTokenCostPer1k: 0.0003,
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Verify that expected output files exist after a stage.
 * Returns the first missing file path, or null if all exist.
 */
async function checkFiles(paths: string[]): Promise<string | null> {
	for (const p of paths) {
		if (!(await Bun.file(p).exists())) return p;
	}
	return null;
}

/**
 * Run a file-writing pipeline stage with retry. If the expected output file
 * is missing after the first attempt, retry once with a stronger prompt.
 * Used for SCHEMA, CODEGEN, and HARDEN stages (which write files directly).
 */
async function runStageWithRetry(
	taskPrompt: string,
	config: Parameters<typeof prompt>[1],
	expectedFiles: string[],
	retryHint: string,
): Promise<void> {
	// First attempt
	await prompt(taskPrompt, config);

	const missing = await checkFiles(expectedFiles);
	if (!missing) return; // Success

	// Retry with explicit demand
	const retryPrompt = `${taskPrompt}\n\n<retry_context>\nThe previous attempt did not write the required file: ${missing}\n${retryHint}\nSave your output using write_file.\n</retry_context>`;
	await prompt(retryPrompt, config);
}

/**
 * Build an onStop hook that emits a stage_error event.
 */
function makeOnStopHook(
	stage: PipelineStage,
	emit: (event: PipelineEvent) => void,
): AgentHooks {
	return {
		onStop: ({ reason }) => {
			emit({
				type: "stage_error",
				stage,
				error: `Stage stopped: ${reason}`,
			});
		},
	};
}

/**
 * Build a ToolErrorFormatter that produces clean stage-prefixed error messages.
 * Strips stack traces so the LLM gets a concise error.
 */
function makeToolErrorFormatter(stage: PipelineStage): ToolErrorFormatter {
	return (toolName: string, error: unknown) => {
		let message: string;
		if (error instanceof Error) {
			// First line of the message only — strip stack traces
			message = error.message.split("\n")[0] ?? error.message;
		} else {
			message = String(error);
		}
		return `[${stage}] tool '${toolName}' failed: ${message}`;
	};
}

/**
 * Build RunHooks that emit granular tool-level events within a pipeline stage.
 * Lets the TUI show which tool is active inside each stage.
 */
function makePipelineRunHooks(
	stage: PipelineStage,
	emit: (event: PipelineEvent) => void,
): RunHooks {
	const toolTimers = new Map<string, number>();
	return {
		onToolStart: ({ toolName }) => {
			toolTimers.set(toolName, Date.now());
			emit({ type: "stage_tool_start", stage, tool: toolName });
		},
		onToolEnd: ({ toolName }) => {
			const start = toolTimers.get(toolName) ?? Date.now();
			toolTimers.delete(toolName);
			emit({ type: "stage_tool_end", stage, tool: toolName, durationMs: Date.now() - start });
		},
	};
}

/**
 * Build a ToolInputGuardrail that blocks dangerous bash commands in pipeline stages.
 */
function makeBashGuardrail(workDir: string): ToolInputGuardrail {
	const BLOCKED_PATTERNS = [
		/\brm\s+-rf\s+\/(?:\s|$)/,          // rm -rf /
		/\brm\s+-rf\s+~(?:\s|$)/,            // rm -rf ~
		/\brm\s+-rf\s+\$HOME\b/,             // rm -rf $HOME
		/\bgit\s+push\s+--force\b/,          // git push --force
		/\bgit\s+push\s+-f\b/,               // git push -f
	];

	return {
		name: "bash_safety",
		execute: ({ toolName, toolArgs }) => {
			if (toolName !== "bash") return { tripwireTriggered: false };

			const command = String(toolArgs.command ?? "");

			// Check blocked patterns
			for (const pattern of BLOCKED_PATTERNS) {
				if (pattern.test(command)) {
					return { tripwireTriggered: true, outputInfo: `blocked dangerous command: ${command.slice(0, 80)}` };
				}
			}

			// Block commands that reference paths outside workDir
			const absPathMatch = command.match(/(?:^|\s)(\/[^\s]+)/g);
			if (absPathMatch) {
				for (const match of absPathMatch) {
					const path = match.trim();
					if (path !== "/" && !path.startsWith(workDir) && !path.startsWith("/tmp") && !path.startsWith("/dev/null")) {
						return { tripwireTriggered: true, outputInfo: `blocked path outside workDir: ${path}` };
					}
				}
			}

			return { tripwireTriggered: false };
		},
	};
}

/**
 * Detect transient API errors that are worth retrying (rate limits, response failures).
 */
function isTransientApiError(err: unknown): boolean {
	if (err instanceof ModelError) {
		if (err.status === 429) return true;
		if (err.message.includes("rate limit") || err.message.includes("Too Many Requests")) return true;
		if (err.message.includes("Response failed")) return true;
		if (err.message.includes("network error")) return true;
	}
	if (err instanceof Error) {
		if (err.message.includes("rate limit") || err.message.includes("Too Many Requests")) return true;
		if (err.message.includes("timed out") || err.message.includes("ETIMEDOUT") || err.message.includes("ECONNRESET")) return true;
	}
	return false;
}

/**
 * Extract useful findings from a prompt() result's message history.
 * Pulls assistant analysis text and tool results (web_probe, web_intercept_api output).
 */
function extractFindings(messages: Array<{ role: string; content?: string | null }>): string {
	const parts: string[] = [];
	for (const msg of messages) {
		if (msg.role === "assistant" && msg.content) {
			parts.push(msg.content);
		} else if (msg.role === "tool" && msg.content) {
			// Tool results contain web_probe HTML analysis, API intercepts, etc.
			parts.push(msg.content);
		}
	}
	const combined = parts.join("\n\n");
	// Truncate to ~15k chars to leave room in the synthesis prompt
	return combined.slice(0, 15000);
}

/** Replace null with undefined throughout an object (shallow on specified keys). */
function n2u<T>(val: T | null): T | undefined {
	return val === null ? undefined : val;
}

/**
 * Convert a ReconReportOutput (output-safe, nullable fields, stringified entries)
 * back to a ReconReport (rich objects, optional fields) for internal state storage.
 */
function reconOutputToReport(output: ReconReportOutput): ReconReport {
	return {
		...output,
		pages: output.pages.map((p) => ({
			url: p.url,
			purpose: p.purpose,
			formFields: n2u(p.formFields?.map((f) => ({
				...f,
				options: n2u(f.options),
			}))),
			dataElements: n2u(p.dataElements?.map((d) => ({
				...d,
				sampleValue: n2u(d.sampleValue),
			}))),
			pagination: p.pagination ? {
				type: p.pagination.type,
				selector: n2u(p.pagination.selector),
				paramName: n2u(p.pagination.paramName),
			} : undefined,
		})),
		apiEndpoints: n2u(output.apiEndpoints?.map((e) => ({
			...e,
			contentType: n2u(e.contentType),
			responseShape: n2u(e.responseShape),
		}))),
		sampleData: output.sampleData?.map((s) => {
			try { return JSON.parse(s); } catch { return { raw: s }; }
		}),
	} as ReconReport;
}

/**
 * Convert a TestReportOutput (output-safe) back to a TestReport (rich objects).
 */
function testOutputToReport(output: TestReportOutput): TestReport {
	return {
		...output,
		schemaErrors: output.schemaErrors.map((e) => ({
			message: e.message,
			path: n2u(e.path),
		})),
		sampleRecords: output.sampleRecords.map((s) => {
			try { return JSON.parse(s); } catch { return { raw: s }; }
		}),
		fieldCoverage: Object.fromEntries(
			output.fieldCoverage.map((entry) => {
				const [key, val] = entry.split(":");
				return [key, Number(val) || 0];
			}),
		),
	};
}

/**
 * Run the full scraper development pipeline.
 * RECON → SCHEMA → CODEGEN → TEST ⇄ REPAIR → HARDEN → DONE
 *
 * Wrapped in withTrace() for automatic instrumentation of all
 * model calls, tool executions, and subagent runs.
 */
export async function runPipeline(
	targetUrl: string,
	userIntent: string,
	options: PipelineOptions,
): Promise<{ state: PipelineState; trace: Trace }> {
	const {
		baseDir,
		model,
		maxRepairAttempts = 20,
		onEvent,
		signal,
		costEstimator = DEFAULT_COST_ESTIMATOR,
	} = options;

	const projectName = slugify(userIntent);
	const workDir = `${baseDir}/.noctua/pipelines/${projectName}`;

	// Ensure directories exist
	await Bun.write(`${workDir}/.keep`, "");
	const scraperDir = `${workDir}/scraper`;
	await Bun.write(`${scraperDir}/.keep`, "");

	const state = createInitialState(projectName, targetUrl, userIntent, workDir);
	state.maxRepairAttempts = maxRepairAttempts;
	state.scraperDir = scraperDir;

	const emit = (event: PipelineEvent) => onEvent?.(event);
	const bashGuardrail = makeBashGuardrail(workDir);

	const { result: pipelineState, trace } = await withTrace("pipeline", async () => {
		// ─── Debug log helper ────────────────────────────────────────
		const debugLogPath = `${workDir}/debug.log`;
		const debugLog = async (msg: string) => {
			const line = `[${new Date().toISOString()}] ${msg}\n`;
			const file = Bun.file(debugLogPath);
			const existing = await file.exists() ? await file.text() : "";
			await Bun.write(debugLogPath, existing + line);
		};

		// ─── Tool sets ───────────────────────────────────────────────
		// Recon only needs high-level analysis tools — not low-level Playwright primitives.
		// web_probe does navigate + render + full page analysis in one call.
		// web_intercept_api discovers hidden JSON APIs behind SPAs.
		const reconTools = [webProbeTool, webInterceptApiTool, readFileTool];
		const codeTools = [bashTool, readFileTool, writeFileTool, editFileTool, globFilesTool, grepTool];
		const testTools = [bashTool, readFileTool, scraperTestTool, scraperLintTool, globFilesTool];
		const repairTools = [bashTool, readFileTool, writeFileTool, editFileTool, webProbeTool, globFilesTool];

		try {
			// ── Stage 1: RECON (two-phase: explore → synthesize) ─────────
			emit({ type: "stage_start", stage: "recon" });
			await debugLog("recon phase 1: exploring site with tools...");

			const reconReportPath = `${workDir}/recon-report.json`;

			// Phase 1: EXPLORE — tools, no outputType (with retry for transient API errors)
			let exploreResult;
			const maxExploreAttempts = 3;
			for (let attempt = 1; attempt <= maxExploreAttempts; attempt++) {
				try {
					exploreResult = await prompt(buildReconExplorePrompt(state), {
						model,
						tools: reconTools,
						maxTurns: 1000,
						costEstimator,
						maxBudgetUsd: STAGE_BUDGETS.recon * 0.7,
						modelSettings: { reasoningEffort: STAGE_REASONING.recon },
						hooks: makeOnStopHook("recon", emit),
						runHooks: makePipelineRunHooks("recon", emit),
						toolErrorFormatter: makeToolErrorFormatter("recon"),
						instructions: `You are a site reconnaissance agent. Explore the target website using the provided tools and summarize your findings. Be efficient — commit to an approach after initial exploration rather than exhaustively probing every page.`,
					});
					break; // success
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					if (isTransientApiError(err) && attempt < maxExploreAttempts) {
						const backoffMs = 30000 * Math.pow(2, attempt - 1); // 30s, 60s
						await debugLog(`explore attempt ${attempt} failed (transient): ${msg} — retrying in ${backoffMs}ms`);
						await new Promise(r => setTimeout(r, backoffMs));
						continue;
					}
					state.currentStage = "failed";
					state.error = `recon explore phase threw: ${msg}`;
					await saveState(state);
					await debugLog(`explore threw: ${msg}`);
					emit({ type: "pipeline_failed", reason: state.error, stage: "recon" });
					return state;
				}
			}

			// exploreResult is guaranteed set — the loop either breaks on success or returns on failure
			if (!exploreResult) throw new Error("unreachable: explore loop exited without result");

			// Log explore results to debug file
			const msgCount = exploreResult.messages?.length ?? 0;
			const outputLen = exploreResult.output?.length ?? 0;
			const turns = exploreResult.numTurns ?? 0;
			const cost = exploreResult.totalCostUsd?.toFixed(3) ?? "?";
			const finish = exploreResult.finishReason ?? "unknown";
			await debugLog(`explore done: ${turns} turns, ${msgCount} messages, ${outputLen} chars output, finishReason=${finish}, cost=$${cost}`);

			// Extract findings from the exploration
			const findings = exploreResult.output
				? exploreResult.output.slice(0, 15000)
				: extractFindings(exploreResult.messages as Array<{ role: string; content?: string | null }>);

			const findingsLen = findings?.trim().length ?? 0;
			const findingsSource = exploreResult.output ? "model output" : "message history";
			await debugLog(`extracted ${findingsLen} chars of findings (source: ${findingsSource})`);

			// Save findings for debugging
			await Bun.write(`${workDir}/findings.txt`, findings);

			if (findingsLen < 50) {
				state.currentStage = "failed";
				state.error = `recon explore produced no useful findings — ${turns} turns, ${msgCount} messages, ${outputLen} chars output, finishReason=${finish}`;
				await saveState(state);
				emit({ type: "pipeline_failed", reason: state.error, stage: "recon" });
				return state;
			}

			// Phase 2: SYNTHESIZE — outputType for structured output
			// Wait after explore to avoid Azure API rate limits (429 via SSE)
			await debugLog("recon phase 2: cooldown before synthesize...");
			await new Promise(r => setTimeout(r, 15000));

			const maxSynthAttempts = 3;
			let lastSynthError = "";
			for (let synthAttempt = 1; synthAttempt <= maxSynthAttempts; synthAttempt++) {
				await debugLog(`synthesize attempt ${synthAttempt}...`);

				const synthPrompt = buildReconSynthesizePrompt(state, findings);

				try {
					const synthesizeResult = await prompt(synthPrompt, {
						model,
						outputType: ReconReportOutputSchema,
						maxTurns: 1,
						costEstimator,
						maxBudgetUsd: STAGE_BUDGETS.recon * 0.3,
						modelSettings: { reasoningEffort: "medium" },
						instructions: `Convert site exploration findings into the structured JSON report schema. Fill in all required fields based on the analysis provided.`,
					});

					const synthOutputLen = synthesizeResult.output?.length ?? 0;
					const synthFinish = synthesizeResult.finishReason ?? "unknown";
					await debugLog(`synthesize attempt ${synthAttempt}: outputLen=${synthOutputLen}, finishReason=${synthFinish}, hasFinalOutput=${!!synthesizeResult.finalOutput}`);

					// Save raw output for debugging
					if (synthesizeResult.output) {
						await Bun.write(`${workDir}/synth-attempt-${synthAttempt}.txt`, synthesizeResult.output);
					}

					if (synthesizeResult.finalOutput) {
						await debugLog(`synthesize succeeded on attempt ${synthAttempt}`);
						await Bun.write(reconReportPath, JSON.stringify(synthesizeResult.finalOutput, null, 2));
						state.reconReport = reconOutputToReport(synthesizeResult.finalOutput as ReconReportOutput);
						break;
					}

					// finalOutput undefined — try parsing raw output with Zod as fallback
					if (synthOutputLen > 0) {
						try {
							const parsed = JSON.parse(synthesizeResult.output!);
							const validation = ReconReportOutputSchema.safeParse(parsed);
							if (validation.success) {
								await debugLog(`synthesize succeeded via fallback parse on attempt ${synthAttempt}`);
								await Bun.write(reconReportPath, JSON.stringify(validation.data, null, 2));
								state.reconReport = reconOutputToReport(validation.data);
								break;
							}
							lastSynthError = `Zod validation: ${validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
						} catch {
							lastSynthError = `Output ${synthOutputLen} chars, not valid JSON (finishReason=${synthFinish})`;
						}
					} else {
						lastSynthError = `Empty output (finishReason=${synthFinish})`;
					}
					await debugLog(`synthesize attempt ${synthAttempt} failed: ${lastSynthError}`);
				} catch (err) {
					if (err instanceof OutputParseError) {
						lastSynthError = `OutputParseError: ${err.message}`;
					} else if (isTransientApiError(err)) {
						lastSynthError = `Rate limited: ${err instanceof Error ? err.message : String(err)}`;
					} else {
						throw err;
					}
					await debugLog(`synthesize attempt ${synthAttempt}: ${lastSynthError}`);
				}

				// Exponential backoff between retries (rate limit mitigation)
				if (synthAttempt < maxSynthAttempts && !state.reconReport) {
					const backoffMs = 15000 * Math.pow(2, synthAttempt - 1); // 15s, 30s
					await debugLog(`backing off ${backoffMs}ms before retry...`);
					await new Promise(r => setTimeout(r, backoffMs));
				}
			}

			if (!state.reconReport) {
				state.currentStage = "failed";
				state.error = `recon synthesize failed after ${maxSynthAttempts} attempts — had ${findingsLen} chars of findings but could not produce valid structured report. Last error: ${lastSynthError}`;
				await saveState(state);
				emit({ type: "pipeline_failed", reason: state.error, stage: "recon" });
				return state;
			}

			state.currentStage = "schema";
			await saveState(state);
			emit({
				type: "stage_complete",
				stage: "recon",
				durationMs: 0,
				summary: `found ${state.reconReport.pages.length} page(s), strategy: ${state.reconReport.suggestedStrategy}`,
			});

			if (signal?.aborted) return state;

			// ── Stage 2: SCHEMA (file-writing, uses retry) ───────────────
			emit({ type: "stage_start", stage: "schema" });

			const schemaPath = `${scraperDir}/schema.ts`;

			await runStageWithRetry(
				buildSchemaPrompt(state),
				{
					model,
					tools: codeTools,
					maxTurns: 1000,
					costEstimator,
					maxBudgetUsd: STAGE_BUDGETS.schema,
					modelSettings: { reasoningEffort: STAGE_REASONING.schema },
					hooks: makeOnStopHook("schema", emit),
					runHooks: makePipelineRunHooks("schema", emit),
					toolErrorFormatter: makeToolErrorFormatter("schema"),
					toolInputGuardrails: [bashGuardrail],
					instructions: `You are a schema designer. Read the recon report with read_file, then generate and save the Zod schema file using write_file.`,
				},
				[schemaPath],
				"You must call: write_file({ path: \"" + schemaPath + "\", content: <your TypeScript schema> })",
			);

			const schemaMissing = await checkFiles([schemaPath]);
			if (schemaMissing) {
				state.currentStage = "failed";
				state.error = `schema stage did not produce ${schemaMissing}`;
				await saveState(state);
				emit({ type: "pipeline_failed", reason: state.error, stage: "schema" });
				return state;
			}

			state.schemaPath = schemaPath;
			state.currentStage = "codegen";
			await saveState(state);
			emit({ type: "stage_complete", stage: "schema", durationMs: 0 });

			if (signal?.aborted) return state;

			// ── Stage 3: CODEGEN (file-writing, uses retry) ──────────────
			emit({ type: "stage_start", stage: "codegen" });

			const scraperTsPath = `${scraperDir}/scraper.ts`;
			const indexTsPath = `${scraperDir}/index.ts`;

			await runStageWithRetry(
				buildCodegenPrompt(state),
				{
					model,
					tools: codeTools,
					maxTurns: 1000,
					costEstimator,
					maxBudgetUsd: STAGE_BUDGETS.codegen,
					modelSettings: { reasoningEffort: STAGE_REASONING.codegen },
					hooks: makeOnStopHook("codegen", emit),
					runHooks: makePipelineRunHooks("codegen", emit),
					toolErrorFormatter: makeToolErrorFormatter("codegen"),
					toolInputGuardrails: [bashGuardrail],
					instructions: `You are a scraper code generator. Read the recon report and schema with read_file, then create both scraper.ts and index.ts using write_file. The scraper uses Playwright for browser automation and the index.ts supports --limit and --output CLI flags.`,
				},
				[scraperTsPath, indexTsPath],
				"You must create BOTH files:\n  write_file({ path: \"" + scraperTsPath + "\", content: ... })\n  write_file({ path: \"" + indexTsPath + "\", content: ... })",
			);

			const codegenMissing = await checkFiles([scraperTsPath, indexTsPath]);
			if (codegenMissing) {
				state.currentStage = "failed";
				state.error = `codegen stage did not produce ${codegenMissing}`;
				await saveState(state);
				emit({ type: "pipeline_failed", reason: state.error, stage: "codegen" });
				return state;
			}

			state.currentStage = "test";
			await saveState(state);
			emit({ type: "stage_complete", stage: "codegen", durationMs: 0 });

			if (signal?.aborted) return state;

			// ── Stage 4-5: TEST ⇄ REPAIR LOOP ───────────────────────────

			while (state.repairAttempts <= maxRepairAttempts) {
				if (signal?.aborted) return state;

				// TEST (outputType — no file writing needed)
				emit({ type: "stage_start", stage: "test" });

				const testResult = await prompt(buildTestPrompt(state), {
					model,
					tools: testTools,
					maxTurns: 1000,
					outputType: TestReportOutputSchema,
					costEstimator,
					maxBudgetUsd: STAGE_BUDGETS.test,
					modelSettings: { reasoningEffort: STAGE_REASONING.test },
					hooks: makeOnStopHook("test", emit),
					runHooks: makePipelineRunHooks("test", emit),
					toolErrorFormatter: makeToolErrorFormatter("test"),
					toolInputGuardrails: [bashGuardrail],
					instructions: `You are a scraper test runner. Run the scraper using bash, check the exit code and output, then return the JSON test report as your final response.`,
				});

				let testReport: TestReport | undefined;
				if (testResult.finalOutput) {
					testReport = testOutputToReport(testResult.finalOutput);
					// Persist for repair stage to read
					const testReportPath = `${workDir}/test-report.json`;
					await Bun.write(testReportPath, JSON.stringify(testReport, null, 2));
				}

				if (testReport) {
					state.testResults.push(testReport);
					emit({ type: "test_result", report: testReport, attempt: state.repairAttempts + 1 });
				}

				const passed = testReport?.success ?? false;

				emit({
					type: "stage_complete",
					stage: "test",
					durationMs: 0,
					summary: passed
						? `PASS — ${testReport?.recordCount ?? 0} records`
						: testReport
							? `FAIL — ${testReport.recordCount} records, ${testReport.schemaErrors.length} errors`
							: "FAIL — no test report produced",
				});

				if (passed) {
					state.currentStage = "harden";
					await saveState(state);
					break;
				}

				// Max repairs exceeded
				if (state.repairAttempts >= maxRepairAttempts) {
					state.currentStage = "failed";
					state.error = `max repair attempts (${maxRepairAttempts}) exceeded`;
					await saveState(state);
					emit({ type: "pipeline_failed", reason: state.error, stage: "repair" });
					return state;
				}

				// REPAIR
				state.repairAttempts++;
				emit({ type: "repair_attempt", attempt: state.repairAttempts, maxAttempts: maxRepairAttempts });
				emit({ type: "stage_start", stage: "repair" });

				await prompt(buildRepairPrompt(state), {
					model,
					tools: repairTools,
					maxTurns: 1000,
					costEstimator,
					maxBudgetUsd: STAGE_BUDGETS.repair,
					modelSettings: { reasoningEffort: STAGE_REASONING.repair },
					hooks: makeOnStopHook("repair", emit),
					runHooks: makePipelineRunHooks("repair", emit),
					toolErrorFormatter: makeToolErrorFormatter("repair"),
					toolInputGuardrails: [bashGuardrail],
					instructions: `You are a scraper repair agent. Read the test report and scraper source, then fix the issues with targeted edit_file changes. For selector/timeout errors, use web_probe on the target site first to see what's actually on the page before making code changes.`,
				});

				state.currentStage = "test";
				await saveState(state);
				emit({
					type: "stage_complete",
					stage: "repair",
					durationMs: 0,
					summary: `repair attempt ${state.repairAttempts}/${maxRepairAttempts}`,
				});
			}

			if (signal?.aborted) return state;

			// ── Stage 6: HARDEN (file-writing, no retry) ─────────────────
			if (state.currentStage === "harden") {
				emit({ type: "stage_start", stage: "harden" });

				await prompt(buildHardenPrompt(state), {
					model,
					tools: codeTools,
					maxTurns: 1000,
					costEstimator,
					maxBudgetUsd: STAGE_BUDGETS.harden,
					modelSettings: { reasoningEffort: STAGE_REASONING.harden },
					hooks: makeOnStopHook("harden", emit),
					runHooks: makePipelineRunHooks("harden", emit),
					toolErrorFormatter: makeToolErrorFormatter("harden"),
					toolInputGuardrails: [bashGuardrail],
					instructions: `You are a scraper hardening agent. Read the scraper files first, then use edit_file for targeted improvements. Preserve the core extraction logic — only add production features like retry logic, rate limiting, progress logging, and CLI validation.`,
				});

				state.currentStage = "done";
				state.completedAt = new Date().toISOString();
				await saveState(state);
				emit({ type: "stage_complete", stage: "harden", durationMs: 0 });

				const lastTest = state.testResults[state.testResults.length - 1];
				emit({
					type: "pipeline_complete",
					scraperDir: state.scraperDir!,
					recordCount: lastTest?.recordCount ?? 0,
				});
			}
		} catch (err) {
			if (err instanceof MaxBudgetExceededError) {
				const msg = `Budget exceeded in stage ${state.currentStage}: spent $${err.spentUsd.toFixed(2)} of $${err.budgetUsd.toFixed(2)} limit`;
				emit({ type: "stage_error", stage: state.currentStage, error: msg });
				state.currentStage = "failed";
				state.error = msg;
			} else if (err instanceof OutputParseError) {
				const msg = `Structured output parse failed in stage ${state.currentStage}: ${err.message}`;
				emit({ type: "stage_error", stage: state.currentStage, error: msg });
				state.currentStage = "failed";
				state.error = msg;
			} else {
				state.currentStage = "failed";
				state.error = err instanceof Error ? err.message : String(err);
				emit({ type: "pipeline_failed", reason: state.error, stage: state.currentStage });
			}
			await saveState(state);
		}

		return state;
	});

	return { state: pipelineState, trace };
}
