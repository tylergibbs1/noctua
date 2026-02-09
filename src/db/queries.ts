import type { Database } from "bun:sqlite";
import type { Icd10Code, HcpcsCode, PtpEdit, MueEdit, AddonCode } from "../types/rules.js";

export function lookupIcd10(db: Database, code: string): Icd10Code | null {
  // Normalize: add dot after 3rd char if missing (E119 -> E11.9)
  let normalized = code.trim().toUpperCase();
  if (normalized.length > 3 && !normalized.includes(".")) {
    normalized = normalized.substring(0, 3) + "." + normalized.substring(3);
  }
  return db
    .query<Icd10Code, [string]>(
      "SELECT code, description, category, age_min, age_max, sex FROM icd10_codes WHERE code = ?"
    )
    .get(normalized);
}

export function lookupHcpcs(db: Database, code: string): HcpcsCode | null {
  const normalized = code.trim().toUpperCase();
  return db
    .query<HcpcsCode, [string]>(
      "SELECT code, description, category, status FROM hcpcs_codes WHERE code = ?"
    )
    .get(normalized);
}

export function checkPtpEdit(
  db: Database,
  code1: string,
  code2: string,
  dateOfService?: string
): PtpEdit | null {
  const dateFilter = dateOfService
    ? " AND effective_date <= ? AND (termination_date IS NULL OR termination_date >= ?)"
    : "";
  const params = dateOfService
    ? [code1, code2, dateOfService, dateOfService]
    : [code1, code2];

  // Check both orderings
  const q1 = db.query<PtpEdit, string[]>(
    `SELECT column1, column2, effective_date, termination_date, modifier_indicator, ptp_edit_rationale
     FROM ptp_edits WHERE column1 = ? AND column2 = ?${dateFilter}`
  );
  const result = q1.get(...params);
  if (result) return result;

  const reverseParams = dateOfService
    ? [code2, code1, dateOfService, dateOfService]
    : [code2, code1];
  return db
    .query<PtpEdit, string[]>(
      `SELECT column1, column2, effective_date, termination_date, modifier_indicator, ptp_edit_rationale
       FROM ptp_edits WHERE column1 = ? AND column2 = ?${dateFilter}`
    )
    .get(...reverseParams);
}

export function checkMue(db: Database, code: string): MueEdit | null {
  return db
    .query<MueEdit, [string]>(
      "SELECT code, practitioner_mue, facility_mue, mue_rationale FROM mue_edits WHERE code = ?"
    )
    .get(code);
}

export function checkAddon(db: Database, addonCode: string): AddonCode[] {
  return db
    .query<AddonCode, [string]>(
      "SELECT addon_code, primary_codes, description FROM addon_codes WHERE addon_code = ?"
    )
    .all(addonCode);
}

export function getSyncMeta(
  db: Database,
  dataset: string
): { dataset: string; last_sync: string; record_count: number; source: string } | null {
  return db
    .query<
      { dataset: string; last_sync: string; record_count: number; source: string },
      [string]
    >("SELECT dataset, last_sync, record_count, source FROM sync_metadata WHERE dataset = ?")
    .get(dataset);
}
