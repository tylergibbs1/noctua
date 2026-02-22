#!/usr/bin/env bun
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./tui/App.js";
import { setHeadless } from "./browser/index.js";

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
		if (!process.env.AZURE_ENDPOINT || !process.env.AZURE_API_KEY) {
			console.error(
				"error: AZURE_ENDPOINT and AZURE_API_KEY not set\n\nset them in your shell profile or .env:\n  export AZURE_ENDPOINT=https://...\n  export AZURE_API_KEY=...",
			);
			process.exit(1);
		}

		if (opts.headless) {
			setHeadless(true);
		}

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

program.parse();
