import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { checkPtpEdit, lookupHcpcs } from "../../db/queries.js";
import { textResult } from "./types.js";

const MODIFIER_RULES: Record<string, { description: string; validWith: string[] }> = {
  "25": {
    description: "Significant, separately identifiable E/M service",
    validWith: ["E/M"],
  },
  "59": {
    description: "Distinct procedural service",
    validWith: ["Surgery", "Procedure", "Medicine", "Radiology", "Lab"],
  },
  XE: {
    description: "Separate encounter",
    validWith: ["Surgery", "Procedure", "Medicine", "Radiology", "Lab"],
  },
  XP: {
    description: "Separate practitioner",
    validWith: ["Surgery", "Procedure", "Medicine", "Radiology", "Lab"],
  },
  XS: {
    description: "Separate structure",
    validWith: ["Surgery", "Procedure", "Medicine", "Radiology", "Lab"],
  },
  XU: {
    description: "Unusual non-overlapping service",
    validWith: ["Surgery", "Procedure", "Medicine", "Radiology", "Lab"],
  },
  "26": {
    description: "Professional component",
    validWith: ["Radiology", "Medicine", "Lab"],
  },
  TC: {
    description: "Technical component",
    validWith: ["Radiology", "Medicine", "Lab"],
  },
};

export const checkModifierTool = tool(
  "check_modifier",
  "Validate modifier usage on a CPT code. Checks: (1) modifier 59/X-modifiers for PTP edit overrides, (2) modifier 25 for E/M with procedures, (3) modifiers 26/TC for professional/technical component splits.",
  {
    code: z.string().describe("CPT/HCPCS code with the modifier"),
    modifiers: z.array(z.string()).describe("Modifiers applied to this code"),
    otherCodes: z
      .array(z.string())
      .optional()
      .describe("Other CPT codes on the claim (for PTP context)"),
    dateOfService: z
      .string()
      .optional()
      .describe("Date of service for PTP date filtering"),
  },
  async ({ code, modifiers, otherCodes, dateOfService }) => {
    const db = getDb();
    const findings: Array<{
      modifier: string;
      status: "valid" | "warning" | "error";
      message: string;
    }> = [];

    const codeInfo = lookupHcpcs(db, code);
    const category = codeInfo?.category ?? null;

    for (const mod of modifiers) {
      const rule = MODIFIER_RULES[mod];

      if (!rule) {
        findings.push({
          modifier: mod,
          status: "warning",
          message: `Modifier ${mod} not in validation ruleset — manual review recommended.`,
        });
        continue;
      }

      // If code not in DB (e.g., CPT code), we can't do category checks — still validate PTP context
      if (!category) {
        // Can still validate 59/X-modifiers against PTP edits (those don't need category)
        if (!["59", "XE", "XP", "XS", "XU"].includes(mod)) {
          findings.push({
            modifier: mod,
            status: "warning",
            message: `Modifier ${mod} on ${code}: code not in HCPCS database, cannot verify category appropriateness. Manual review recommended.`,
          });
          continue;
        }
        // Fall through to PTP check below for 59/X-modifiers
      }

      // Check 25 modifier on non-E/M codes (only when we know the category)
      if (mod === "25" && category && category !== "E/M") {
        findings.push({
          modifier: mod,
          status: "error",
          message: `Modifier 25 (${rule.description}) should only be used with E/M codes. ${code} is category '${category}'.`,
        });
        continue;
      }

      // Check 59/X-modifiers — need a PTP context
      if (["59", "XE", "XP", "XS", "XU"].includes(mod)) {
        if (!otherCodes || otherCodes.length === 0) {
          findings.push({
            modifier: mod,
            status: "warning",
            message: `Modifier ${mod} present but no other codes provided for PTP context check.`,
          });
          continue;
        }

        let hasPtpConflict = false;
        for (const other of otherCodes) {
          const edit = checkPtpEdit(db, code, other, dateOfService);
          if (edit && edit.modifier_indicator === "1") {
            hasPtpConflict = true;
            findings.push({
              modifier: mod,
              status: "valid",
              message: `Modifier ${mod} appropriately used to override PTP edit between ${code} and ${other}. Ensure services are truly distinct.`,
            });
          } else if (edit && edit.modifier_indicator === "0") {
            findings.push({
              modifier: mod,
              status: "error",
              message: `Modifier ${mod} CANNOT override PTP edit between ${code} and ${other} (modifier indicator = 0, mutually exclusive).`,
            });
          }
        }
        if (!hasPtpConflict) {
          findings.push({
            modifier: mod,
            status: "warning",
            message: `Modifier ${mod} used on ${code} but no PTP conflict found with other claim codes. May trigger audit review.`,
          });
        }
        continue;
      }

      // Check 26/TC modifiers
      if ((mod === "26" || mod === "TC") && category && !rule.validWith.includes(category)) {
        findings.push({
          modifier: mod,
          status: "warning",
          message: `Modifier ${mod} (${rule.description}) typically used with ${rule.validWith.join("/")} codes, but ${code} is '${category}'.`,
        });
        continue;
      }

      // Default: valid usage
      findings.push({
        modifier: mod,
        status: "valid",
        message: `Modifier ${mod} (${rule.description}) applied to ${code} (${category}).`,
      });
    }

    return textResult({
      code,
      modifiers,
      findings,
      message:
        findings.length === 0
          ? "No modifiers to validate."
          : `Validated ${findings.length} modifier(s) on ${code}.`,
    });
  }
);
