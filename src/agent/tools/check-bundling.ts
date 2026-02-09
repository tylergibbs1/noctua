import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { checkPtpEdit } from "../../db/queries.js";
import { textResult } from "./types.js";

export const checkBundlingTool = tool(
  "check_bundling",
  "Check ALL pairwise NCCI PTP conflicts across all CPT/HCPCS codes on a claim in a single call. More efficient than calling validate_code_pair for each pair individually. Returns every conflicting pair with modifier indicators. Use this after validating individual codes to catch bundling issues.",
  {
    codes: z.array(z.string()).describe("Array of all CPT/HCPCS procedure codes on the claim (5-char each)"),
    dateOfService: z
      .string()
      .optional()
      .describe("Date of service (YYYY-MM-DD) for date-filtered check"),
  },
  async ({ codes, dateOfService }) => {
    const db = getDb();
    const conflicts: Array<{
      code1: string;
      code2: string;
      column1: string;
      column2: string;
      modifierIndicator: string;
      modifierAllowed: boolean;
      rationale: string | undefined;
    }> = [];

    // Check every unique pair
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const edit = checkPtpEdit(db, codes[i], codes[j], dateOfService);
        if (edit) {
          conflicts.push({
            code1: codes[i],
            code2: codes[j],
            column1: edit.column1,
            column2: edit.column2,
            modifierIndicator: edit.modifier_indicator,
            modifierAllowed: edit.modifier_indicator === "1",
            rationale: edit.ptp_edit_rationale ?? undefined,
          });
        }
      }
    }

    return textResult({
      totalPairs: (codes.length * (codes.length - 1)) / 2,
      conflictsFound: conflicts.length,
      conflicts,
      message:
        conflicts.length === 0
          ? "No PTP bundling conflicts found across claim line items."
          : `Found ${conflicts.length} PTP bundling conflict(s) across claim line items.`,
    });
  }
);
