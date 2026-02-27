import { z } from "zod";
import { tool } from "stratus-sdk";

function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + `\n... (truncated at ${max} chars)`;
}

export const bashTool = tool({
	name: "bash",
	description:
		"Run a shell command. Supports full unix CLI (curl, jq, awk, sed, sort, grep, wc), inline python3, node -e, pipes, redirects, and heredocs. 30s timeout.",
	parameters: z.object({
		command: z.string().describe("Shell command to execute"),
	}),
	timeout: 30000,
	execute: async (_ctx, { command }, options) => {
		const proc = Bun.spawn(["bash", "-c", command], {
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

			const parts: string[] = [];
			if (stdout.trim()) parts.push(truncate(stdout.trim(), 8000));
			if (stderr.trim())
				parts.push(`stderr: ${truncate(stderr.trim(), 2000)}`);
			if (exitCode !== 0) parts.push(`exit code: ${exitCode}`);

			return parts.length > 0
				? parts.join("\n")
				: "(no output)";
		} finally {
			clearTimeout(timeout);
			options?.signal?.removeEventListener("abort", onAbort);
		}
	},
});
