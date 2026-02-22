import React, { useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Intro } from "./components/Intro.js";
import { EventListView } from "./components/ToolEventView.js";
import { WorkingIndicator } from "./components/WorkingIndicator.js";
import { Input } from "./components/Input.js";
import { Markdown } from "./components/Markdown.js";
import { useAgentRunner } from "./hooks/useAgentRunner.js";
import type { HistoryItem } from "./hooks/useAgentRunner.js";
import { useInputHistory } from "./hooks/useInputHistory.js";
import { DebugPanel } from "./components/DebugPanel.js";
import { theme } from "./theme.js";
import { closeBrowser } from "../browser/index.js";
import { clearSession } from "../agent/session.js";
import type { UsageMetrics } from "../agent/session.js";

type Props = {
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
	if (!usage) return "";
	const parts: string[] = [];
	if (usage.durationMs) parts.push(formatDuration(usage.durationMs));
	if (usage.totalTokens)
		parts.push(`${usage.totalTokens.toLocaleString()} tokens`);
	if (usage.durationMs && usage.totalTokens) {
		const tps = usage.totalTokens / (usage.durationMs / 1000);
		parts.push(`(${tps.toFixed(1)} tok/s)`);
	}
	if (usage.totalCostUsd) parts.push(`$${usage.totalCostUsd.toFixed(4)}`);
	return parts.join(" \u00b7 ");
}

function AnswerView({ answer }: { answer: string }) {
	return (
		<Box>
			<Text color={theme.accent.secondary}>{"\u23FA"} </Text>
			<Markdown>{answer}</Markdown>
		</Box>
	);
}

function HistoryItemView({ item }: { item: HistoryItem }) {
	const isDone = item.status !== "processing";

	return (
		<Box flexDirection="column" marginBottom={isDone ? 1 : 0}>
			{/* query */}
			<Box>
				<Text color={theme.fg.muted} backgroundColor={theme.bg.subtle}>
					{"\u276F"}{"  "}
				</Text>
				<Text
					color={theme.fg.primary}
					backgroundColor={theme.bg.subtle}
				>
					{item.query}{" "}
				</Text>
			</Box>

			{/* tool events */}
			{item.events.length > 0 && (
				<EventListView
					events={item.events}
					activeToolId={
						item.status === "processing"
							? item.activeToolId
							: undefined
					}
				/>
			)}

			{/* answer */}
			{item.answer && (
				<Box marginTop={1}>
					<AnswerView answer={item.answer} />
				</Box>
			)}

			{/* interrupted badge */}
			{item.status === "interrupted" && (
				<Box marginTop={1}>
					<Text color={theme.accent.tertiary}>
						{"\u25A0"} interrupted
					</Text>
				</Box>
			)}

			{/* stats */}
			{isDone && item.usage && (
				<Box marginTop={1}>
					<Text color={theme.fg.muted}>
						{"\u273B"} {formatStats(item.usage)}
					</Text>
				</Box>
			)}
		</Box>
	);
}

export function App({ debug }: Props) {
	const { exit } = useApp();
	const [systemMessage, setSystemMessage] = React.useState<string | null>(
		null,
	);

	const { history, workingState, isProcessing, error, executeQuery, cancelExecution, clearHistory } =
		useAgentRunner({});

	const { navigateUp, navigateDown, saveMessage, updateAgentResponse, resetNavigation } =
		useInputHistory();

	// persist agent responses to chat history
	const lastCompletedRef = useRef<string | null>(null);
	useEffect(() => {
		const last = history[history.length - 1];
		if (
			last &&
			(last.status === "complete" || last.status === "error") &&
			last.id !== lastCompletedRef.current
		) {
			lastCompletedRef.current = last.id;
			if (last.answer) updateAgentResponse(last.answer);
		}
	}, [history, updateAgentResponse]);

	const handleSubmit = useCallback(
		(queryText: string) => {
			const trimmed = queryText.trim().toLowerCase();

			if (trimmed === "exit" || trimmed === "quit") {
				clearSession();
				closeBrowser();
				exit();
				return;
			}

			if (trimmed === "/new") {
				clearHistory();
				clearSession();
				setSystemMessage("session cleared \u2014 starting fresh");
				return;
			}

			if (trimmed === "/help") {
				setSystemMessage(
					"/new \u2014 start fresh session\n" +
						"/help \u2014 this message\n" +
						"exit \u2014 quit",
				);
				return;
			}

			setSystemMessage(null);
			saveMessage(queryText);
			resetNavigation();
			executeQuery(queryText);
		},
		[exit, clearHistory, setSystemMessage, saveMessage, resetNavigation, executeQuery],
	);

	// esc to interrupt, ctrl+c to quit
	useInput((input, key) => {
		if (key.escape && isProcessing) {
			cancelExecution();
			return;
		}
		if (key.ctrl && input === "c") {
			clearSession();
			closeBrowser();
			exit();
		}
	});

	return (
		<Box flexDirection="column" padding={1} width="100%">
			{/* intro */}
			<Intro />

			{/* history */}
			{history.map((item) => (
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
					placeholder="ask me to scrape, search, or process data"
					onHistoryUp={navigateUp}
					onHistoryDown={navigateDown}
				/>
			</Box>

			{/* debug panel */}
			<DebugPanel show={debug === true} />
		</Box>
	);
}
