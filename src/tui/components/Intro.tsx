import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

const LOGO = [
	" \u2588\u2580\u2584 \u2584\u2580\u2584 \u2584\u2580\u2580 \u2580\u2580\u2588 \u2588 \u2588 \u2584\u2580\u2584",
	" \u2588 \u2580 \u2588\u2580\u2588 \u2580\u2584\u2584  \u2588  \u2580\u2584\u2580 \u2588\u2580\u2588",
];

export function Intro() {
	const deployment = process.env.AZURE_DEPLOYMENT ?? "gpt-5.2-codex";

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box flexDirection="column">
				{LOGO.map((line, i) => (
					<Text key={i} color={theme.accent.primary}>
						{line}
					</Text>
				))}
			</Box>
			<Box marginTop={1}>
				<Text color={theme.fg.secondary}>
					sees everything
				</Text>
				<Text color={theme.fg.muted}> {"\u2014"} 0.2.0</Text>
			</Box>
			<Box>
				<Text color={theme.fg.muted}>model: </Text>
				<Text color={theme.fg.secondary} bold>
					{deployment}
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text color={theme.fg.muted}>
					/help {"\u00b7"} /new {"\u00b7"} exit to quit
				</Text>
			</Box>
		</Box>
	);
}
