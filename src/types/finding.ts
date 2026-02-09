import { z } from "zod";

export const SeveritySchema = z.enum(["error", "warning", "info"]);

export const CategorySchema = z.enum([
  "invalid_code",
  "ptp_conflict",
  "mue_violation",
  "addon_violation",
  "modifier_issue",
  "age_sex_mismatch",
  "bundling_conflict",
  "general",
]);

export const FindingSchema = z.object({
  severity: SeveritySchema,
  category: CategorySchema,
  code: z.string().optional(),
  message: z.string(),
  recommendation: z.string(),
});

export const ClaimResultSchema = z.object({
  claimId: z.string(),
  findings: z.array(FindingSchema),
  riskScore: z.number().min(0).max(100),
  summary: z.string(),
});

export type Severity = z.infer<typeof SeveritySchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ClaimResult = z.infer<typeof ClaimResultSchema>;
