#!/usr/bin/env bun
import { Command } from "commander";
import { setHeadless } from "./browser/index.js";

function checkEnv() {
	if (!process.env.AZURE_ENDPOINT || !process.env.AZURE_API_KEY) {
		console.error(
			"error: AZURE_ENDPOINT and AZURE_API_KEY not set\n\nset them in your shell profile or .env:\n  export AZURE_ENDPOINT=https://...\n  export AZURE_API_KEY=...",
		);
		process.exit(1);
	}
}

const program = new Command()
	.name("noctua")
	.description("AI-powered scraper and data acquisition agent")
	.version("0.2.0");

program
	.command("chat", { isDefault: true })
	.description("Start the interactive TUI")
	.option("--debug", "Show debug panel")
	.option("--headless", "Run browser in headless mode (default is visible)")
	.action(async (opts: { debug?: boolean; headless?: boolean }) => {
		checkEnv();

		if (opts.headless) {
			setHeadless(true);
		}

		const { render } = await import("ink");
		const React = await import("react");
		const { App } = await import("./tui/App.js");

		try {
			const { waitUntilExit } = render(
				React.createElement(App, { debug: opts.debug }),
			);
			await waitUntilExit();
		} catch (err) {
			console.error(
				"Error:",
				err instanceof Error ? err.message : err,
			);
			process.exit(1);
		}
	});

program
	.command("cli")
	.description("Start the lightweight CLI REPL (no TUI)")
	.option("--headless", "Run browser in headless mode (default is visible)")
	.option("-q, --query <prompt>", "Run a single query and exit")
	.action(async (opts: { headless?: boolean; query?: string }) => {
		checkEnv();

		const { startCli } = await import("./cli.js");
		await startCli({
			headless: opts.headless,
			query: opts.query,
		});
	});

program
	.command("run")
	.description("Run a single query non-interactively and exit")
	.argument("<prompt>", "The query to run")
	.option("--headless", "Run browser in headless mode")
	.action(async (prompt: string, opts: { headless?: boolean }) => {
		checkEnv();

		const { startCli } = await import("./cli.js");
		await startCli({
			headless: opts.headless,
			query: prompt,
		});
	});

program.parse();
