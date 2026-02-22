import { z } from "zod";
import { Agent, subagent } from "stratus-sdk";
import type { Model } from "stratus-sdk";
import { scraperTools, coderTools } from "./tools/index.js";
import type { SubagentInnerEvent } from "../tui/components/ToolEventView.js";

export type SubagentEventCallback = (
	agentName: string,
	event: SubagentInnerEvent,
) => void;

let onInnerEvent: SubagentEventCallback | undefined;

export function setSubagentEventCallback(cb: SubagentEventCallback | undefined) {
	onInnerEvent = cb;
}

function makeInnerHooks(agentName: string) {
	const toolTimers = new Map<string, number>();

	return {
		beforeToolCall: ({ toolCall }: { toolCall: { id: string; function: { name: string; arguments: string } } }) => {
			toolTimers.set(toolCall.id, Date.now());

			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(toolCall.function.arguments);
			} catch {
				// leave empty
			}

			onInnerEvent?.(agentName, {
				tool: toolCall.function.name,
				args,
			});
		},

		afterToolCall: ({ toolCall, result }: { toolCall: { id: string; function: { name: string; arguments: string } }; result: string }) => {
			const startTime = toolTimers.get(toolCall.id) ?? Date.now();
			toolTimers.delete(toolCall.id);

			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(toolCall.function.arguments);
			} catch {
				// leave empty
			}

			onInnerEvent?.(agentName, {
				tool: toolCall.function.name,
				args,
				result: result.slice(0, 80),
				duration: Date.now() - startTime,
			});
		},
	};
}

export function createSubagents(model: Model) {
	const scraperAgent = new Agent({
		name: "scraper",
		model,
		tools: scraperTools,
		hooks: makeInnerHooks("scraper"),
		instructions: `You are a web scraper subagent. You browse websites, interact with forms, and extract structured data.

Your job:
1. Navigate to the target site
2. Interact with the page as needed (fill forms, click buttons, wait for content)
3. Extract the requested data using web_extract or web_evaluate
4. Save results to a file using write_file (JSON or CSV)
5. Return a brief summary of what you extracted and the file path

Rules:
- Always save extracted data to a file — don't return large datasets inline
- Use targeted CSS selectors, not broad page dumps
- If a selector fails, try web_snapshot to understand the page structure
- If web_fill times out, use web_evaluate to check if the field is disabled
- Be concise in your return — just the summary and file path`,
	});

	const coderAgent = new Agent({
		name: "coder",
		model,
		tools: coderTools,
		hooks: makeInnerHooks("coder"),
		instructions: `You are a code-writing subagent. You write scripts, scrapers, and data processing pipelines.

Your job:
1. Read any reference data files provided (use read_file)
2. Write clean, production-ready code using write_file
3. Test the code with bash if possible
4. Return the file path and a brief description

Rules:
- Always use write_file to create code — never bash heredocs for long scripts
- Include error handling, rate limiting, and clear CLI arguments
- Add a docstring at the top explaining what the script does and how to run it
- If writing a scraper, base selectors on actual page structure (from reference data), not guesses
- Be concise in your return — just the file path and what the script does`,
	});

	const scraperSubagent = subagent({
		agent: scraperAgent,
		toolName: "delegate_scraping",
		toolDescription:
			"Delegate a web scraping or data extraction task to the scraper subagent. It has a full Playwright browser and can navigate, interact with forms, and extract data. It saves results to files and returns a summary. Use this for any task that involves browsing websites or extracting web data.",
		inputSchema: z.object({
			task: z
				.string()
				.describe(
					"Detailed scraping task description — include the target URL, what data to extract, what selectors or structure to look for, and where to save results",
				),
		}),
		mapInput: (params: { task: string }) => params.task,
		maxTurns: 50,
	});

	const coderSubagent = subagent({
		agent: coderAgent,
		toolName: "delegate_coding",
		toolDescription:
			"Delegate a code-writing task to the coder subagent. It can read files, write scripts, and test them with bash. Use this when you need to create Python scrapers, data processing scripts, or any code files. Provide context about what the code should do and reference any data files it should use.",
		inputSchema: z.object({
			task: z
				.string()
				.describe(
					"Detailed coding task — what to build, what language, input/output format, any reference files to read, and where to save the output",
				),
		}),
		mapInput: (params: { task: string }) => params.task,
		maxTurns: 30,
	});

	return { scraperSubagent, coderSubagent };
}
