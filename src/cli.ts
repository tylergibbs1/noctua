/**
 * Lightweight CLI for noctua — plain text REPL without the TUI.
 * Useful for piping, scripting, testing, and terminal environments
 * where Ink/React doesn't work well.
 */

import * as readline from "node:readline";
import chalk from "chalk";
import { runQuery, clearSession, type QueryCallbacks } from "./agent/session.js";
import { closeBrowser, setHeadless } from "./browser/index.js";
import type { PipelineEvent } from "./pipeline/state.js";

// ─── Formatting ──────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
	delegate_scraping: "scraper",
	delegate_coding: "coder",
	delegate_pipeline: "pipeline",
	web_probe: "probe",
	web_intercept_api: "intercept",
	web_navigate: "navigate",
	web_click: "click",
	web_fill: "fill",
	web_fill_form: "fill form",
	web_extract: "extract",
	web_snapshot: "snapshot",
	web_evaluate: "evaluate",
	web_wait: "wait",
	web_crawl: "crawl",
	bash: "shell",
	read_file: "read",
	write_file: "write",
	edit_file: "edit",
	list_directory: "ls",
	glob_files: "glob",
	grep: "grep",
	scraper_test: "test",
	scraper_lint: "lint",
};

function toolLabel(name: string): string {
	return TOOL_LABELS[name] ?? name.replace(/_/g, " ");
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max) + "...";
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function formatArgs(args: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [k, v] of Object.entries(args)) {
		parts.push(`${k}=${truncate(String(v), 40)}`);
	}
	return parts.join(", ");
}

// ─── CLI REPL ────────────────────────────────────────────────────────────

export interface CliOptions {
	headless?: boolean;
	/** Run a single query and exit (non-interactive) */
	query?: string;
}

export async function startCli(opts: CliOptions = {}) {
	if (opts.headless) {
		setHeadless(true);
	}

	// Non-interactive mode: single query
	if (opts.query) {
		await executeAndPrint(opts.query);
		await cleanup();
		return;
	}

	// Interactive REPL
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: chalk.cyan("> "),
		terminal: true,
	});

	console.log(
		chalk.bold("noctua") + chalk.dim(" — lightweight cli mode"),
	);
	console.log(
		chalk.dim("type a query, or: /new /quit /help"),
	);
	console.log();

	rl.prompt();

	rl.on("line", async (line: string) => {
		const input = line.trim();
		if (!input) {
			rl.prompt();
			return;
		}

		// Commands
		if (input === "/quit" || input === "/exit" || input === "exit" || input === "quit") {
			await cleanup();
			rl.close();
			process.exit(0);
		}

		if (input === "/new") {
			clearSession();
			console.log(chalk.dim("session cleared"));
			rl.prompt();
			return;
		}

		if (input === "/help") {
			console.log(`
${chalk.bold("commands:")}
  /new     clear session and start fresh
  /quit    exit
  /help    show this help

${chalk.bold("tips:")}
  - tool calls are shown inline as they execute
  - pipeline stages are shown with progress
  - use --headless for headless browser mode
  - use --query "..." for non-interactive single query
`);
			rl.prompt();
			return;
		}

		// Execute query
		await executeAndPrint(input);
		console.log();
		rl.prompt();
	});

	rl.on("close", async () => {
		await cleanup();
		process.exit(0);
	});

	// Handle ctrl+c gracefully
	process.on("SIGINT", async () => {
		console.log();
		await cleanup();
		process.exit(0);
	});
}

async function executeAndPrint(query: string) {
	const startTime = Date.now();
	let toolDepth = 0;
	let lastToolName = "";

	const callbacks: QueryCallbacks = {
		onToolStart: (event) => {
			toolDepth++;
			lastToolName = event.tool;
			const label = toolLabel(event.tool);
			const args = Object.keys(event.args).length > 0
				? chalk.dim(` (${formatArgs(event.args)})`)
				: "";

			process.stdout.write(
				chalk.yellow(`  ${"  ".repeat(toolDepth - 1)}▸ ${label}`) + args + "\n",
			);
		},

		onToolEnd: (event) => {
			const label = toolLabel(event.tool);
			const result = truncate(event.result.replace(/\n/g, " "), 60);
			const duration = chalk.dim(formatDuration(event.duration));

			process.stdout.write(
				chalk.green(`  ${"  ".repeat(toolDepth - 1)}✓ ${label}`) +
				chalk.dim(` ${result}`) +
				` ${duration}\n`,
			);
			toolDepth = Math.max(0, toolDepth - 1);
		},

		onToolError: (event) => {
			process.stdout.write(
				chalk.red(`  ${"  ".repeat(toolDepth - 1)}✗ ${toolLabel(event.tool)} — ${truncate(event.error, 60)}`) + "\n",
			);
			toolDepth = Math.max(0, toolDepth - 1);
		},

		onSubagentInnerEvent: (agentName, event) => {
			const label = toolLabel(event.tool);
			if (event.result !== undefined) {
				const duration = event.duration ? chalk.dim(` ${formatDuration(event.duration)}`) : "";
				process.stdout.write(
					chalk.dim(`    │ ${label}`) + duration + "\n",
				);
			}
		},

		onPipelineEvent: (event: PipelineEvent) => {
			switch (event.type) {
				case "stage_start":
					process.stdout.write(
						chalk.magenta(`  ◆ pipeline: ${event.stage}`) + "\n",
					);
					break;
				case "stage_complete":
					process.stdout.write(
						chalk.green(`  ◆ ${event.stage} complete`) +
						chalk.dim(` ${formatDuration(event.durationMs)}`) +
						(event.summary ? chalk.dim(` — ${event.summary}`) : "") + "\n",
					);
					break;
				case "test_result":
					if (event.report.success) {
						process.stdout.write(
							chalk.green(`  ✓ test PASS — ${event.report.recordCount} records`) + "\n",
						);
					} else {
						process.stdout.write(
							chalk.red(`  ✗ test FAIL — ${event.report.schemaErrors.length} errors`) + "\n",
						);
					}
					break;
				case "repair_attempt":
					process.stdout.write(
						chalk.yellow(`  ↻ repair attempt ${event.attempt}/${event.maxAttempts}`) + "\n",
					);
					break;
				case "pipeline_complete":
					process.stdout.write(
						chalk.green.bold(`  ★ pipeline complete — ${event.scraperDir}`) + "\n",
					);
					break;
				case "pipeline_failed":
					process.stdout.write(
						chalk.red.bold(`  ✗ pipeline failed at ${event.stage}: ${event.reason}`) + "\n",
					);
					break;
			}
		},

		onText: () => {
			// Text arrives via the final answer
		},
	};

	try {
		const result = await runQuery(query, callbacks);
		const elapsed = formatDuration(Date.now() - startTime);

		// Print the answer
		console.log();
		console.log(result.answer);

		// Print usage stats
		if (result.usage) {
			const u = result.usage;
			console.log(
				chalk.dim(
					`\n─ ${u.totalTokens.toLocaleString()} tokens · $${u.totalCostUsd.toFixed(4)} · ${elapsed}` +
					(u.cacheReadInputTokens > 0 ? ` · ${u.cacheReadInputTokens.toLocaleString()} cached` : ""),
				),
			);
		}
	} catch (err) {
		console.error(
			chalk.red(`error: ${err instanceof Error ? err.message : String(err)}`),
		);
	}
}

async function cleanup() {
	clearSession();
	await closeBrowser();
}
