import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import AdmZip from "adm-zip";

const DATA_DIR = "data/raw";

export async function downloadAndExtract(
  url: string,
  dataset: string
): Promise<string> {
  const outDir = join(DATA_DIR, dataset);
  await mkdir(outDir, { recursive: true });

  console.log(`Downloading ${dataset} from ${url}...`);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "ClaimGuard/0.1.0",
    },
  });

  if (response.status === 403 || response.status === 401) {
    throw new Error(
      `${dataset}: Access denied (HTTP ${response.status}). ` +
        `This file may require AMA license acceptance. ` +
        `Download manually from the CMS website and place in ${outDir}/`
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to download ${dataset}: ${response.status} ${response.statusText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (url.endsWith(".zip")) {
    console.log(`Extracting ${dataset}...`);
    const zip = new AdmZip(buffer);
    zip.extractAllTo(outDir, true);
  } else {
    const filename = url.split("/").pop() || "data.txt";
    await Bun.write(join(outDir, filename), buffer);
  }

  console.log(`${dataset} saved to ${outDir}`);
  return outDir;
}

/**
 * Check if extracted files already exist locally (for datasets that
 * require manual download due to AMA license).
 */
export async function localDataExists(dataset: string): Promise<boolean> {
  const outDir = join(DATA_DIR, dataset);
  try {
    const entries = await Array.fromAsync(new Bun.Glob("*.txt").scan(outDir));
    return entries.length > 0;
  } catch {
    return false;
  }
}

export function getDataDir(dataset: string): string {
  return join(DATA_DIR, dataset);
}
