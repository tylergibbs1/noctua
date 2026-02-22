import { z } from "zod";
import { tool } from "stratus-sdk";
import { Glob } from "bun";
import { join } from "node:path";

export const grepTool = tool({
	name: "grep",
	description:
		"Search file contents by regex pattern, filtered by glob. Returns matching lines with file paths and line numbers. Use for finding code, data, or text across a project.",
	parameters: z.object({
		pattern: z.string().describe("Regex pattern to search for"),
		glob: z
			.string()
			.default("**/*")
			.describe("File glob filter — e.g. '**/*.ts', '*.json'"),
		cwd: z.string().default(".").describe("Working directory"),
	}),
	execute: async (_ctx, { pattern, glob: globPattern, cwd }) => {
		let regex: RegExp;
		try {
			regex = new RegExp(pattern, "i");
		} catch {
			return `invalid regex: ${pattern} — check for unescaped special characters`;
		}

		const g = new Glob(globPattern);
		const matches: string[] = [];
		let filesScanned = 0;

		for await (const filePath of g.scan({ cwd, dot: false })) {
			if (matches.length >= 100) break;

			const fullPath = join(cwd, filePath);
			try {
				const file = Bun.file(fullPath);
				const info = await file.stat();
				if (info.isDirectory() || info.size > 1_000_000) continue;
				filesScanned++;

				const text = await file.text();
				const lines = text.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (regex.test(lines[i]!)) {
						matches.push(
							`${filePath}:${i + 1}: ${lines[i]!.trim().slice(0, 150)}`,
						);
						if (matches.length >= 100) break;
					}
				}
			} catch {
				// skip unreadable files
			}
		}

		if (matches.length === 0) {
			return `no matches for /${pattern}/ in ${globPattern} (scanned ${filesScanned} files) — try a broader pattern or different glob`;
		}

		const suffix =
			matches.length >= 100
				? "\n(limited to 100 — narrow your glob or pattern)"
				: "";
		return `${matches.length} match(es) in ${filesScanned} files:\n${matches.join("\n")}${suffix}`;
	},
});
