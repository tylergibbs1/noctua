import React from "react";
import { Box, Text } from "ink";
import { Markdown } from "./components/Markdown.js";
import type { ClaimResult } from "../types/finding.js";
import { FindingCard } from "./components/FindingCard.js";
import { theme } from "./theme.js";

type Props = {
  result: ClaimResult;
};

function riskColor(score: number): string {
  if (score >= 70) return theme.accent.primary;
  if (score >= 40) return theme.accent.tertiary;
  return theme.accent.secondary;
}

function riskLabel(score: number): string {
  if (score >= 70) return "high risk";
  if (score >= 40) return "moderate risk";
  if (score > 0) return "low risk";
  return "clean";
}

export function ResultsView({ result }: Props) {
  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warning");
  const infos = result.findings.filter((f) => f.severity === "info");

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Risk Score Banner */}
      <Box
        borderStyle="double"
        borderColor={riskColor(result.riskScore)}
        paddingX={2}
        justifyContent="center"
      >
        <Text bold color={riskColor(result.riskScore)}>
          risk score: {result.riskScore}/100 — {riskLabel(result.riskScore)}
        </Text>
      </Box>

      {/* Summary */}
      <Box marginY={1}>
        <Markdown>{result.summary}</Markdown>
      </Box>

      {/* Severity Breakdown */}
      <Box gap={3} marginBottom={1}>
        <Text color={theme.accent.primary} bold>
          {errors.length} error{errors.length !== 1 ? "s" : ""}
        </Text>
        <Text color={theme.accent.tertiary} bold>
          {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
        </Text>
        <Text color={theme.accent.secondary} bold>
          {infos.length} info
        </Text>
      </Box>

      {/* Findings */}
      {result.findings.length === 0 ? (
        <Box>
          <Text color={theme.accent.secondary} bold>
            no issues found — claim appears clean
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {result.findings.map((finding, i) => (
            <FindingCard key={i} finding={finding} index={i} />
          ))}
        </Box>
      )}
    </Box>
  );
}
