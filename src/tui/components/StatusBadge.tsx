import React from "react";
import { Text } from "ink";
import type { Severity } from "../../types/finding.js";
import { theme } from "../theme.js";

const SEVERITY_COLORS: Record<Severity, string> = {
  error: theme.accent.primary,
  warning: theme.accent.tertiary,
  info: theme.accent.secondary,
};

const SEVERITY_ICONS: Record<Severity, string> = {
  error: "X",
  warning: "!",
  info: "i",
};

type Props = {
  severity: Severity;
  label?: string;
};

export function StatusBadge({ severity, label }: Props) {
  const color = SEVERITY_COLORS[severity];
  const icon = SEVERITY_ICONS[severity];
  return (
    <Text color={color} bold>
      [{icon}] {label ?? severity}
    </Text>
  );
}
