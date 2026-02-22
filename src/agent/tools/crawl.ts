import { z } from "zod";
import { tool } from "stratus-sdk";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

export const webCrawlTool = tool({
	name: "web_crawl",
	description:
		"Fetch a URL and return clean, LLM-friendly markdown with boilerplate removed (nav, ads, footers stripped). Use this for reading articles, docs, or any page where you need the content — not for interactive browsing. Requires crawl4ai (pip install crawl4ai).",
	parameters: z.object({
		url: z.string().describe("URL to crawl"),
		selector: z
			.string()
			.optional()
			.describe(
				"Optional CSS selector to scope extraction (e.g. 'main', 'article', '.content')",
			),
	}),
	execute: async (_ctx, { url, selector }, options) => {
		const selectorArg = selector ? `--css-selector "${selector}"` : "";
		const cmd = `crwl ${JSON.stringify(url)} -o markdown --bypass-cache ${selectorArg} 2>&1`;

		const proc = Bun.spawn(["bash", "-c", cmd], {
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		const timeout = setTimeout(() => proc.kill(), 30000);
		let killed = false;
		const onAbort = () => {
			killed = true;
			proc.kill();
		};
		options?.signal?.addEventListener("abort", onAbort, { once: true });

		try {
			const [stdout, stderr] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			const exitCode = await proc.exited;

			if (killed) return "aborted";

			if (exitCode !== 0) {
				if (
					stderr.includes("command not found") ||
					stderr.includes("No module named")
				) {
					return "crawl4ai not installed — run: pip install crawl4ai && crawl4ai-setup";
				}
				return `crawl failed (exit ${exitCode}): ${truncate(stderr.trim(), 500)}`;
			}

			const content = stdout.trim();
			if (!content) {
				return `no content extracted from ${url} — the page may require JavaScript interaction. try web_navigate instead`;
			}

			return truncate(content, 8000);
		} finally {
			clearTimeout(timeout);
			options?.signal?.removeEventListener("abort", onAbort);
		}
	},
});
