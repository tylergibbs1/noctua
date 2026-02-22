import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../theme.js";

const TOOL_LABELS: Record<string, string> = {
	delegate_scraping: "scraper",
	delegate_coding: "coder",
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
	delegate_scraping: "scraping",
	delegate_coding: "writing code",
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

const SUBAGENT_TOOLS = new Set(["delegate_scraping", "delegate_coding"]);

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
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const mins = Math.floor(ms / 60000);
	const secs = Math.round((ms % 60000) / 1000);
	return `${mins}m ${secs}s`;
}

function formatTokens(tokens: number): string {
	if (tokens < 1000) return `${tokens}`;
	return `${(tokens / 1000).toFixed(1)}k`;
}

function truncateResult(result: string, maxLength = 100): string {
	if (result.length <= maxLength) return result;
	return result.slice(0, maxLength) + "...";
}

// ─── Event types ───────────────────────────────────────────────────────────

export interface SubagentInnerEvent {
	tool: string;
	args: Record<string, unknown>;
	result?: string;
	duration?: number;
}

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
	// Subagent stats
	innerEvents?: SubagentInnerEvent[];
	innerToolCount?: number;
	innerTokens?: number;
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
	// Live subagent inner events (updated while running)
	innerEvents?: SubagentInnerEvent[];
	innerToolCount?: number;
}

// ─── View components ───────────────────────────────────────────────────────

interface ToolStartViewProps {
	tool: string;
	args: Record<string, unknown>;
	isActive?: boolean;
	innerEvents?: SubagentInnerEvent[];
	innerToolCount?: number;
}

export function ToolStartView({
	tool,
	args,
	isActive = false,
	innerEvents,
	innerToolCount,
}: ToolStartViewProps) {
	const isSubagent = SUBAGENT_TOOLS.has(tool);
	const progressMsg = TOOL_PROGRESS[tool] || "working";

	return (
		<Box flexDirection="column">
			<Box>
				<Text color={theme.accent.secondary}>{"\u23FA"}{"  "}</Text>
				<Text color={theme.fg.primary} bold={isSubagent}>
					{formatToolName(tool)}
				</Text>
				{isSubagent && innerToolCount !== undefined && innerToolCount > 0 && (
					<Text color={theme.fg.muted}>
						{" "}{"\u00b7"} {innerToolCount} tool use{innerToolCount !== 1 ? "s" : ""}
					</Text>
				)}
				{!isSubagent && Object.keys(args).length > 0 && (
					<Text color={theme.fg.muted}>({formatArgs(args)})</Text>
				)}
			</Box>
			{isActive && !isSubagent && (
				<Box marginLeft={2}>
					<Text color={theme.fg.muted}>{"\u23BF"}  </Text>
					<Text color={theme.accent.primary}>
						<Spinner type="dots" />
					</Text>
					<Text color={theme.fg.secondary}> {progressMsg}</Text>
				</Box>
			)}
			{isActive && isSubagent && innerEvents && innerEvents.length > 0 && (
				<Box flexDirection="column" marginLeft={4}>
					{innerEvents.slice(-5).map((inner, i) => (
						<Box key={i}>
							<Text color={theme.fg.muted}>{"\u251C\u2500"} </Text>
							<Text color={theme.fg.secondary}>
								{formatToolName(inner.tool)}
							</Text>
							{inner.result && (
								<Text color={theme.fg.muted}>
									{" "}{"\u00b7"} {truncateResult(inner.result, 40)}
								</Text>
							)}
							{inner.duration !== undefined && (
								<Text color={theme.fg.muted}>
									{" "}{"\u00b7"} {formatDuration(inner.duration)}
								</Text>
							)}
						</Box>
					))}
					<Box>
						<Text color={theme.fg.muted}>{"\u2514\u2500"} </Text>
						<Text color={theme.accent.primary}>
							<Spinner type="dots" />
						</Text>
						<Text color={theme.fg.secondary}> {progressMsg}</Text>
					</Box>
				</Box>
			)}
			{isActive && isSubagent && (!innerEvents || innerEvents.length === 0) && (
				<Box marginLeft={4}>
					<Text color={theme.fg.muted}>{"\u2514\u2500"} </Text>
					<Text color={theme.accent.primary}>
						<Spinner type="dots" />
					</Text>
					<Text color={theme.fg.secondary}> starting</Text>
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
	innerEvents?: SubagentInnerEvent[];
	innerToolCount?: number;
	innerTokens?: number;
}

export function ToolEndView({
	tool,
	args,
	result,
	duration,
	innerEvents,
	innerToolCount,
	innerTokens,
}: ToolEndViewProps) {
	const isSubagent = SUBAGENT_TOOLS.has(tool);
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
				summary = truncateResult(result, 60);
			}
		} catch {
			summary = truncateResult(result, 60);
		}
	}

	if (isSubagent) {
		return (
			<Box flexDirection="column">
				<Box>
					<Text color={theme.accent.secondary}>{"\u23FA"}{"  "}</Text>
					<Text color={theme.fg.primary} bold>
						{formatToolName(tool)}
					</Text>
					{innerToolCount !== undefined && innerToolCount > 0 && (
						<Text color={theme.fg.muted}>
							{" "}{"\u00b7"} {innerToolCount} tool use{innerToolCount !== 1 ? "s" : ""}
						</Text>
					)}
					{innerTokens !== undefined && innerTokens > 0 && (
						<Text color={theme.fg.muted}>
							{" "}{"\u00b7"} {formatTokens(innerTokens)} tokens
						</Text>
					)}
					<Text color={theme.fg.muted}> {"\u00b7"} {formatDuration(duration)}</Text>
				</Box>
				{innerEvents && innerEvents.length > 0 && (
					<Box flexDirection="column" marginLeft={4}>
						{innerEvents.slice(-8).map((inner, i) => (
							<Box key={i}>
								<Text color={theme.fg.muted}>{"\u251C\u2500"} </Text>
								<Text color={theme.fg.secondary}>
									{formatToolName(inner.tool)}
								</Text>
								{inner.result && (
									<Text color={theme.fg.muted}>
										{" "}{"\u00b7"} {truncateResult(inner.result, 40)}
									</Text>
								)}
								{inner.duration !== undefined && (
									<Text color={theme.fg.muted}>
										{" "}{"\u00b7"} {formatDuration(inner.duration)}
									</Text>
								)}
							</Box>
						))}
					</Box>
				)}
				<Box marginLeft={4}>
					<Text color={theme.fg.muted}>{"\u2514\u2500"} </Text>
					<Text color={theme.fg.secondary}>{summary}</Text>
				</Box>
			</Box>
		);
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
								innerEvents={endEvent.innerEvents}
								innerToolCount={endEvent.innerToolCount}
								innerTokens={endEvent.innerTokens}
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

				if (event.type === "tool_start") {
					return (
						<Box key={id} marginBottom={1}>
							<ToolStartView
								tool={event.tool}
								args={event.args}
								isActive={!completed && id === activeToolId}
								innerEvents={displayEvent.innerEvents}
								innerToolCount={displayEvent.innerToolCount}
							/>
						</Box>
					);
				}

				return null;
			})}
		</Box>
	);
}
