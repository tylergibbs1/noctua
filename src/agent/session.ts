import { createSession, createCostEstimator, type Session } from "stratus-sdk";
import { AzureResponsesModel } from "stratus-sdk";
import type { StreamEvent } from "stratus-sdk";
import { createSystemPrompt } from "./system-prompt.js";
import { createSubagents, setSubagentEventCallback } from "./subagents.js";
import { readFileTool, writeFileTool, listDirectoryTool, globFilesTool } from "./tools/files.js";
import { bashTool } from "./tools/bash.js";
import { grepTool } from "./tools/grep.js";
import { createPipelineTool } from "./tools/pipeline.js";
import { logger } from "../tui/utils/logger.js";
import type { PipelineEvent } from "../pipeline/state.js";
import type {
	ToolStartEvent,
	ToolEndEvent,
	ToolErrorEvent,
	SubagentInnerEvent,
} from "../tui/components/ToolEventView.js";

export type UsageMetrics = {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	durationMs: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	totalCostUsd: number;
};

export type QueryCallbacks = {
	onToolStart?: (event: ToolStartEvent) => void;
	onToolEnd?: (event: ToolEndEvent) => void;
	onToolError?: (event: ToolErrorEvent) => void;
	onSubagentInnerEvent?: (agentName: string, event: SubagentInnerEvent) => void;
	onPipelineEvent?: (event: PipelineEvent) => void;
	onText?: (text: string) => void;
	onComplete?: (answer: string) => void;
	onError?: (error: string) => void;
};

export type QueryResult = {
	answer: string;
	sessionId?: string;
	usage?: UsageMetrics;
};

// ─── Context ───────────────────────────────────────────────────────────────

export interface NoctuaContext {
	cwd: string;
	platform: string;
	deployment: string;
}

function buildContext(): NoctuaContext {
	return {
		cwd: process.cwd(),
		platform: process.platform,
		deployment: process.env.AZURE_DEPLOYMENT ?? "gpt-5.2-codex",
	};
}

// ─── Cost estimator ────────────────────────────────────────────────────────

// gpt-5.2-codex pricing (per 1k tokens)
const costEstimator = createCostEstimator({
	inputTokenCostPer1k: 0.002,
	outputTokenCostPer1k: 0.008,
	cachedInputTokenCostPer1k: 0.001,
});

// ─── Persistent session ────────────────────────────────────────────────────

let session: Session<NoctuaContext> | null = null;
let lastPipelineResult: string | undefined;

// Mutable ref so hooks/tools always read the current query's callbacks.
// Updated at the start of each runQuery() call.
let activeCallbacks: QueryCallbacks = {};

function createModel(): AzureResponsesModel {
	const endpoint = process.env.AZURE_ENDPOINT;
	const apiKey = process.env.AZURE_API_KEY;
	const deployment = process.env.AZURE_DEPLOYMENT ?? "gpt-5.2-codex";

	if (!endpoint || !apiKey) {
		throw new Error("AZURE_ENDPOINT and AZURE_API_KEY must be set");
	}

	return new AzureResponsesModel({
		endpoint,
		apiKey,
		deployment,
	});
}

function getOrCreateSession(): Session<NoctuaContext> {
	if (session) return session;

	const model = createModel();
	const { scraperSubagent, coderSubagent } = createSubagents(model);

	// Wire subagent inner events — reads from activeCallbacks
	setSubagentEventCallback((agentName, event) => {
		activeCallbacks.onSubagentInnerEvent?.(agentName, event);
	});

	// Create pipeline tool — reads from activeCallbacks
	const pipelineTool = createPipelineTool(
		model,
		process.cwd(),
		(event) => activeCallbacks.onPipelineEvent?.(event),
	);

	// Track tool timing for hooks
	const toolTimers = new Map<string, number>();

	session = createSession<NoctuaContext>({
		model,
		// Dynamic instructions — inject runtime context
		instructions: (ctx: NoctuaContext) => createSystemPrompt(ctx),
		tools: [
			bashTool,
			readFileTool,
			writeFileTool,
			listDirectoryTool,
			globFilesTool,
			grepTool,
			pipelineTool,
		],
		subagents: [scraperSubagent, coderSubagent],
		context: buildContext(),
		maxTurns: 5000,
		costEstimator,
		modelSettings: {
			maxTokens: 128000,
			promptCacheKey: "noctua-orchestrator",
			truncation: "auto",
		},
		hooks: {
			beforeToolCall: ({ toolCall }) => {
				const name = toolCall.function.name;
				toolTimers.set(toolCall.id, Date.now());

				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(toolCall.function.arguments);
				} catch {
					// leave empty
				}

				activeCallbacks.onToolStart?.({
					type: "tool_start",
					tool: name,
					args,
				});
			},

			afterToolCall: ({ toolCall, result }) => {
				const name = toolCall.function.name;
				const startTime = toolTimers.get(toolCall.id) ?? Date.now();
				toolTimers.delete(toolCall.id);

				// Capture pipeline result for fallback answer
				if (name === "delegate_pipeline") {
					lastPipelineResult = result;
				}

				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(toolCall.function.arguments);
				} catch {
					// leave empty
				}

				activeCallbacks.onToolEnd?.({
					type: "tool_end",
					tool: name,
					args,
					result: result.slice(0, 200),
					duration: Date.now() - startTime,
				});
			},
		},
	});

	return session;
}

export function clearSession(): void {
	if (session) {
		session.close();
		session = null;
	}
}

export function getSessionId(): string | undefined {
	return session?.id;
}

// ─── Query ─────────────────────────────────────────────────────────────────

export async function runQuery(
	prompt: string,
	callbacks: QueryCallbacks = {},
	options: { signal?: AbortSignal } = {},
): Promise<QueryResult> {
	logger.info("starting query", { deployment: process.env.AZURE_DEPLOYMENT });

	// Point all hooks/tools at this query's callbacks
	activeCallbacks = callbacks;

	const sess = getOrCreateSession();
	const startTime = Date.now();
	let resultText = "";

	sess.send(prompt);

	const pendingTools = new Map<
		string,
		{ name: string; args: string; startTime: number }
	>();

	try {
		for await (const event of sess.stream({ signal: options.signal })) {
			if (options.signal?.aborted) break;

			switch (event.type) {
				case "content_delta": {
					resultText += event.content;
					callbacks.onText?.(event.content);
					break;
				}

				case "tool_call_start": {
					const { id, name } = event.toolCall;
					pendingTools.set(id, {
						name,
						args: "",
						startTime: Date.now(),
					});
					break;
				}

				case "tool_call_delta": {
					const pending = pendingTools.get(event.toolCallId);
					if (pending) {
						pending.args += event.arguments;
					}
					break;
				}

				case "tool_call_done": {
					pendingTools.delete(event.toolCallId);
					break;
				}

				case "hosted_tool_call": {
					if (event.status === "completed") {
						callbacks.onToolEnd?.({
							type: "tool_end",
							tool: event.toolType,
							args: {},
							result: "completed",
							duration: 0,
						});
					} else {
						callbacks.onToolStart?.({
							type: "tool_start",
							tool: event.toolType,
							args: {},
						});
					}
					break;
				}

				case "done": {
					pendingTools.clear();
					break;
				}
			}
		}

		const runResult = await sess.result;
		let finalOutput = runResult.output ?? resultText;
		const durationMs = Date.now() - startTime;

		if (!finalOutput.trim() && runResult.finishReason === "length") {
			finalOutput =
				"ran out of context space before finishing — try `/new` to start a fresh session, or ask a more targeted question";
		} else if (!finalOutput.trim() && lastPipelineResult) {
			finalOutput = lastPipelineResult;
			lastPipelineResult = undefined;
		} else if (!finalOutput.trim()) {
			finalOutput =
				"completed tool calls but produced no text response — the task may be done, or try rephrasing";
		}

		let usage: UsageMetrics | undefined;
		if (runResult.usage) {
			const u = runResult.usage;
			usage = {
				inputTokens: u.promptTokens,
				outputTokens: u.completionTokens,
				totalTokens: u.totalTokens,
				durationMs,
				cacheReadInputTokens: u.cacheReadTokens ?? 0,
				cacheCreationInputTokens: u.cacheCreationTokens ?? 0,
				totalCostUsd: runResult.totalCostUsd,
			};
		}

		callbacks.onComplete?.(finalOutput);

		if (usage) {
			logger.info("query complete", {
				tokens: usage.totalTokens,
				cached: usage.cacheReadInputTokens,
				cost: `$${usage.totalCostUsd.toFixed(4)}`,
				duration: `${Math.round(usage.durationMs / 1000)}s`,
				turns: runResult.numTurns,
				messages: sess.messages.length,
			});
		}

		return { answer: finalOutput, sessionId: sess.id, usage };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		callbacks.onError?.(msg);
		throw err;
	} finally {
		// Don't leave stale callbacks pointing at completed query state
		activeCallbacks = {};
	}
}
