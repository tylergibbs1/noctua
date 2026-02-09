import type { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Parse CMS ICD-10-CM code files.
 *
 * Prefers the Order file (icd10cm_order_YYYY.txt) which has:
 *   Pos 1-5:  Order number (right-justified, zero-filled)
 *   Pos 6:    Blank
 *   Pos 7-13: ICD-10-CM code (no dots, left-justified, space-padded)
 *   Pos 14:   Blank
 *   Pos 15:   Header flag: 0 = non-billable category, 1 = valid billable code
 *   Pos 16:   Blank
 *   Pos 17-76: Short description (60 chars)
 *   Pos 77:   Blank
 *   Pos 78+:  Long description
 *
 * Falls back to the codes file (icd10cm_codes_YYYY.txt) which has:
 *   Code (no dots) + spaces + description
 */
export async function parseIcd10(db: Database, dataDir: string): Promise<number> {
  const files = await readdir(dataDir);

  // Prefer the order file (has short+long descriptions, header flag)
  const orderFile = files.find(
    (f) => /icd10cm.*order.*\.txt$/i.test(f) && !/addenda/i.test(f)
  );
  if (orderFile) {
    return parseOrderFile(db, join(dataDir, orderFile));
  }

  // Fallback to the simpler codes file
  const codesFile = files.find(
    (f) => /icd10cm.*codes.*\.txt$/i.test(f) && !/addenda/i.test(f)
  );
  if (codesFile) {
    return parseSimpleCodesFile(db, join(dataDir, codesFile));
  }

  // Last resort
  const anyFile = files.find((f) => /icd10.*\.txt$/i.test(f) && !/addenda/i.test(f));
  if (!anyFile) throw new Error("ICD-10 data file not found in " + dataDir);
  return parseSimpleCodesFile(db, join(dataDir, anyFile));
}

/** Parse the fixed-width order file */
async function parseOrderFile(db: Database, filePath: string): Promise<number> {
  const content = await Bun.file(filePath).text();
  const lines = content.split("\n");

  const insert = db.prepare(
    "INSERT OR REPLACE INTO icd10_codes (code, description, category) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    let count = 0;
    for (const line of lines) {
      if (line.length < 17) continue;

      const headerFlag = line.charAt(14); // 0-indexed pos 14 = file pos 15
      if (headerFlag !== "1") continue; // skip non-billable category headers

      const rawCode = line.substring(6, 13).trim(); // 0-indexed 6..12 = file pos 7-13
      if (!rawCode || !/^[A-Z]\d/.test(rawCode)) continue;

      // Insert dot after 3rd character: E119 -> E11.9
      const code =
        rawCode.length > 3
          ? rawCode.substring(0, 3) + "." + rawCode.substring(3)
          : rawCode;

      const longDesc = line.length > 77 ? line.substring(77).trim() : "";
      const shortDesc = line.substring(16, 76).trim();
      const description = longDesc || shortDesc;
      if (!description) continue;

      const category = code.substring(0, 3);
      insert.run(code, description, category);
      count++;
    }
    return count;
  });

  return tx();
}

/** Parse the simpler codes-only file (code + spaces + description) */
async function parseSimpleCodesFile(db: Database, filePath: string): Promise<number> {
  const content = await Bun.file(filePath).text();
  const lines = content.split("\n");

  const insert = db.prepare(
    "INSERT OR REPLACE INTO icd10_codes (code, description, category) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    let count = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(/^([A-Z]\d[\w.]+)\s+(.+)$/);
      if (!match) continue;

      let code = match[1].trim();
      if (code.length > 3 && !code.includes(".")) {
        code = code.substring(0, 3) + "." + code.substring(3);
      }
      const description = match[2].trim();
      const category = code.substring(0, 3);
      insert.run(code, description, category);
      count++;
    }
    return count;
  });

  return tx();
}
