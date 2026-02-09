import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

type Column = {
  header: string;
  key: string;
  width?: number;
  color?: string;
};

type Props = {
  columns: Column[];
  data: Record<string, string | number>[];
};

export function Table({ columns, data }: Props) {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        {columns.map((col) => (
          <Box key={col.key} width={col.width ?? 20}>
            <Text bold underline color={theme.fg.secondary}>
              {col.header}
            </Text>
          </Box>
        ))}
      </Box>
      {/* Rows */}
      {data.map((row, i) => (
        <Box key={i}>
          {columns.map((col) => (
            <Box key={col.key} width={col.width ?? 20}>
              <Text color={col.color ?? theme.fg.primary}>
                {String(row[col.key] ?? "")}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
