import { z } from "zod";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { getDb } from "../../db/index.js";
import { lookupIcd10 } from "../../db/queries.js";
import { textResult } from "./types.js";

export const checkAgeSexTool = tool(
  "check_age_sex",
  "Check if ICD-10 diagnosis codes conflict with the patient's age or sex demographics. Uses age/sex restriction data when available in the database. IMPORTANT: The standard CMS ICD-10 tabular order file does NOT include age/sex restriction fields, so this tool may return no issues even when a conflict exists. You should ALSO use your medical knowledge — check the code descriptions returned by lookup_icd10 for obvious sex-specific terms (e.g. 'prostate', 'female breast', 'child health exam') and flag mismatches based on clinical reasoning.",
  {
    icd10Codes: z.array(z.string()).describe("ICD-10 codes to check"),
    patientAge: z.number().describe("Patient age in years"),
    patientSex: z.enum(["M", "F"]).describe("Patient sex (M or F)"),
  },
  async ({ icd10Codes, patientAge, patientSex }) => {
    const db = getDb();
    const findings: Array<{
      code: string;
      issue: "age" | "sex";
      status: "error" | "warning";
      message: string;
    }> = [];

    for (const code of icd10Codes) {
      const info = lookupIcd10(db, code);
      if (!info) continue;

      // Sex check
      if (info.sex && info.sex !== "B" && info.sex !== patientSex) {
        findings.push({
          code,
          issue: "sex",
          status: "error",
          message: `${code} (${info.description}) is ${info.sex === "M" ? "male" : "female"}-only, but patient is ${patientSex === "M" ? "male" : "female"}.`,
        });
      }

      // Age check
      if (info.age_min !== null && info.age_min !== undefined && patientAge < info.age_min) {
        findings.push({
          code,
          issue: "age",
          status: "warning",
          message: `${code} (${info.description}) has minimum age ${info.age_min}, but patient is ${patientAge} years old.`,
        });
      }
      if (info.age_max !== null && info.age_max !== undefined && patientAge > info.age_max) {
        findings.push({
          code,
          issue: "age",
          status: "warning",
          message: `${code} (${info.description}) has maximum age ${info.age_max}, but patient is ${patientAge} years old.`,
        });
      }
    }

    return textResult({
      codesChecked: icd10Codes.length,
      issuesFound: findings.length,
      findings,
      message:
        findings.length === 0
          ? "No age/sex conflicts found."
          : `Found ${findings.length} age/sex demographic issue(s).`,
    });
  }
);
