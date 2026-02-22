import { z } from "zod";
import { tool } from "stratus-sdk";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Glob } from "bun";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export const readFileTool = tool({
	name: "read_file",
	description: "Read a file's text contents.",
	parameters: z.object({
		path: z.string().describe("Path to the file"),
	}),
	execute: async (_ctx, { path }) => {
		const file = Bun.file(path);
		if (!(await file.exists())) {
			return `file not found: ${path} — check the path with list_directory or glob_files`;
		}
		const text = await file.text();
		return truncate(text, 8000);
	},
});

export const writeFileTool = tool({
	name: "write_file",
	description: "Create or overwrite a file with the given content.",
	parameters: z.object({
		path: z.string().describe("Path to write"),
		content: z.string().describe("File content"),
	}),
	execute: async (_ctx, { path, content }) => {
		await Bun.write(path, content);
		return `wrote ${content.length} chars to ${path}`;
	},
});

export const editFileTool = tool({
	name: "edit_file",
	description:
		"Find and replace a unique string in a file. The old_string must appear exactly once.",
	parameters: z.object({
		path: z.string().describe("Path to the file"),
		old_string: z.string().describe("Exact text to find"),
		new_string: z.string().describe("Replacement text"),
	}),
	execute: async (_ctx, { path, old_string, new_string }) => {
		const file = Bun.file(path);
		if (!(await file.exists())) {
			return `file not found: ${path} — check the path`;
		}
		const text = await file.text();
		const count = text.split(old_string).length - 1;
		if (count === 0) {
			return `old_string not found in ${path} — use read_file to check the file contents first`;
		}
		if (count > 1) {
			return `old_string found ${count} times in ${path} — it must be unique. add more surrounding context to disambiguate`;
		}
		await Bun.write(path, text.replace(old_string, new_string));
		return `edited ${path}`;
	},
});

export const listDirectoryTool = tool({
	name: "list_directory",
	description: "List contents of a directory with types and sizes.",
	parameters: z.object({
		path: z.string().default(".").describe("Directory path"),
	}),
	execute: async (_ctx, { path }) => {
		const entries = await readdir(path, { withFileTypes: true });
		const lines = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = join(path, entry.name);
				const info = await stat(fullPath).catch(() => null);
				const type = entry.isDirectory() ? "dir" : "file";
				const size = info ? formatSize(info.size) : "?";
				return `${type}  ${size.padStart(7)}  ${entry.name}`;
			}),
		);
		return `${path} (${entries.length} entries):\n${lines.join("\n")}`;
	},
});

export const globFilesTool = tool({
	name: "glob_files",
	description:
		"Find files matching a glob pattern. Use for discovering files before reading or processing them.",
	parameters: z.object({
		pattern: z
			.string()
			.describe("Glob pattern — e.g. '**/*.ts', 'src/**/*.json'"),
		cwd: z.string().default(".").describe("Working directory"),
	}),
	execute: async (_ctx, { pattern, cwd }) => {
		const glob = new Glob(pattern);
		const matches: string[] = [];
		for await (const path of glob.scan({ cwd, dot: false })) {
			matches.push(path);
			if (matches.length >= 200) break;
		}
		if (matches.length === 0) {
			return `no files match "${pattern}" in ${cwd} — try a broader pattern`;
		}
		const suffix =
			matches.length >= 200 ? "\n(limited to 200 — narrow your pattern)" : "";
		return `${matches.length} file(s):\n${matches.join("\n")}${suffix}`;
	},
});
