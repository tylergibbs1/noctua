import React, { useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Intro } from "./components/Intro.js";
import { EventListView } from "./components/ToolEventView.js";
import { WorkingIndicator } from "./components/WorkingIndicator.js";
import { Input } from "./components/Input.js";
import { Markdown } from "./components/Markdown.js";
import { ResultsView } from "./ResultsView.js";
import { ClaimResultSchema } from "../types/finding.js";
import type { ClaimResult } from "../types/finding.js";
import { useAgentRunner } from "./hooks/useAgentRunner.js";
import type { HistoryItem } from "./hooks/useAgentRunner.js";
import { useInputHistory } from "./hooks/useInputHistory.js";
import { DebugPanel } from "./components/DebugPanel.js";
import { theme } from "./theme.js";
import type { UsageMetrics } from "../agent/session.js";

type Props = {
  model?: string;
  initialSessionId?: string;
  debug?: boolean;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatStats(usage?: UsageMetrics): string {
  if (!usage) return '';
  const parts: string[] = [];
  if (usage.durationMs) parts.push(formatDuration(usage.durationMs));
  if (usage.totalTokens) parts.push(`${usage.totalTokens.toLocaleString()} tokens`);
  if (usage.durationMs && usage.totalTokens) {
    const tps = usage.totalTokens / (usage.durationMs / 1000);
    parts.push(`(${tps.toFixed(1)} tok/s)`);
  }
  if (usage.totalCostUsd) parts.push(`$${usage.totalCostUsd.toFixed(4)}`);
  return parts.join(' \u00b7 ');
}

/**
 * Try to extract a ClaimResult JSON from the answer text.
 * Returns the parsed result and any remaining narrative text.
 */
function extractClaimResult(answer: string): { result: ClaimResult; narrative: string } | null {
  const jsonMatch = answer.match(/\{[\s\S]*"findings"[\s\S]*"riskScore"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result = ClaimResultSchema.parse(parsed);

    // text after the JSON block
    const jsonEnd = answer.indexOf(jsonMatch[0]) + jsonMatch[0].length;
    const narrative = answer.slice(jsonEnd).trim();

    return { result, narrative };
  } catch {
    return null;
  }
}

function AnswerView({ answer }: { answer: string }) {
  const extracted = extractClaimResult(answer);

  if (extracted) {
    return (
      <Box flexDirection="column">
        <ResultsView result={extracted.result} />
        {extracted.narrative && (
          <Box marginTop={1}>
            <Markdown>{extracted.narrative}</Markdown>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Text color={theme.accent.secondary}>{'\u23FA'} </Text>
      <Markdown>{answer}</Markdown>
    </Box>
  );
}

function HistoryItemView({ item }: { item: HistoryItem }) {
  const isDone = item.status !== 'processing';

  return (
    <Box flexDirection="column" marginBottom={isDone ? 1 : 0}>
      {/* query */}
      <Box>
        <Text color={theme.fg.muted} backgroundColor={theme.bg.subtle}>{'\u276F'} </Text>
        <Text color={theme.fg.primary} backgroundColor={theme.bg.subtle}>{item.query} </Text>
      </Box>

      {/* tool events */}
      {item.events.length > 0 && (
        <EventListView
          events={item.events}
          activeToolId={item.status === 'processing' ? item.activeToolId : undefined}
        />
      )}

      {/* answer */}
      {item.answer && (
        <Box marginTop={1}>
          <AnswerView answer={item.answer} />
        </Box>
      )}

      {/* interrupted badge */}
      {item.status === 'interrupted' && (
        <Box marginTop={1}>
          <Text color={theme.accent.tertiary}>{'\u25A0'} interrupted</Text>
        </Box>
      )}

      {/* stats */}
      {isDone && item.usage && (
        <Box marginTop={1}>
          <Text color={theme.fg.muted}>{'\u273B'} {formatStats(item.usage)}</Text>
        </Box>
      )}
    </Box>
  );
}

export function App({ model, initialSessionId, debug }: Props) {
  const { exit } = useApp();
  const sessionIdRef = useRef<string | undefined>(initialSessionId);
  const [systemMessage, setSystemMessage] = React.useState<string | null>(null);

  const {
    history,
    workingState,
    isProcessing,
    error,
    executeQuery,
    cancelExecution,
    clearHistory,
  } = useAgentRunner({ model, sessionIdRef });

  const {
    navigateUp,
    navigateDown,
    saveMessage,
    updateAgentResponse,
    resetNavigation,
  } = useInputHistory();

  // persist agent responses to chat history
  const lastCompletedRef = useRef<string | null>(null);
  useEffect(() => {
    const last = history[history.length - 1];
    if (last && (last.status === 'complete' || last.status === 'error') && last.id !== lastCompletedRef.current) {
      lastCompletedRef.current = last.id;
      if (last.answer) updateAgentResponse(last.answer);
    }
  }, [history, updateAgentResponse]);

  const handleSubmit = useCallback((queryText: string) => {
    const trimmed = queryText.trim().toLowerCase();

    if (trimmed === 'exit' || trimmed === 'quit') {
      exit();
      return;
    }

    if (trimmed === '/new') {
      clearHistory();
      sessionIdRef.current = undefined;
      setSystemMessage('session cleared \u2014 starting fresh');
      return;
    }

    if (trimmed === '/session') {
      setSystemMessage(
        sessionIdRef.current
          ? `session: ${sessionIdRef.current}\nresume later with: claimguard --session ${sessionIdRef.current}`
          : 'no active session \u2014 send a query to start one'
      );
      return;
    }

    if (trimmed === '/help') {
      setSystemMessage(
        '/new \u2014 start fresh session\n' +
        '/session \u2014 show current session id\n' +
        '/help \u2014 this message\n' +
        'exit \u2014 quit claimguard'
      );
      return;
    }

    setSystemMessage(null);
    saveMessage(queryText);
    resetNavigation();
    executeQuery(queryText);
  }, [exit, clearHistory, setSystemMessage, saveMessage, resetNavigation, executeQuery]);

  // esc to interrupt, ctrl+c to quit
  useInput((input, key) => {
    if (key.escape && isProcessing) {
      cancelExecution();
      return;
    }
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1} width={80}>
      {/* intro */}
      <Intro model={model} sessionId={sessionIdRef.current} />

      {/* history */}
      {history.map(item => (
        <HistoryItemView key={item.id} item={item} />
      ))}

      {/* system message */}
      {systemMessage && (
        <Box marginBottom={1}>
          <Text color={theme.accent.secondary}>{systemMessage}</Text>
        </Box>
      )}

      {/* error */}
      {error && (
        <Box marginBottom={1}>
          <Text color={theme.accent.primary}>error: {error}</Text>
        </Box>
      )}

      {/* working indicator */}
      {isProcessing && <WorkingIndicator state={workingState} />}

      {/* input */}
      <Box marginTop={1}>
        <Input
          onSubmit={handleSubmit}
          placeholder="ask about a code, rule, or paste a claim"
          onHistoryUp={navigateUp}
          onHistoryDown={navigateDown}
        />
      </Box>

      {/* debug panel */}
      <DebugPanel show={debug === true} />
    </Box>
  );
}
