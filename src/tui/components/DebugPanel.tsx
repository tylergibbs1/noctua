import React from 'react';
import { Box, Text } from 'ink';
import { useDebugLogs } from '../hooks/useDebugLogs.js';
import { theme } from '../theme.js';
import type { LogLevel } from '../utils/logger.js';

const levelColors: Record<LogLevel, string> = {
  debug: theme.fg.disabled,
  info: theme.accent.secondary,
  warn: theme.accent.tertiary,
  error: theme.accent.primary,
};

interface DebugPanelProps {
  maxLines?: number;
  show?: boolean;
}

export function DebugPanel({ maxLines = 10, show = true }: DebugPanelProps) {
  const logs = useDebugLogs();

  if (!show || logs.length === 0) return null;

  const displayLogs = logs.slice(-maxLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.border.muted}
      paddingX={1}
      marginTop={1}
    >
      <Text color={theme.fg.muted}>{'\u2500'} debug {'\u2500'}</Text>
      {displayLogs.map(entry => (
        <Box key={entry.id}>
          <Text color={levelColors[entry.level]}>
            [{entry.level.toUpperCase().padEnd(5)}]
          </Text>
          <Text color={theme.fg.secondary}> {entry.message}</Text>
          {entry.data !== undefined && (
            <Text color={theme.fg.muted}> {JSON.stringify(entry.data)}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
