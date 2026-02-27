import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { PipelineProgress, StageInfo, StageStatus } from "../hooks/useAgentRunner.js";
import { theme } from "../theme.js";

const SPINNER_FRAMES = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

const STATUS_ICON: Record<Exclude<StageStatus, "running">, string> = {
	pending: "\u25CB",
	done: "\u2713",
	failed: "\u2717",
};

function statusColor(status: StageStatus): string {
	switch (status) {
		case "pending":
			return theme.fg.disabled;
		case "running":
			return theme.accent.secondary;
		case "done":
			return theme.accent.secondary;
		case "failed":
			return theme.accent.primary;
	}
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes === 0) return `${seconds}s`;
	return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

function StageRow({ stage, frame }: { stage: StageInfo; frame: number }) {
	const icon =
		stage.status === "running"
			? SPINNER_FRAMES[frame]!
			: STATUS_ICON[stage.status];

	const nameWidth = 10;
	const name = stage.stage.padEnd(nameWidth);

	// Summary text (only for done/failed) or active tool (for running)
	let summary = "";
	if (stage.status === "running" && stage.activeTool) {
		summary = `\u2192 ${stage.activeTool}`;
	} else if (stage.summary) {
		summary = stage.summary;
	}

	// Duration (right side)
	let duration = "";
	if (stage.durationMs) {
		duration = formatElapsed(stage.durationMs);
	}

	return (
		<Box>
			<Text color={statusColor(stage.status)}>
				{"  "}{icon} {name}
			</Text>
			{summary ? (
				<Text color={theme.fg.muted}>
					{summary}
				</Text>
			) : null}
			{duration ? (
				<Text color={theme.fg.disabled}>
					{"  "}{duration}
				</Text>
			) : null}
		</Box>
	);
}

export function PipelineView({ progress }: { progress: PipelineProgress }) {
	const [frame, setFrame] = useState(0);
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		const spinner = setInterval(() => {
			setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
		}, 80);
		const clock = setInterval(() => setNow(Date.now()), 1000);
		return () => {
			clearInterval(spinner);
			clearInterval(clock);
		};
	}, []);

	if (!progress.active) return null;

	const elapsed = now - progress.startTime;
	const cols = process.stdout.columns || 80;
	const divider = "\u2500".repeat(Math.min(50, cols - 4));

	return (
		<Box flexDirection="column">
			{/* divider */}
			<Text color={theme.border.standard}>{divider}</Text>

			{/* stages */}
			<Box flexDirection="column" marginTop={1}>
				{progress.stages.map((s) => (
					<StageRow key={s.stage} stage={s} frame={frame} />
				))}
			</Box>

			{/* footer */}
			<Box marginTop={1}>
				<Text color={theme.fg.muted}>
					{"  "}{"\u23F1"} {formatElapsed(elapsed)}
				</Text>
				{cols >= 50 && (
					<Text color={theme.fg.disabled}>
						{"  "}{"\u00b7"} esc to interrupt
					</Text>
				)}
			</Box>

			{/* divider */}
			<Text color={theme.border.standard}>{divider}</Text>
		</Box>
	);
}
