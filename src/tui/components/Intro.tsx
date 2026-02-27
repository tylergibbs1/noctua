import React from "react";
import { Box, Text } from "ink";
import { OwlPixelArt } from "./Owl.js";
import { theme } from "../theme.js";

const WORDMARK = [
	"█▀▄ ▄▀▄ ▄▀▀ ▀▀█ █ █ ▄▀▄",
	"█ ▀ █▀█ ▀▄▄  █  ▀▄▀ █▀█",
];

/**
 * Width-responsive command hints.
 * Progressively drops hints as terminal narrows.
 */
function CommandHints() {
	const cols = process.stdout.columns || 80;

	// Full: "/help · /new · esc to interrupt · exit to quit"
	// Medium: "/help · /new · exit to quit"
	// Narrow: "/help · exit"
	// Tiny: (nothing)
	if (cols < 30) return null;

	let hints: string;
	if (cols >= 60) {
		hints = `/help \u00b7 /new \u00b7 esc to interrupt \u00b7 exit to quit`;
	} else if (cols >= 40) {
		hints = `/help \u00b7 /new \u00b7 exit to quit`;
	} else {
		hints = `/help \u00b7 exit`;
	}

	return (
		<Box marginTop={1}>
			<Text color={theme.fg.muted}>{hints}</Text>
		</Box>
	);
}

export function Intro() {
	const cols = process.stdout.columns || 80;
	const deployment = process.env.AZURE_DEPLOYMENT ?? "gpt-5.2-codex";

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box alignItems="center">
				<OwlPixelArt />
				<Box flexDirection="column" marginLeft={3}>
					{WORDMARK.map((line, i) => (
						<Text key={i} color={theme.accent.primary}>
							{line}
						</Text>
					))}
				</Box>
			</Box>
			<Box marginTop={1}>
				<Text color={theme.fg.secondary}>
					sees everything
				</Text>
				<Text color={theme.fg.muted}> {"\u2014"} 0.2.0</Text>
			</Box>
			{cols >= 40 && (
				<Box>
					<Text color={theme.fg.muted}>model: </Text>
					<Text color={theme.fg.secondary} bold>
						{deployment}
					</Text>
				</Box>
			)}
			<CommandHints />
		</Box>
	);
}
