#!/usr/bin/env bun
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { getDb, closeDb } from "./db/index.js";
import { syncAll } from "./sync/index.js";
import { App } from "./tui/App.js";

const program = new Command()
  .name("claimguard")
  .description("Medical billing compliance assistant")
  .version("0.1.0");

program
  .command("chat", { isDefault: true })
  .description("Start the interactive TUI")
  .option("--model <model>", "Claude model to use", "claude-sonnet-4-5-20250929")
  .option("--session <id>", "Resume a previous session by ID")
  .option("--debug", "Show debug panel")
  .action(async (opts: { model?: string; session?: string; debug?: boolean }) => {
    // guard: API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("error: ANTHROPIC_API_KEY not set\n\nset it in your shell profile:\n  export ANTHROPIC_API_KEY=sk-ant-...\n\nor run: bun run setup");
      process.exit(1);
    }

    try {
      const db = getDb();

      // guard: empty database
      const row = db.query("SELECT count(*) as n FROM icd10_codes").get() as { n: number } | null;
      if (!row || row.n === 0) {
        console.error("error: no CMS data found — run claimguard sync first\n\nor run: bun run setup");
        process.exit(1);
      }

      const { waitUntilExit } = render(
        React.createElement(App, { model: opts.model, initialSessionId: opts.session, debug: opts.debug })
      );
      await waitUntilExit();
    } catch (err) {
      console.error("Error:", err instanceof Error ? err.message : err);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command("sync")
  .description("Sync CMS rules data")
  .option("--dataset <datasets>", "Comma-separated list of datasets to sync")
  .action(async (opts: { dataset?: string }) => {
    try {
      await syncAll({
        datasets: opts.dataset?.split(","),
      });
    } catch (err) {
      console.error("Sync error:", err instanceof Error ? err.message : err);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command("analyze")
  .description("Analyze a claim JSON file — outputs structured JSON to stdout")
  .argument("<file>", "Path to claim JSON file")
  .option("--model <model>", "Claude model to use", "claude-sonnet-4-5-20250929")
  .action(async (file: string, opts: { model?: string }) => {
    try {
      const { runQuery } = await import("./agent/session.js");
      const { ClaimSchema } = await import("./types/claim.js");
      const raw = await Bun.file(file).text();
      const claim = ClaimSchema.parse(JSON.parse(raw));
      const claimJson = JSON.stringify(claim, null, 2);
      const prompt = `Analyze the following medical claim for denial risk. Follow the full 6-step validation workflow using all available tools. After all checks, provide findings as JSON.\n\n<claim>\n${claimJson}\n</claim>`;
      const { answer, usage } = await runQuery(prompt, {}, { model: opts.model });
      const jsonMatch = answer.match(/\{[\s\S]*"findings"[\s\S]*\}/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { claimId: claim.claimId, findings: [], riskScore: 0, summary: answer.slice(0, 500) };
      console.log(JSON.stringify({ ...result, usage }, null, 2));
    } catch (err) {
      console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program
  .command("eval")
  .description("Run evaluation suite")
  .option("--model <model>", "Claude model to use", "claude-sonnet-4-5-20250929")
  .action(async (opts: { model?: string }) => {
    try {
      const { runEvals } = await import("./evals/run.js");
      await runEvals({ model: opts.model });
    } catch (err) {
      console.error("Eval error:", err instanceof Error ? err.message : err);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

program.parse();
