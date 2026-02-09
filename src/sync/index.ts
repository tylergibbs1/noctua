import type { Database } from "bun:sqlite";
import { getDb, closeDb } from "../db/index.js";
import { downloadAndExtract, localDataExists, getDataDir } from "./download.js";
import { parseIcd10 } from "./parsers/icd10.js";
import { parseHcpcs } from "./parsers/hcpcs.js";
import { parsePtp } from "./parsers/ptp.js";
import { parseMue } from "./parsers/mue.js";
import { parseAddon } from "./parsers/addon.js";

type SyncOptions = {
  datasets?: string[];
};

/**
 * CMS data sources. URLs change quarterly and some require AMA license.
 *
 * ICD-10 and HCPCS Level II: freely downloadable.
 * PTP edits (Medicare): require AMA CPT license click-through.
 *   -> Use Medicaid versions instead (same format, freely downloadable).
 * MUE edits: Medicare versions may require license; Medicaid versions are free.
 * Add-on codes: freely downloadable.
 *
 * NOTE: These URLs are for a specific quarterly release and will change.
 * If downloads fail, check the CMS landing pages for current URLs:
 *   ICD-10: https://www.cms.gov/medicare/coding-billing/icd-10-codes
 *   HCPCS:  https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update
 *   PTP:    https://www.cms.gov/medicare/coding-billing/ncci-medicaid/medicaid-ncci-edit-files
 *   MUE:    https://www.cms.gov/medicare/coding-billing/ncci-medicaid/medicaid-ncci-edit-files
 *   Add-on: https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits/medicare-ncci-add-code-edits
 */
const CMS_URLS: Record<string, { url: string; note: string }> = {
  icd10: {
    url: "https://www.cms.gov/files/zip/2025-code-descriptions-tabular-order.zip",
    note: "ICD-10-CM FY2025 code descriptions (freely downloadable)",
  },
  hcpcs: {
    url: "https://www.cms.gov/files/zip/january-2025-alpha-numeric-hcpcs-file.zip",
    note: "HCPCS Level II codes only (CPT Level I codes require AMA license)",
  },
  ptp: {
    // Use Medicaid versions (same data format, no AMA license required)
    url: "https://www.cms.gov/files/zip/medicaid-ncci-q1-2026-ptp-edits-practitioner-services.zip",
    note: "Medicaid NCCI PTP edits (freely downloadable, same format as Medicare)",
  },
  mue: {
    url: "https://www.cms.gov/files/zip/medicaid-ncci-q1-2026-mue-edits-practitioner-services.zip",
    note: "Medicaid NCCI MUE edits (freely downloadable)",
  },
  addon: {
    url: "https://www.cms.gov/files/zip/add-code-edits-replacement-file-medicare-effective-01012026-zip.zip",
    note: "NCCI add-on code edits (freely downloadable)",
  },
};

export async function syncAll(options: SyncOptions = {}): Promise<void> {
  const db = getDb();
  const datasets = options.datasets ?? Object.keys(CMS_URLS);
  const parsers: Record<string, (db: Database, dir: string) => Promise<number>> = {
    icd10: parseIcd10,
    hcpcs: parseHcpcs,
    ptp: parsePtp,
    mue: parseMue,
    addon: parseAddon,
  };

  for (const dataset of datasets) {
    const source = CMS_URLS[dataset];
    if (!source) {
      console.warn(`Unknown dataset: ${dataset}`);
      continue;
    }

    try {
      let dataDir: string;

      // Check if data already exists locally (for manual downloads)
      if (await localDataExists(dataset)) {
        console.log(`${dataset}: Using existing local data in ${getDataDir(dataset)}`);
        dataDir = getDataDir(dataset);
      } else {
        console.log(`${dataset}: ${source.note}`);
        dataDir = await downloadAndExtract(source.url, dataset);
      }

      const parser = parsers[dataset];
      if (parser) {
        const count = await parser(db, dataDir);
        db.prepare(
          "INSERT OR REPLACE INTO sync_metadata (dataset, last_sync, record_count, source) VALUES (?, ?, ?, ?)"
        ).run(dataset, new Date().toISOString(), count, source.url);
        console.log(`${dataset}: ${count} records loaded`);
      }
    } catch (err) {
      console.error(`Failed to sync ${dataset}:`, err instanceof Error ? err.message : err);
      console.error(
        `  Tip: Download manually from the CMS website and place files in ${getDataDir(dataset)}/`
      );
    }
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const datasetIdx = args.indexOf("--dataset");
  const datasets = datasetIdx >= 0 ? args[datasetIdx + 1]?.split(",") : undefined;

  await syncAll({ datasets });
  closeDb();
}
