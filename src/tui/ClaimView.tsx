import React from "react";
import { Box, Text } from "ink";
import type { Claim } from "../types/claim.js";
import { theme } from "./theme.js";

type Props = {
  claim: Claim;
};

export function ClaimView({ claim }: Props) {
  const age = Math.floor(
    (Date.now() - new Date(claim.patient.dateOfBirth).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border.standard} paddingX={1}>
      <Box gap={2}>
        <Text bold color={theme.accent.primary}>
          claim: {claim.claimId}
        </Text>
        <Text color={theme.fg.secondary}>dos: {claim.dateOfService}</Text>
        <Text color={theme.fg.secondary}>
          patient: {claim.patient.name ?? claim.patient.id} ({age}y {claim.patient.sex})
        </Text>
      </Box>
      <Box gap={2}>
        <Text color={theme.fg.secondary}>provider: {claim.provider.type}</Text>
        <Text color={theme.fg.secondary}>pos: {claim.placeOfService}</Text>
        <Text color={theme.fg.secondary}>lines: {claim.lineItems.length}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {claim.lineItems.map((item, i) => (
          <Box key={i} gap={1}>
            <Text color={theme.fg.muted}>  {i + 1}.</Text>
            <Text bold color={theme.fg.primary}>{item.cpt}</Text>
            {item.modifiers.length > 0 && (
              <Text color={theme.accent.tertiary}>-{item.modifiers.join(",")}</Text>
            )}
            <Text color={theme.fg.secondary}>x{item.units}</Text>
            <Text color={theme.fg.muted}>dx: {item.icd10.join(", ")}</Text>
            {item.description && <Text color={theme.fg.muted}>({item.description})</Text>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
