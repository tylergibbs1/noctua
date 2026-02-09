import type { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Parse NCCI Add-on Code (AOC) edit files.
 *
 * Fixed-width format (per record layout for post-2022 files):
 *   Pos 0:     AOC Type (1=specific primaries, 2=contractor-defined, 3=partial)
 *   Pos 1-5:   Add-on HCPCS/CPT code (5 chars)
 *   Pos 6-12:  Primary code effective date (YYYYDDD Julian) or spaces
 *   Pos 13-17: Primary HCPCS/CPT code (5 chars) or "CCCCC" for contractor-defined
 *   Pos 18-24: Primary code termination date (YYYYDDD) or spaces
 *   Pos 25-31: AOC effective date (YYYYDDD)
 *   Pos 32-38: AOC termination date (YYYYDDD) or spaces
 *   Pos 39+:   Description (if present)
 *
 * Each line maps ONE add-on to ONE primary code. Add-on codes with multiple
 * primaries have multiple lines. We aggregate them per add-on.
 */
export async function parseAddon(db: Database, dataDir: string): Promise<number> {
  const files = await readdir(dataDir);
  const dataFile = files.find(
    (f) => f.endsWith(".txt") && !/readme|layout|record/i.test(f)
  );
  if (!dataFile) throw new Error("Add-on code file not found in " + dataDir);

  const content = await Bun.file(join(dataDir, dataFile)).text();
  const lines = content.split("\n");

  // Aggregate primaries per add-on code
  const addonMap = new Map<
    string,
    { primaries: Set<string>; description: string | null; aocType: string }
  >();

  for (const line of lines) {
    if (line.length < 18) continue;

    const aocType = line.charAt(0);
    if (!["1", "2", "3"].includes(aocType)) continue;

    const addonCode = line.substring(1, 6).trim();
    if (!addonCode || !/^[0-9A-Z]{5}$/.test(addonCode)) continue;

    const primaryCode = line.substring(13, 18).trim();
    const description = line.length > 39 ? line.substring(39).trim() || null : null;

    // Check if AOC has a termination date (terminated add-ons should be skipped)
    const aocTermDate = line.substring(32, 39).trim();
    if (aocTermDate && aocTermDate !== "0000000") continue; // skip terminated entries

    const existing = addonMap.get(addonCode);
    if (existing) {
      if (primaryCode && primaryCode !== "CCCCC") {
        existing.primaries.add(primaryCode);
      }
      if (description && !existing.description) {
        existing.description = description;
      }
    } else {
      const primaries = new Set<string>();
      if (primaryCode && primaryCode !== "CCCCC") {
        primaries.add(primaryCode);
      }
      addonMap.set(addonCode, { primaries, description, aocType });
    }
  }

  const insert = db.prepare(
    "INSERT OR REPLACE INTO addon_codes (addon_code, primary_codes, description) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    let count = 0;
    for (const [addonCode, entry] of addonMap) {
      // Type 2 = contractor-defined primaries, store "*" to indicate any
      const primaryCodes =
        entry.primaries.size > 0
          ? [...entry.primaries].join(",")
          : "*";
      insert.run(addonCode, primaryCodes, entry.description);
      count++;
    }
    return count;
  });

  return tx();
}
