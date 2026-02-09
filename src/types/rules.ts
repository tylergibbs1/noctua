import { z } from "zod";

export const Icd10CodeSchema = z.object({
  code: z.string(),
  description: z.string(),
  category: z.string().optional(),
  age_min: z.number().nullable().optional(),
  age_max: z.number().nullable().optional(),
  sex: z.enum(["M", "F", "B"]).nullable().optional(),
});

export const HcpcsCodeSchema = z.object({
  code: z.string(),
  description: z.string(),
  category: z.string().optional(),
  status: z.string().optional(),
});

export const PtpEditSchema = z.object({
  column1: z.string(),
  column2: z.string(),
  effective_date: z.string(),
  termination_date: z.string().nullable(),
  modifier_indicator: z.enum(["0", "1", "9"]),
  ptp_edit_rationale: z.string().optional(),
});

export const MueEditSchema = z.object({
  code: z.string(),
  practitioner_mue: z.number(),
  facility_mue: z.number(),
  mue_rationale: z.string().optional(),
});

export const AddonCodeSchema = z.object({
  addon_code: z.string(),
  primary_codes: z.string(),
  description: z.string().optional(),
});

export type Icd10Code = z.infer<typeof Icd10CodeSchema>;
export type HcpcsCode = z.infer<typeof HcpcsCodeSchema>;
export type PtpEdit = z.infer<typeof PtpEditSchema>;
export type MueEdit = z.infer<typeof MueEditSchema>;
export type AddonCode = z.infer<typeof AddonCodeSchema>;
