import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { allTools } from "./tools/index.js";
import { getDb } from "../db/index.js";
import { logger } from "../tui/utils/logger.js";
import type {
  ToolStartEvent,
  ToolEndEvent,
  ToolErrorEvent,
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
  onText?: (text: string) => void;
  onComplete?: (answer: string) => void;
  onError?: (error: string) => void;
};

export type QueryResult = {
  answer: string;
  sessionId?: string;
  usage?: UsageMetrics;
};

export async function runQuery(
  prompt: string,
  callbacks: QueryCallbacks = {},
  options: { model?: string; sessionId?: string; signal?: AbortSignal } = {}
): Promise<QueryResult> {
  getDb();
  logger.info('starting query', { model: options.model, sessionId: options.sessionId });

  const mcpServer = createSdkMcpServer({
    name: "claimguard",
    version: "0.1.0",
    tools: allTools,
  });

  const q = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      tools: [],
      mcpServers: {
        claimguard: mcpServer,
      },
      maxTurns: 20,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      model: options.model ?? "claude-sonnet-4-5-20250929",
      persistSession: true,
      ...(options.sessionId ? { resume: options.sessionId } : {}),
    },
  });

  let resultText = "";
  let sessionId: string | undefined;
  let lastToolName = "";
  let lastToolArgs: Record<string, unknown> = {};
  let toolStartTime = 0;
  let lastToolResult = "";
  let usage: UsageMetrics | undefined;

  for await (const message of q) {
    if (options.signal?.aborted) break;

    // Capture session ID from any message
    if ("session_id" in message && message.session_id) {
      sessionId = message.session_id;
    }

    if (message.type === "assistant") {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            resultText += block.text;
            callbacks.onText?.(block.text);
          } else if (block.type === "tool_use") {
            if (lastToolName && toolStartTime) {
              callbacks.onToolEnd?.({
                type: "tool_end",
                tool: lastToolName,
                args: lastToolArgs,
                result: lastToolResult,
                duration: Date.now() - toolStartTime,
              });
              lastToolResult = "";
            }

            lastToolName = block.name;
            lastToolArgs = (block.input as Record<string, unknown>) ?? {};
            toolStartTime = Date.now();
            logger.debug(`tool call: ${block.name}`, lastToolArgs);

            callbacks.onToolStart?.({
              type: "tool_start",
              tool: block.name,
              args: lastToolArgs,
            });
          }
        }
      }
    } else if (message.type === "user") {
      // capture tool results from user messages (tool_result content blocks)
      const msg = message as Record<string, unknown>;
      const inner = msg.message as Record<string, unknown> | undefined;
      const content = inner?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result") {
            const resultContent = block.content;
            if (typeof resultContent === "string") {
              lastToolResult = resultContent;
            } else if (Array.isArray(resultContent)) {
              const textBlock = resultContent.find(
                (c: { type: string }) => c.type === "text"
              );
              if (textBlock?.text) lastToolResult = textBlock.text;
            }

            // fire onToolEnd now if we have a pending tool
            if (lastToolName && toolStartTime) {
              callbacks.onToolEnd?.({
                type: "tool_end",
                tool: lastToolName,
                args: lastToolArgs,
                result: lastToolResult,
                duration: Date.now() - toolStartTime,
              });
              lastToolName = "";
              lastToolArgs = {};
              toolStartTime = 0;
              lastToolResult = "";
            }
          }
        }
      }
    } else if (message.type === "tool_progress") {
      if (lastToolName && toolStartTime) {
        callbacks.onToolEnd?.({
          type: "tool_end",
          tool: lastToolName,
          args: lastToolArgs,
          result: lastToolResult,
          duration: Date.now() - toolStartTime,
        });
        lastToolName = "";
        lastToolArgs = {};
        toolStartTime = 0;
        lastToolResult = "";
      }
    } else if (message.type === "result") {
      if (lastToolName && toolStartTime) {
        callbacks.onToolEnd?.({
          type: "tool_end",
          tool: lastToolName,
          args: lastToolArgs,
          result: lastToolResult,
          duration: Date.now() - toolStartTime,
        });
        lastToolName = "";
        lastToolArgs = {};
        toolStartTime = 0;
        lastToolResult = "";
      }

      const msg = message as Record<string, unknown>;
      const modelUsage = msg.modelUsage as Record<string, Record<string, number>> | undefined;

      if (modelUsage) {
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheRead = 0;
        let cacheCreate = 0;
        for (const mu of Object.values(modelUsage)) {
          inputTokens += mu.inputTokens ?? 0;
          outputTokens += mu.outputTokens ?? 0;
          cacheRead += mu.cacheReadInputTokens ?? 0;
          cacheCreate += mu.cacheCreationInputTokens ?? 0;
        }
        usage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          durationMs: (msg.duration_ms as number) ?? 0,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreate,
          totalCostUsd: (msg.total_cost_usd as number) ?? 0,
        };
      }

      if (message.subtype === "success") {
        resultText = message.result;
      } else {
        const errorMsg =
          "errors" in message ? message.errors.join(", ") : "query failed";
        callbacks.onError?.(errorMsg);
      }
    }
  }

  callbacks.onComplete?.(resultText);
  if (usage) {
    logger.info('query complete', {
      tokens: usage.totalTokens,
      duration: `${Math.round(usage.durationMs / 1000)}s`,
      cost: `$${usage.totalCostUsd.toFixed(4)}`,
    });
  }
  return { answer: resultText, sessionId, usage };
}

