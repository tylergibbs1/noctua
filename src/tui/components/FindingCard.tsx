import React from "react";
import { Box, Text } from "ink";
import { Markdown } from "./Markdown.js";
import type { Finding } from "../../types/finding.js";
import { StatusBadge } from "./StatusBadge.js";
import { theme } from "../theme.js";

type Props = {
  finding: Finding;
  index: number;
};

export function FindingCard({ finding, index }: Props) {
  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      <Box gap={1}>
        <Text color={theme.fg.muted}>#{index + 1}</Text>
        <StatusBadge severity={finding.severity} />
        {finding.code && <Text color={theme.accent.secondary}>{finding.code}</Text>}
        <Text color={theme.fg.muted}>({finding.category})</Text>
      </Box>
      <Box paddingLeft={4}>
        <Markdown>{finding.message}</Markdown>
      </Box>
      <Box paddingLeft={4}>
        <Text color={theme.accent.secondary}>rec: </Text>
        <Markdown>{finding.recommendation}</Markdown>
      </Box>
    </Box>
  );
}
