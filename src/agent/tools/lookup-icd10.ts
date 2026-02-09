import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { lookupIcd10 } from "../../db/queries.js";
import { textResult, errorResult } from "./types.js";

export const lookupIcd10Tool = tool(
  "lookup_icd10",
  "Validate an ICD-10-CM diagnosis code exists in the CMS database. Returns the code description, category chapter, and any age/sex restrictions if available. Use this as the first step when validating claim diagnoses — an invalid ICD-10 code is a guaranteed denial.",
  {
    code: z.string().describe("ICD-10-CM code with dot notation (e.g., 'E11.9', 'J06.9', 'M17.11'). Codes without dots will also be matched."),
  },
  async ({ code }) => {
    const db = getDb();
    const result = lookupIcd10(db, code);
    if (!result) {
      return textResult({
        valid: false,
        code,
        message: `ICD-10 code ${code} not found in database`,
      });
    }
    return textResult({
      valid: true,
      code: result.code,
      description: result.description,
      category: result.category,
      age_min: result.age_min,
      age_max: result.age_max,
      sex: result.sex,
    });
  }
);
