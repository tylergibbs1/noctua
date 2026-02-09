import { z } from "zod";

export const PatientSchema = z.object({
  id: z.string(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  sex: z.enum(["M", "F"]),
  name: z.string().optional(),
});

export const LineItemSchema = z.object({
  cpt: z
    .string()
    .regex(/^[0-9A-Z]{5}$/, "Must be 5 alphanumeric characters"),
  modifiers: z.array(z.string().regex(/^[0-9A-Z]{2}$/)).default([]),
  icd10: z.array(
    z.string().regex(/^[A-Z]\d{2}(\.\d{1,4})?$/, "Invalid ICD-10 format")
  ),
  units: z.number().int().positive().default(1),
  charge: z.number().positive().optional(),
  description: z.string().optional(),
});

export const ClaimSchema = z.object({
  claimId: z.string(),
  dateOfService: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  patient: PatientSchema,
  provider: z
    .object({
      npi: z.string().optional(),
      type: z.enum(["practitioner", "facility"]).default("practitioner"),
    })
    .default({ type: "practitioner" as const }),
  lineItems: z.array(LineItemSchema).min(1),
  placeOfService: z.string().default("11"),
});

export type Patient = z.infer<typeof PatientSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
