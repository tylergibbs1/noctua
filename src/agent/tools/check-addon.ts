import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { checkAddon } from "../../db/queries.js";
import { textResult } from "./types.js";

export const checkAddonTool = tool(
  "check_addon",
  "Verify that an add-on code has a valid primary (base) code present on the claim.",
  {
    addonCode: z.string().describe("The add-on CPT code to check"),
    claimCodes: z
      .array(z.string())
      .describe("All CPT/HCPCS codes present on the claim"),
  },
  async ({ addonCode, claimCodes }) => {
    const db = getDb();
    const addonEntries = checkAddon(db, addonCode);

    if (addonEntries.length === 0) {
      return textResult({
        addonCode,
        isAddon: false,
        message: `${addonCode} is not listed as an add-on code in the database.`,
      });
    }

    // Collect all valid primary codes from all entries
    const validPrimaries = new Set<string>();
    let isContractorDefined = false;
    for (const entry of addonEntries) {
      if (entry.primary_codes === "*") {
        isContractorDefined = true;
      } else {
        for (const code of entry.primary_codes.split(",")) {
          validPrimaries.add(code.trim());
        }
      }
    }

    // Type 2 (contractor-defined) add-on codes accept any primary
    if (isContractorDefined) {
      return textResult({
        addonCode,
        isAddon: true,
        contractorDefined: true,
        hasValidPrimary: claimCodes.length > 0,
        message: `${addonCode} is a contractor-defined (Type 2) add-on code — any primary code is acceptable. ${claimCodes.length > 0 ? "Primary code(s) present on claim." : "WARNING: No other codes on claim to serve as primary."}`,
      });
    }

    const matchedPrimaries = claimCodes.filter((c) => validPrimaries.has(c));
    const hasValidPrimary = matchedPrimaries.length > 0;

    return textResult({
      addonCode,
      isAddon: true,
      validPrimaryCodes: [...validPrimaries],
      matchedPrimaries,
      hasValidPrimary,
      message: hasValidPrimary
        ? `Add-on code ${addonCode} has valid primary code(s) on claim: ${matchedPrimaries.join(", ")}`
        : `ADD-ON VIOLATION: ${addonCode} requires a primary code (${[...validPrimaries].join(", ")}), but none found on claim.`,
    });
  }
);
