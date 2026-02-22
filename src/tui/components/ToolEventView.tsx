import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

const TOOL_LABELS: Record<string, string> = {
	web_crawl: "crawl",
	web_navigate: "navigate",
	web_wait: "wait",
	web_click: "click",
	web_hover: "hover",
	web_fill: "fill",
	web_fill_form: "fill form",
	web_press_key: "key press",
	web_select_option: "select",
	web_file_upload: "upload",
	web_extract: "extract",
	web_snapshot: "snapshot",
	web_screenshot: "screenshot",
	web_evaluate: "evaluate",
	web_handle_dialog: "dialog",
	web_tabs: "tabs",
	web_close: "close",
	bash: "shell",
	read_file: "read file",
	write_file: "write file",
	edit_file: "edit file",
	list_directory: "list dir",
	glob_files: "find files",
	grep: "search",
};

const TOOL_PROGRESS: Record<string, string> = {
	web_crawl: "crawling page",
	web_navigate: "loading page",
	web_wait: "waiting",
	web_click: "clicking element",
	web_hover: "hovering element",
	web_fill: "filling input",
	web_fill_form: "filling form",
	web_press_key: "pressing key",
	web_select_option: "selecting option",
	web_file_upload: "uploading file",
	web_extract: "extracting data",
	web_snapshot: "capturing snapshot",
	web_screenshot: "capturing screenshot",
	web_evaluate: "running javascript",
	web_handle_dialog: "handling dialog",
	web_tabs: "managing tabs",
	web_close: "closing browser",
	bash: "running command",
	read_file: "reading file",
	write_file: "writing file",
	edit_file: "editing file",
	list_directory: "listing directory",
	glob_files: "finding files",
	grep: "searching files",
};

function formatToolName(name: string): string {
	if (TOOL_LABELS[name]) return TOOL_LABELS[name]!;
	return name.replace(/_/g, " ");
}

function truncateAtWord(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	const lastSpace = str.lastIndexOf(" ", maxLength);
	if (lastSpace > maxLength * 0.5) {
		return str.slice(0, lastSpace) + "...";
	}
	return str.slice(0, maxLength) + "...";
}

function formatArgs(args: Record<string, unknown>): string {
	return Object.entries(args)
		.map(([key, value]) => {
			const strValue = String(value);
			return `${key}=${truncateAtWord(strValue, 60)}`;
		})
		.join(", ");
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function truncateResult(result: string, maxLength = 100): string {
	if (result.length <= maxLength) return result;
	return result.slice(0, maxLength) + "...";
}

// ─── Event types ───────────────────────────────────────────────────────────

export interface ToolStartEvent {
	type: "tool_start";
	tool: string;
	args: Record<string, unknown>;
}

export interface ToolEndEvent {
	type: "tool_end";
	tool: string;
	args: Record<string, unknown>;
	result: string;
	duration: number;
}

export interface ToolErrorEvent {
	type: "tool_error";
	tool: string;
	error: string;
}

export type ToolEvent = ToolStartEvent | ToolEndEvent | ToolErrorEvent;

export interface DisplayEvent {
	id: string;
	event: ToolEvent;
	completed?: boolean;
	endEvent?: ToolEvent;
}

// ─── View components ───────────────────────────────────────────────────────

interface ToolStartViewProps {
	tool: string;
	args: Record<string, unknown>;
	isActive?: boolean;
}

export function ToolStartView({
	tool,
	args,
	isActive = false,
}: ToolStartViewProps) {
	const progressMsg = TOOL_PROGRESS[tool] || "working";
	return (
		<Box flexDirection="column">
			<Box>
				<Text color={theme.accent.secondary}>{"\u23FA"}{"  "}</Text>
				<Text color={theme.fg.primary}>{formatToolName(tool)}</Text>
				{Object.keys(args).length > 0 && (
					<Text color={theme.fg.muted}>({formatArgs(args)})</Text>
				)}
			</Box>
			{isActive && (
				<Box marginLeft={2}>
					<Text color={theme.fg.muted}>{"\u23BF"}  </Text>
					<Text color={theme.accent.primary}>
						<Spinner type="dots" />
					</Text>
					<Text color={theme.fg.secondary}> {progressMsg}</Text>
				</Box>
			)}
		</Box>
	);
}

interface ToolEndViewProps {
	tool: string;
	args: Record<string, unknown>;
	result: string;
	duration: number;
}

export function ToolEndView({ tool, args, result, duration }: ToolEndViewProps) {
	let summary = "done";

	if (result) {
		try {
			const parsed = JSON.parse(result);
			if (parsed.error) {
				summary = `error: ${truncateResult(parsed.error, 50)}`;
			} else if (parsed.title) {
				summary = truncateResult(parsed.title, 50);
			} else if (parsed.count !== undefined) {
				summary = `${parsed.count} result${parsed.count !== 1 ? "s" : ""}`;
			} else if (parsed.written) {
				summary = `wrote ${parsed.written}`;
			} else if (parsed.edited) {
				summary = `edited ${parsed.edited}`;
			} else if (parsed.exitCode !== undefined) {
				summary = parsed.exitCode === 0 ? "success" : `exit ${parsed.exitCode}`;
			} else {
				summary = truncateResult(result, 50);
			}
		} catch {
			summary = truncateResult(result, 50);
		}
	}

	return (
		<Box flexDirection="column">
			<Box>
				<Text color={theme.accent.secondary}>{"\u23FA"}{"  "}</Text>
				<Text color={theme.fg.primary}>{formatToolName(tool)}</Text>
				{Object.keys(args).length > 0 && (
					<Text color={theme.fg.muted}>({formatArgs(args)})</Text>
				)}
			</Box>
			<Box marginLeft={2}>
				<Text color={theme.fg.muted}>{"\u23BF"}  </Text>
				<Text color={theme.fg.secondary}>{summary}</Text>
				<Text color={theme.fg.muted}> in {formatDuration(duration)}</Text>
			</Box>
		</Box>
	);
}

interface ToolErrorViewProps {
	tool: string;
	error: string;
}

export function ToolErrorView({ tool, error }: ToolErrorViewProps) {
	return (
		<Box flexDirection="column">
			<Box>
				<Text color={theme.accent.primary}>{"\u23FA"}{"  "}</Text>
				<Text color={theme.fg.primary}>{formatToolName(tool)}</Text>
			</Box>
			<Box marginLeft={2}>
				<Text color={theme.fg.muted}>{"\u23BF"}  </Text>
				<Text color={theme.accent.primary}>
					error: {truncateResult(error, 80)}
				</Text>
			</Box>
		</Box>
	);
}

// ─── Event list ────────────────────────────────────────────────────────────

interface EventListViewProps {
	events: DisplayEvent[];
	activeToolId?: string;
}

export function EventListView({ events, activeToolId }: EventListViewProps) {
	return (
		<Box flexDirection="column" gap={0} marginTop={1}>
			{events.map((displayEvent) => {
				const { id, event, completed, endEvent } = displayEvent;

				// Completed tool — show end state
				if (
					event.type === "tool_start" &&
					completed &&
					endEvent?.type === "tool_end"
				) {
					return (
						<Box key={id} marginBottom={1}>
							<ToolEndView
								tool={endEvent.tool}
								args={(event as ToolStartEvent).args}
								result={endEvent.result}
								duration={endEvent.duration}
							/>
						</Box>
					);
				}

				if (
					event.type === "tool_start" &&
					completed &&
					endEvent?.type === "tool_error"
				) {
					return (
						<Box key={id} marginBottom={1}>
							<ToolErrorView
								tool={endEvent.tool}
								error={endEvent.error}
							/>
						</Box>
					);
				}

				// Active tool — show spinner
				if (event.type === "tool_start") {
					return (
						<Box key={id} marginBottom={1}>
							<ToolStartView
								tool={event.tool}
								args={event.args}
								isActive={!completed && id === activeToolId}
							/>
						</Box>
					);
				}

				return null;
			})}
		</Box>
	);
}
