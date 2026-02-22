import { Agent, createSession, type Session } from "stratus-sdk";
import { AzureResponsesModel } from "stratus-sdk";
import type { StreamEvent } from "stratus-sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { createSubagents, setSubagentEventCallback } from "./subagents.js";
import { readFileTool, writeFileTool, listDirectoryTool, globFilesTool } from "./tools/files.js";
import { bashTool } from "./tools/bash.js";
import { grepTool } from "./tools/grep.js";
import { logger } from "../tui/utils/logger.js";
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
	onText?: (text: string) => void;
	onComplete?: (answer: string) => void;
	onError?: (error: string) => void;
};

export type QueryResult = {
	answer: string;
	sessionId?: string;
	usage?: UsageMetrics;
};

// ─── Persistent session ────────────────────────────────────────────────────

let session: Session | null = null;

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

function getOrCreateSession(callbacks: QueryCallbacks): Session {
	if (session) return session;

	const model = createModel();
	const { scraperSubagent, coderSubagent } = createSubagents(model);

	// Wire subagent inner events to TUI
	setSubagentEventCallback((agentName, event) => {
		callbacks.onSubagentInnerEvent?.(agentName, event);
	});

	// Track tool timing for hooks
	const toolTimers = new Map<string, number>();

	// Orchestrator has direct tools for simple tasks + subagents for heavy lifting
	session = createSession({
		model,
		instructions: SYSTEM_PROMPT,
		tools: [
			bashTool,
			readFileTool,
			writeFileTool,
			listDirectoryTool,
			globFilesTool,
			grepTool,
		],
		subagents: [scraperSubagent, coderSubagent],
		maxTurns: 5000,
		modelSettings: {
			maxTokens: 128000,
			promptCacheKey: "noctua-orchestrator",
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

				callbacks.onToolStart?.({
					type: "tool_start",
					tool: name,
					args,
				});
			},

			afterToolCall: ({ toolCall, result }) => {
				const name = toolCall.function.name;
				const startTime = toolTimers.get(toolCall.id) ?? Date.now();
				toolTimers.delete(toolCall.id);

				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(toolCall.function.arguments);
				} catch {
					// leave empty
				}

				callbacks.onToolEnd?.({
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

	const sess = getOrCreateSession(callbacks);
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
				totalCostUsd: runResult.totalCostUsd ?? 0,
			};
		}

		callbacks.onComplete?.(finalOutput);

		if (usage) {
			logger.info("query complete", {
				tokens: usage.totalTokens,
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
	}
}
