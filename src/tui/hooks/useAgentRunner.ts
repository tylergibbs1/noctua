import { useState, useCallback, useRef } from "react";
import { runQuery } from "../../agent/session.js";
import type { UsageMetrics } from "../../agent/session.js";
import type {
	DisplayEvent,
	ToolStartEvent,
	ToolEndEvent,
	ToolErrorEvent,
	SubagentInnerEvent,
} from "../components/ToolEventView.js";
import type { WorkingState } from "../components/WorkingIndicator.js";

const SUBAGENT_TOOLS = new Set(["delegate_scraping", "delegate_coding"]);

export type HistoryItemStatus =
	| "processing"
	| "complete"
	| "error"
	| "interrupted";

export type HistoryItem = {
	id: string;
	query: string;
	events: DisplayEvent[];
	answer: string;
	status: HistoryItemStatus;
	activeToolId?: string;
	usage?: UsageMetrics;
};

export function useAgentRunner(_opts: Record<string, unknown> = {}) {
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [workingState, setWorkingState] = useState<WorkingState>({
		status: "idle",
	});
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const eventCounterRef = useRef(0);
	const abortControllerRef = useRef<AbortController | null>(null);

	const executeQuery = useCallback(
		async (queryText: string) => {
			if (isProcessing) return;

			setIsProcessing(true);
			setError(null);
			setWorkingState({ status: "thinking" });

			const controller = new AbortController();
			abortControllerRef.current = controller;

			const itemId = `q-${Date.now()}`;
			const newItem: HistoryItem = {
				id: itemId,
				query: queryText,
				events: [],
				answer: "",
				status: "processing",
			};

			setHistory((prev) => [...prev, newItem]);

			const updateItem = (
				updater: (item: HistoryItem) => HistoryItem,
			) => {
				setHistory((prev) =>
					prev.map((item) =>
						item.id === itemId ? updater(item) : item,
					),
				);
			};

			try {
				const result = await runQuery(
					queryText,
					{
						onToolStart: (event: ToolStartEvent) => {
							const toolId = `tool-${eventCounterRef.current++}`;
							updateItem((item) => ({
								...item,
								events: [
									...item.events,
									{
										id: toolId,
										event,
										completed: false,
										innerEvents: SUBAGENT_TOOLS.has(
											event.tool,
										)
											? []
											: undefined,
										innerToolCount: SUBAGENT_TOOLS.has(
											event.tool,
										)
											? 0
											: undefined,
									},
								],
								activeToolId: toolId,
							}));
							setWorkingState({
								status: "tool",
								toolName: event.tool,
							});
						},
						onToolEnd: (event: ToolEndEvent) => {
							updateItem((item) => {
								const events = [...item.events];
								for (let i = events.length - 1; i >= 0; i--) {
									const de = events[i];
									if (
										de &&
										!de.completed &&
										de.event.type === "tool_start" &&
										de.event.tool === event.tool
									) {
										// Copy inner events to the end event for display after completion
										const endEvent: ToolEndEvent = {
											...event,
											innerEvents: de.innerEvents,
											innerToolCount: de.innerToolCount,
										};
										events[i] = {
											...de,
											completed: true,
											endEvent,
										};
										break;
									}
								}
								return {
									...item,
									events,
									activeToolId: undefined,
								};
							});
							setWorkingState({ status: "thinking" });
						},
						onToolError: (event: ToolErrorEvent) => {
							updateItem((item) => {
								const events = [...item.events];
								for (let i = events.length - 1; i >= 0; i--) {
									const de = events[i];
									if (
										de &&
										!de.completed &&
										de.event.type === "tool_start" &&
										de.event.tool === event.tool
									) {
										events[i] = {
											...de,
											completed: true,
											endEvent: event,
										};
										break;
									}
								}
								return {
									...item,
									events,
									activeToolId: undefined,
								};
							});
							setWorkingState({ status: "thinking" });
						},
						onSubagentInnerEvent: (
							_agentName: string,
							innerEvent: SubagentInnerEvent,
						) => {
							updateItem((item) => {
								const events = [...item.events];
								// Find the active (non-completed) subagent event
								for (
									let i = events.length - 1;
									i >= 0;
									i--
								) {
									const de = events[i];
									if (
										de &&
										!de.completed &&
										de.event.type === "tool_start" &&
										SUBAGENT_TOOLS.has(de.event.tool)
									) {
										const innerEvents = [
											...(de.innerEvents ?? []),
										];
										// If this is an afterToolCall (has result), update the last matching entry
										if (innerEvent.result !== undefined) {
											for (
												let j = innerEvents.length - 1;
												j >= 0;
												j--
											) {
												if (
													innerEvents[j]!.tool ===
														innerEvent.tool &&
													innerEvents[j]!.result ===
														undefined
												) {
													innerEvents[j] =
														innerEvent;
													break;
												}
											}
										} else {
											innerEvents.push(innerEvent);
										}

										events[i] = {
											...de,
											innerEvents,
											innerToolCount:
												(de.innerToolCount ?? 0) +
												(innerEvent.result !== undefined
													? 1
													: 0),
										};
										break;
									}
								}
								return { ...item, events };
							});
						},
						onText: () => {
							setWorkingState({
								status: "answering",
								startTime: Date.now(),
							});
						},
					},
					{
						signal: controller.signal,
					},
				);

				if (controller.signal.aborted) {
					updateItem((item) => ({
						...item,
						answer: result.answer || "interrupted",
						status: "interrupted",
						usage: result.usage,
					}));
				} else {
					updateItem((item) => ({
						...item,
						answer: result.answer,
						status: "complete",
						usage: result.usage,
					}));
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				updateItem((item) => ({
					...item,
					status: "error",
					answer: `error: ${msg}`,
				}));
				setError(msg);
			} finally {
				abortControllerRef.current = null;
				setIsProcessing(false);
				setWorkingState({ status: "idle" });
			}
		},
		[isProcessing],
	);

	const cancelExecution = useCallback(() => {
		abortControllerRef.current?.abort();
	}, []);

	const clearHistory = useCallback(() => {
		setHistory([]);
		setError(null);
	}, []);

	return {
		history,
		workingState,
		isProcessing,
		error,
		setError,
		executeQuery,
		cancelExecution,
		clearHistory,
	};
}
