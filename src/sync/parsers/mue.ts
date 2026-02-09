import type { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Parse NCCI MUE (Medically Unlikely Edits) text files.
 *
 * Tab-delimited format with header row (4 columns):
 *   Column A: HCPCS/CPT Code
 *   Column B: MUE Value (max units per patient per DOS)
 *   Column C: MUE Adjudication Indicator (MAI):
 *             1 = claim line edit
 *             2 = absolute date-of-service edit (policy-based)
 *             3 = date-of-service edit (clinical data-based)
 *   Column D: MUE Rationale (numeric code)
 *
 * CMS publishes THREE separate files:
 *   - Practitioner Services
 *   - Facility Outpatient Hospital Services
 *   - DME Supplier Services
 *
 * We parse practitioner and facility files separately and merge into
 * a single table with both MUE values.
 */
export async function parseMue(db: Database, dataDir: string): Promise<number> {
  const files = await readdir(dataDir);
  const dataFiles = files.filter(
    (f) => f.endsWith(".txt") && !/readme|layout|record/i.test(f)
  );
  if (dataFiles.length === 0) throw new Error("MUE data files not found in " + dataDir);

  // Collect MUEs from all files, keyed by code
  const mueData = new Map<
    string,
    { code: string; practitioner: number; facility: number; rationale: string | null }
  >();

  for (const file of dataFiles) {
    const isPractitioner = /practitioner/i.test(file);
    const isFacility = /facility|outpatient|hospital/i.test(file);
    const fileType = isPractitioner ? "practitioner" : isFacility ? "facility" : "practitioner";

    const content = await Bun.file(join(dataDir, file)).text();
    const lines = content.split("\n");

    let isFirstLine = true;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (isFirstLine) {
        isFirstLine = false;
        if (/^hcpcs|^code|^cpt/i.test(trimmed)) continue;
      }

      const parts = trimmed.split("\t");
      if (parts.length < 2) continue;

      const code = parts[0].trim();
      const mueValue = parseInt(parts[1]?.trim() ?? "0", 10);
      // Medicaid format has 3 cols (Code, MUE, Rationale)
      // Medicare format has 4 cols (Code, MUE, MAI, Rationale)
      const rationale = parts.length >= 4
        ? parts[3]?.trim() || null  // Medicare: rationale at index 3
        : parts[2]?.trim() || null; // Medicaid: rationale at index 2

      if (!code || !/^[0-9A-Z]{5}$/.test(code) || isNaN(mueValue)) continue;

      const existing = mueData.get(code);
      if (existing) {
        if (fileType === "practitioner") existing.practitioner = mueValue;
        else existing.facility = mueValue;
        if (rationale && !existing.rationale) existing.rationale = rationale;
      } else {
        mueData.set(code, {
          code,
          practitioner: fileType === "practitioner" ? mueValue : 0,
          facility: fileType === "facility" ? mueValue : 0,
          rationale,
        });
      }
    }
  }

  // If we only got one file, copy values to the other column
  const insert = db.prepare(
    "INSERT OR REPLACE INTO mue_edits (code, practitioner_mue, facility_mue, mue_rationale) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    let count = 0;
    for (const entry of mueData.values()) {
      // If one side is 0, assume same limit applies
      const pract = entry.practitioner || entry.facility;
      const facil = entry.facility || entry.practitioner;
      insert.run(entry.code, pract, facil, entry.rationale);
      count++;
    }
    return count;
  });

  return tx();
}
