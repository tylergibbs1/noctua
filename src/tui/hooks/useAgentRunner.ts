import { useState, useCallback, useRef } from "react";
import { runQuery } from "../../agent/session.js";
import type { UsageMetrics } from "../../agent/session.js";
import type {
	DisplayEvent,
	ToolStartEvent,
	ToolEndEvent,
	ToolErrorEvent,
} from "../components/ToolEventView.js";
import type { WorkingState } from "../components/WorkingIndicator.js";

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

			const updateItem = (updater: (item: HistoryItem) => HistoryItem) => {
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
									{ id: toolId, event, completed: false },
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
