import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { checkMue } from "../../db/queries.js";
import { textResult } from "./types.js";

export const checkMueTool = tool(
  "check_mue",
  "Check if the number of units billed for a CPT/HCPCS code exceeds the Medically Unlikely Edit (MUE) limit. MUE limits are the maximum units of service that a provider would report for a single patient on a single date of service. Exceeding the MUE is a common denial reason. Returns the MUE limit for both practitioner and facility settings.",
  {
    code: z.string().describe("CPT/HCPCS code to check (5-char, e.g. '99213')"),
    units: z.number().describe("Number of units billed on the claim line"),
    providerType: z
      .enum(["practitioner", "facility"])
      .default("practitioner")
      .describe("Provider type for MUE lookup"),
  },
  async ({ code, units, providerType }) => {
    const db = getDb();
    const mue = checkMue(db, code);
    if (!mue) {
      return textResult({
        code,
        units,
        mueFound: false,
        message: `No MUE limit found for code ${code}`,
      });
    }
    const limit =
      providerType === "facility" ? mue.facility_mue : mue.practitioner_mue;
    const exceeds = units > limit;

    return textResult({
      code,
      units,
      mueLimit: limit,
      providerType,
      exceeds,
      rationale: mue.mue_rationale,
      message: exceeds
        ? `MUE VIOLATION: ${units} units exceeds ${providerType} MUE limit of ${limit} for ${code}. ${mue.mue_rationale ?? ""}`
        : `Units (${units}) within MUE limit (${limit}) for ${code}.`,
    });
  }
);
