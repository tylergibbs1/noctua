import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../theme.js';

const LOGO = [
  " \u2584\u2580\u2580 \u2588   \u2584\u2580\u2584 \u2588 \u2588\u2584 \u2584\u2588 \u2584\u2580\u2580 \u2588 \u2588 \u2584\u2580\u2584 \u2588\u2580\u2584 \u2588\u2580\u2584",
  " \u2580\u2584\u2584 \u2588\u2584\u2584 \u2588\u2580\u2588 \u2588 \u2588 \u2580 \u2588 \u2580\u2584\u2588 \u2580\u2584\u2588 \u2588\u2580\u2588 \u2588\u2580\u2584 \u2588\u2584\u2580",
];

interface IntroProps {
  model?: string;
  sessionId?: string;
}

export function Intro({ model, sessionId }: IntroProps) {
  const modelName = model?.replace('claude-', '').replace(/-\d+$/, '') ?? 'sonnet-4-5';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="column">
        {LOGO.map((line, i) => (
          <Text key={i} color={theme.accent.primary}>{line}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.fg.secondary}>catch denials before they happen</Text>
        <Text color={theme.fg.muted}> {'\u2014'} 0.1.0</Text>
      </Box>
      <Box>
        <Text color={theme.fg.muted}>model: </Text>
        <Text color={theme.fg.secondary} bold>{modelName}</Text>
        {sessionId && (
          <>
            <Text color={theme.fg.muted}> {'\u00b7'} session </Text>
            <Text color={theme.fg.secondary}>{sessionId.slice(0, 8)}</Text>
          </>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.fg.muted}>/help {'\u00b7'} /new {'\u00b7'} /session {'\u00b7'} exit to quit</Text>
      </Box>
    </Box>
  );
}
