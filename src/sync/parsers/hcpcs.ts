import type { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Parse the CMS HCPCS Level II Alpha-Numeric file.
 *
 * Fixed-width format (no header):
 *   Pos 1-5:    HCPC code (Level II alphanumeric, e.g., A0021, J1234)
 *   Pos 6-10:   Sequence number
 *   Pos 11:     Record ID code (3=procedure first line, 4=procedure continuation,
 *               7=modifier first line, 8=modifier continuation)
 *   Pos 12-91:  Long description (80 chars)
 *   Pos 92-119: Short description (28 chars)
 *   Pos 120+:   Additional fields (pricing, coverage, BETOS, etc.)
 *
 * NOTE: This file only contains HCPCS Level II codes (A0000-V9999).
 * CPT Level I codes (00100-99499) are AMA-copyrighted and NOT included.
 * Record ID 4 or 8 are continuation lines for long descriptions.
 */
export async function parseHcpcs(db: Database, dataDir: string): Promise<number> {
  const files = await readdir(dataDir);
  // Look for the ANWEB file (e.g., HCPC2025_JAN_ANWEB_12172024.txt)
  const dataFile = files.find((f) => /ANWEB.*\.txt$/i.test(f));
  if (!dataFile) {
    // Fallback: look for any HCPCS data file (not layout/readme)
    const altFile = files.find(
      (f) => f.endsWith(".txt") && !/layout|readme|record|notes/i.test(f)
    );
    if (!altFile) throw new Error("HCPCS data file not found in " + dataDir);
    return parseFallback(db, join(dataDir, altFile));
  }

  const content = await Bun.file(join(dataDir, dataFile)).text();
  const lines = content.split("\n");

  // First pass: collect codes and build up long descriptions from continuation lines
  const codeMap = new Map<
    string,
    { code: string; longDesc: string; shortDesc: string; recordId: string }
  >();
  let lastCode = "";

  for (const line of lines) {
    if (line.length < 20) continue;

    // Pos 1-5 (1-indexed) = 0-4 (0-indexed): HCPCS code, may be space-padded
    const rawCode = line.substring(0, 5);
    const code = rawCode.trim();
    const recordId = line.charAt(10); // pos 11, 0-indexed: 10
    const longDescPart = line.substring(11, 91).trim(); // pos 12-91
    const shortDesc = line.length >= 119 ? line.substring(91, 119).trim() : "";

    // Skip if not a valid code (must be 5 chars for HCPCS, or 2 chars for modifiers)
    if (!code) continue;

    if (recordId === "3" || recordId === "7") {
      // First line of a procedure or modifier
      codeMap.set(code, {
        code,
        longDesc: longDescPart,
        shortDesc,
        recordId,
      });
      lastCode = code;
    } else if ((recordId === "4" || recordId === "8") && lastCode) {
      // Continuation of previous code's long description
      const existing = codeMap.get(lastCode);
      if (existing) {
        existing.longDesc += " " + longDescPart;
      }
    }
  }

  // Insert into DB (skip modifiers, record ID 7/8)
  const insert = db.prepare(
    "INSERT OR REPLACE INTO hcpcs_codes (code, description, category, status) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    let count = 0;
    for (const entry of codeMap.values()) {
      // Skip modifiers (record ID 7/8) and non-5-char codes
      if (entry.recordId === "7" || entry.recordId === "8") continue;
      if (entry.code.length !== 5) continue;

      const description = entry.longDesc || entry.shortDesc;
      if (!description) continue;

      const category = categorizeHcpcs(entry.code);
      insert.run(entry.code, description, category, "A");
      count++;
    }
    return count;
  });

  return tx();
}

function categorizeHcpcs(code: string): string {
  const prefix = code.charAt(0);
  switch (prefix) {
    case "A": return "Transport/Medical Supplies";
    case "B": return "Enteral/Parenteral";
    case "C": return "Outpatient PPS";
    case "D": return "Dental";
    case "E": return "DME";
    case "G": return "Procedures/Professional Services";
    case "H": return "Behavioral Health";
    case "J": return "Drugs (non-oral)";
    case "K": return "DME (temp)";
    case "L": return "Orthotics/Prosthetics";
    case "M": return "Medical Services";
    case "P": return "Pathology/Lab";
    case "Q": return "Temporary Codes";
    case "R": return "Diagnostic Radiology";
    case "S": return "Temp National (non-Medicare)";
    case "T": return "Temp National (Medicaid)";
    case "V": return "Vision/Hearing";
    default: return "Other";
  }
}

/** Fallback for non-standard file formats */
async function parseFallback(db: Database, filePath: string): Promise<number> {
  const content = await Bun.file(filePath).text();
  const lines = content.split("\n").filter((l) => l.trim());

  const insert = db.prepare(
    "INSERT OR REPLACE INTO hcpcs_codes (code, description, category, status) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    let count = 0;
    for (const line of lines) {
      const parts = line.includes("\t") ? line.split("\t") : null;
      if (!parts || parts.length < 2) continue;
      const code = parts[0]?.trim();
      const description = parts[1]?.trim();
      if (code && description && /^[A-Z0-9]{5}$/.test(code)) {
        insert.run(code, description, categorizeHcpcs(code), "A");
        count++;
      }
    }
    return count;
  });

  return tx();
}
