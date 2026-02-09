import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { lookupHcpcs } from "../../db/queries.js";
import { textResult } from "./types.js";

export const lookupHcpcsTool = tool(
  "lookup_hcpcs",
  "Look up a HCPCS Level II or CPT procedure code. The database contains HCPCS Level II codes (A0000-V9999) from CMS. CPT Level I codes (00100-99499) are AMA-copyrighted and NOT in the database — a 'not found' result for a CPT code does NOT mean it's invalid, just that we cannot verify it. Use this to validate HCPCS codes and get descriptions.",
  {
    code: z.string().describe("HCPCS/CPT code to look up (e.g., 'J3490', 'A0428', '99214')"),
  },
  async ({ code }) => {
    const db = getDb();
    const result = lookupHcpcs(db, code);

    if (!result) {
      // Distinguish CPT codes from HCPCS Level II codes
      const isCptRange = /^[0-9]{5}$/.test(code);
      return textResult({
        valid: false,
        code,
        message: isCptRange
          ? `CPT code ${code} not in database. Note: CPT Level I codes (00100-99499) are AMA-copyrighted and not included in our HCPCS Level II dataset. This does NOT indicate the code is invalid.`
          : `HCPCS code ${code} not found in database. This code may be invalid or not yet effective.`,
      });
    }
    return textResult({
      valid: true,
      code: result.code,
      description: result.description,
      category: result.category,
      status: result.status,
    });
  }
);
