import type { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Parse NCCI PTP (Procedure-to-Procedure) edit text files.
 *
 * Tab-delimited format with header row (7 columns):
 *   Column A: Column 1 (payable HCPCS/CPT code)
 *   Column B: Column 2 (non-payable HCPCS/CPT code)
 *   Column C: Effective Date (Pre-1996) — legacy field, often "*"
 *   Column D: Effective Date (YYYYMMDD)
 *   Column E: Deletion Date (YYYYMMDD or blank if still active)
 *   Column F: Modifier Indicator (0=not allowed, 1=allowed, 9=n/a)
 *   Column G: PTP Edit Rationale (numeric code)
 *
 * Both Medicare (requires AMA license) and Medicaid (freely downloadable)
 * versions use this same format. The ZIP typically contains both
 * practitioner and facility/hospital outpatient files.
 */
export async function parsePtp(db: Database, dataDir: string): Promise<number> {
  const files = await readdir(dataDir);
  const dataFiles = files.filter(
    (f) => f.endsWith(".txt") && !/readme|layout|record/i.test(f)
  );
  if (dataFiles.length === 0) throw new Error("PTP edit text files not found in " + dataDir);

  const insert = db.prepare(
    `INSERT OR REPLACE INTO ptp_edits
     (column1, column2, effective_date, termination_date, modifier_indicator, ptp_edit_rationale)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  let totalCount = 0;
  for (const file of dataFiles) {
    const content = await Bun.file(join(dataDir, file)).text();
    const lines = content.split("\n");

    const tx = db.transaction(() => {
      let count = 0;
      let isFirstLine = true;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip header row
        if (isFirstLine) {
          isFirstLine = false;
          // Check if it looks like a header or title line
          if (/^col|^hcpcs|^code|^procedure|^"the edits/i.test(trimmed)) continue;
          // If it looks like data, process it
        }

        const parts = trimmed.split("\t");
        if (parts.length < 5) continue;

        const col1 = parts[0].trim();
        const col2 = parts[1].trim();

        // Handle both 6-column (Medicaid) and 7-column (Medicare) formats:
        // Medicaid (6 cols): Col1, Col2, EffDt, DelDt, ModInd, Rationale
        // Medicare (7 cols): Col1, Col2, Pre1996EffDt, EffDt, DelDt, ModInd, Rationale
        let effectiveDateRaw: string;
        let deletionDateRaw: string;
        let modifierIndicator: string;
        let rationale: string | undefined;

        if (parts.length >= 7) {
          // Medicare 7-column format: skip parts[2] (pre-1996)
          effectiveDateRaw = parts[3]?.trim();
          deletionDateRaw = parts[4]?.trim();
          modifierIndicator = parts[5]?.trim();
          rationale = parts[6]?.trim();
        } else {
          // Medicaid 6-column format
          effectiveDateRaw = parts[2]?.trim();
          deletionDateRaw = parts[3]?.trim();
          modifierIndicator = parts[4]?.trim();
          rationale = parts[5]?.trim();
        }

        if (!col1 || !col2 || !/^[0-9A-Z]{5}$/.test(col1) || !/^[0-9A-Z]{5}$/.test(col2)) {
          continue;
        }

        // Convert YYYYMMDD to YYYY-MM-DD
        const effectiveDate = formatDate(effectiveDateRaw);
        const deletionDate = deletionDateRaw ? formatDate(deletionDateRaw) : null;

        if (!effectiveDate) continue;
        if (!["0", "1", "9"].includes(modifierIndicator ?? "")) continue;

        insert.run(col1, col2, effectiveDate, deletionDate, modifierIndicator, rationale || null);
        count++;
      }
      return count;
    });
    totalCount += tx();
  }

  return totalCount;
}

/** Convert YYYYMMDD to YYYY-MM-DD, or return as-is if already formatted */
function formatDate(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.includes("-")) return raw; // already YYYY-MM-DD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
  }
  if (raw === "*" || raw === "19960101") return "1996-01-01";
  return null;
}
