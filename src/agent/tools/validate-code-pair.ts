import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { checkPtpEdit } from "../../db/queries.js";
import { textResult } from "./types.js";

export const validateCodePairTool = tool(
  "validate_code_pair",
  "Check if two CPT/HCPCS codes have an NCCI PTP (Procedure-to-Procedure) edit conflict. Returns whether the pair is bundled, which code is column 1 vs column 2, the modifier indicator (0=no override allowed, 1=modifier allowed, 9=N/A), and the edit rationale. Use check_bundling instead if you need to check ALL pairs on a claim at once.",
  {
    code1: z.string().describe("First CPT/HCPCS code (5-char, e.g. '99213')"),
    code2: z.string().describe("Second CPT/HCPCS code (5-char, e.g. '99214')"),
    dateOfService: z
      .string()
      .optional()
      .describe("Date of service (YYYY-MM-DD) for date-filtered check"),
  },
  async ({ code1, code2, dateOfService }) => {
    const db = getDb();
    const edit = checkPtpEdit(db, code1, code2, dateOfService);
    if (!edit) {
      return textResult({
        conflict: false,
        code1,
        code2,
        message: `No PTP edit conflict between ${code1} and ${code2}`,
      });
    }
    const modifierAllowed = edit.modifier_indicator === "1";
    return textResult({
      conflict: true,
      column1: edit.column1,
      column2: edit.column2,
      modifierIndicator: edit.modifier_indicator,
      modifierAllowed,
      effectiveDate: edit.effective_date,
      terminationDate: edit.termination_date,
      rationale: edit.ptp_edit_rationale,
      message: modifierAllowed
        ? `PTP conflict: ${edit.column1} bundles ${edit.column2}. A modifier (e.g., 59 or X{EPSU}) MAY be used to bypass if services are truly distinct.`
        : `PTP conflict: ${edit.column1} and ${edit.column2} are mutually exclusive. No modifier override allowed.`,
    });
  }
);
