import { z } from "zod";

// ─── Pipeline Stage Types ────────────────────────────────────────────────

export type PipelineStage =
	| "recon"
	| "schema"
	| "codegen"
	| "test"
	| "repair"
	| "harden"
	| "done"
	| "failed";

// ─── Structured Output Schemas ───────────────────────────────────────────

/** Output of the recon stage — structured site analysis */
export const ReconReport = z.object({
	url: z.string(),
	siteName: z.string(),
	siteType: z
		.enum(["static_html", "spa", "api_first", "hybrid", "unknown"])
		.default("unknown"),
	pages: z.array(
		z.object({
			url: z.string(),
			purpose: z.enum([
				"search",
				"listing",
				"detail",
				"login",
				"other",
			]),
			formFields: z
				.array(
					z.object({
						name: z.string().nullable(),
						selector: z.string().nullable(),
						type: z.string(),
						required: z.boolean(),
						options: z
							.array(
								z.object({
									value: z.string(),
									text: z.string(),
								}),
							)
							.optional(),
					}),
				)
				.optional(),
			dataElements: z
				.array(
					z.object({
						name: z.string(),
						selector: z.string(),
						sampleValue: z.string().optional(),
					}),
				)
				.optional(),
			pagination: z
				.object({
					type: z.enum([
						"next_link",
						"url_param",
						"infinite_scroll",
						"load_more",
						"none",
					]),
					selector: z.string().optional(),
					paramName: z.string().optional(),
				})
				.optional(),
		}),
	),
	apiEndpoints: z
		.array(
			z.object({
				url: z.string(),
				method: z.string(),
				contentType: z.string().optional(),
				responseShape: z.string().optional(),
			}),
		)
		.optional(),
	antiBot: z.object({
		hasCaptcha: z.boolean(),
		hasCloudflare: z.boolean(),
		hasRateLimit: z.boolean(),
		requiresAuth: z.boolean(),
	}),
	sampleData: z.array(z.record(z.string(), z.unknown())).optional(),
	suggestedStrategy: z
		.enum(["form_search", "listing", "api_direct", "browser_only"])
		.default("form_search"),
});

export type ReconReport = z.infer<typeof ReconReport>;

/**
 * Output-safe variant of ReconReport for use with `outputType`.
 * Azure strict mode requires: no .optional() (use .nullable()), no .default(),
 * no z.record(), and every property in `required`.
 */
export const ReconReportOutput = z.object({
	url: z.string(),
	siteName: z.string(),
	siteType: z.enum(["static_html", "spa", "api_first", "hybrid", "unknown"]),
	pages: z.array(
		z.object({
			url: z.string(),
			purpose: z.enum(["search", "listing", "detail", "login", "other"]),
			formFields: z.array(
				z.object({
					name: z.string().nullable(),
					selector: z.string().nullable(),
					type: z.string(),
					required: z.boolean(),
					options: z.array(
						z.object({ value: z.string(), text: z.string() }),
					).nullable(),
				}),
			).nullable(),
			dataElements: z.array(
				z.object({
					name: z.string(),
					selector: z.string(),
					sampleValue: z.string().nullable(),
				}),
			).nullable(),
			pagination: z.object({
				type: z.enum(["next_link", "url_param", "infinite_scroll", "load_more", "none"]),
				selector: z.string().nullable(),
				paramName: z.string().nullable(),
			}).nullable(),
		}),
	),
	apiEndpoints: z.array(
		z.object({
			url: z.string(),
			method: z.string(),
			contentType: z.string().nullable(),
			responseShape: z.string().nullable(),
		}),
	).nullable(),
	antiBot: z.object({
		hasCaptcha: z.boolean(),
		hasCloudflare: z.boolean(),
		hasRateLimit: z.boolean(),
		requiresAuth: z.boolean(),
	}),
	sampleData: z.array(z.string()).nullable(),
	suggestedStrategy: z.enum(["form_search", "listing", "api_direct", "browser_only"]),
});

export type ReconReportOutput = z.infer<typeof ReconReportOutput>;

/** Output of the test stage */
export const TestReport = z.object({
	success: z.boolean(),
	exitCode: z.number(),
	timedOut: z.boolean(),
	recordCount: z.number(),
	schemaErrors: z.array(
		z.object({
			path: z.string().optional(),
			message: z.string(),
		}),
	),
	sampleRecords: z.array(z.record(z.string(), z.unknown())),
	fieldCoverage: z.record(z.string(), z.number()),
	stdout: z.string(),
	stderr: z.string(),
	durationMs: z.number(),
});

export type TestReport = z.infer<typeof TestReport>;

/**
 * Output-safe variant of TestReport for use with `outputType`.
 * Azure strict mode requires: no .optional() (use .nullable()), no .default(),
 * no z.record(), and every property in `required`.
 */
export const TestReportOutput = z.object({
	success: z.boolean(),
	exitCode: z.number(),
	timedOut: z.boolean(),
	recordCount: z.number(),
	schemaErrors: z.array(
		z.object({
			path: z.string().nullable(),
			message: z.string(),
		}),
	),
	sampleRecords: z.array(z.string()),
	fieldCoverage: z.array(z.string()),
	stdout: z.string(),
	stderr: z.string(),
	durationMs: z.number(),
});

export type TestReportOutput = z.infer<typeof TestReportOutput>;

// ─── Pipeline State ──────────────────────────────────────────────────────

export interface PipelineState {
	/** Project identifier (slug) */
	projectName: string;

	/** Target URL to scrape */
	targetUrl: string;

	/** Original user intent */
	userIntent: string;

	/** Working directory for this pipeline run */
	workDir: string;

	/** Current pipeline stage */
	currentStage: PipelineStage;

	/** Stage outputs (populated as pipeline progresses) */
	reconReport?: ReconReport;
	schemaPath?: string;
	generatedFiles?: string[];
	scraperDir?: string;
	testResults: TestReport[];

	/** Repair tracking */
	repairAttempts: number;
	maxRepairAttempts: number;

	/** Error info if pipeline failed */
	error?: string;

	/** Timestamps */
	startedAt: string;
	completedAt?: string;
}

// ─── Pipeline Events ─────────────────────────────────────────────────────

export type PipelineEvent =
	| { type: "stage_start"; stage: PipelineStage }
	| {
			type: "stage_complete";
			stage: PipelineStage;
			durationMs: number;
			summary?: string;
	  }
	| { type: "stage_error"; stage: PipelineStage; error: string }
	| { type: "test_result"; report: TestReport; attempt: number }
	| { type: "repair_attempt"; attempt: number; maxAttempts: number }
	| { type: "stage_tool_start"; stage: PipelineStage; tool: string }
	| { type: "stage_tool_end"; stage: PipelineStage; tool: string; durationMs: number }
	| { type: "pipeline_complete"; scraperDir: string; recordCount: number }
	| { type: "pipeline_failed"; reason: string; stage: PipelineStage };

// ─── State Persistence ───────────────────────────────────────────────────

export function createInitialState(
	projectName: string,
	targetUrl: string,
	userIntent: string,
	workDir: string,
): PipelineState {
	return {
		projectName,
		targetUrl,
		userIntent,
		workDir,
		currentStage: "recon",
		testResults: [],
		repairAttempts: 0,
		maxRepairAttempts: 5,
		startedAt: new Date().toISOString(),
	};
}

export async function saveState(state: PipelineState): Promise<void> {
	const path = `${state.workDir}/state.json`;
	await Bun.write(path, JSON.stringify(state, null, 2));
}

export async function loadState(workDir: string): Promise<PipelineState | null> {
	const path = `${workDir}/state.json`;
	const file = Bun.file(path);
	if (!(await file.exists())) return null;
	return JSON.parse(await file.text());
}

// ─── Helpers ─────────────────────────────────────────────────────────────

export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 50);
}
