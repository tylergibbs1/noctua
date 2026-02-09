#!/usr/bin/env bun
/**
 * One-command setup for claimguard
 * Run: bun run setup
 */
import { existsSync } from "fs";
import { $ } from "bun";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const TERRA = "\x1b[38;2;198;93;61m";
const TEAL = "\x1b[38;2;61;154;142m";
const BROWN = "\x1b[38;2;139;115;85m";

function step(msg: string) {
  console.log(`\n${TEAL}▸${RESET} ${msg}`);
}

function ok(msg: string) {
  console.log(`  ${TEAL}✓${RESET} ${DIM}${msg}${RESET}`);
}

function warn(msg: string) {
  console.log(`  ${BROWN}!${RESET} ${msg}`);
}

function fail(msg: string) {
  console.log(`  ${TERRA}✗${RESET} ${msg}`);
}

async function main() {
  console.log(`\n${BOLD}${TERRA}claimguard${RESET} ${DIM}setup${RESET}\n`);

  // 1. install deps
  step("installing dependencies");
  await $`bun install`.quiet();
  ok("dependencies installed");

  // 2. link binary
  step("linking claimguard command");
  await $`bun link`.quiet();
  ok("claimguard is now available globally");

  // 3. check API key
  step("checking environment");
  if (process.env.ANTHROPIC_API_KEY) {
    ok("ANTHROPIC_API_KEY is set");
  } else {
    warn("ANTHROPIC_API_KEY not found");
    console.log(`  ${DIM}set it in your shell profile:${RESET}`);
    console.log(`  ${DIM}  export ANTHROPIC_API_KEY=sk-ant-...${RESET}`);
  }

  // 4. sync CMS data if needed
  step("checking CMS data");
  if (existsSync("claimguard.sqlite")) {
    const { Database } = await import("bun:sqlite");
    const db = new Database("claimguard.sqlite", { readonly: true });
    const row = db.query("SELECT count(*) as n FROM icd10_codes").get() as { n: number } | null;
    db.close();
    if (row && row.n > 0) {
      ok(`database exists with ${row.n.toLocaleString()} ICD-10 codes`);
    } else {
      warn("database exists but appears empty — running sync");
      await $`bun run src/index.ts sync`.quiet();
      ok("CMS data synced");
    }
  } else {
    console.log(`  ${DIM}no database found — downloading CMS data${RESET}`);
    await $`bun run src/index.ts sync`;
    ok("CMS data synced");
  }

  // done
  console.log(`\n${TEAL}ready${RESET} ${DIM}— run ${RESET}${BOLD}claimguard${RESET}${DIM} to start${RESET}\n`);
}

main().catch((err) => {
  fail(err.message);
  process.exit(1);
});
