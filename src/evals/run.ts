import { ClaimSchema } from "../types/claim.js";
import type { ClaimResult } from "../types/finding.js";
import { getDb, closeDb } from "../db/index.js";
import { runQuery, type UsageMetrics } from "../agent/session.js";
import { scoreResult, computeAggregateMetrics, type EvalExpected, type EvalScore } from "./scorer.js";
import dataset from "./dataset.json";

type EvalCase = {
  name: string;
  description: string;
  claim: unknown;
  expected: EvalExpected;
};

const SUCCESS_CRITERIA = {
  minRecall: 0.85,
  minPrecision: 0.70,
  minF1: 0.75,
  minSeverityAccuracy: 0.80,
  minPassRate: 0.80,
  maxP95LatencyMs: 60_000,
};

function buildPrompt(claimJson: string): string {
  return `Analyze the following medical claim for denial risk. Follow the full 6-step validation workflow using all available tools. After all checks, provide findings as JSON.

<claim>
${claimJson}
</claim>`;
}

function extractClaimResult(text: string, claimId: string): ClaimResult {
  const jsonMatch = text.match(/\{[\s\S]*"findings"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        claimId: parsed.claimId ?? claimId,
        findings: parsed.findings ?? [],
        riskScore: parsed.riskScore ?? 0,
        summary: parsed.summary ?? "analysis complete",
      };
    } catch {
      // fall through
    }
  }
  return {
    claimId,
    findings: [],
    riskScore: 0,
    summary: text.slice(0, 500) || "no findings generated",
  };
}

export async function runEvals(options: { model?: string } = {}): Promise<void> {
  getDb();

  const cases = dataset as EvalCase[];
  const allScores: EvalScore[] = [];
  const durations: number[] = [];
  const allUsage: UsageMetrics[] = [];

  console.log(`\nClaimGuard Evaluation Suite`);
  console.log(`Running ${cases.length} test cases...\n`);

  for (const evalCase of cases) {
    const claim = ClaimSchema.parse(evalCase.claim);
    const start = Date.now();

    console.log(`  Running: ${evalCase.name} — ${evalCase.description}`);

    try {
      const claimJson = JSON.stringify(claim, null, 2);
      const { answer, usage } = await runQuery(buildPrompt(claimJson), {}, { model: options.model });
      const duration = Date.now() - start;
      durations.push(duration);
      if (usage) allUsage.push(usage);

      const claimResult = extractClaimResult(answer, claim.claimId);
      const score = scoreResult(evalCase.name, claimResult, evalCase.expected);
      allScores.push(score);

      if (score.passed) {
        console.log(`  ✓ PASS (${(duration / 1000).toFixed(1)}s)`);
      } else {
        console.log(`  ✗ FAIL (${(duration / 1000).toFixed(1)}s)`);
        for (const check of score.checks) {
          if (!check.passed) {
            console.log(`    - ${check.check}: ${check.detail}`);
          }
        }
      }
      const cacheInfo = usage
        ? ` | Cache: ${usage.cacheReadInputTokens} read, ${usage.cacheCreationInputTokens} write, $${usage.totalCostUsd.toFixed(4)}`
        : "";
      console.log(`    Findings: ${claimResult.findings.length}, Risk: ${claimResult.riskScore}, TP: ${score.truePositives}, FP: ${score.falsePositives}, FN: ${score.falseNegatives}${cacheInfo}`);
    } catch (err) {
      const duration = Date.now() - start;
      durations.push(duration);
      allScores.push({
        name: evalCase.name,
        passed: false,
        checks: [{ check: "runtime", passed: false, detail: `Error: ${err instanceof Error ? err.message : err}` }],
        truePositives: 0,
        falseNegatives: (evalCase.expected.expectedFindings ?? []).length,
        falsePositives: 0,
        severityCorrect: 0,
        severityTotal: 0,
      });
      console.log(`  ✗ ERROR (${(duration / 1000).toFixed(1)}s): ${err instanceof Error ? err.message : err}`);
    }
    console.log();
  }

  // Aggregate metrics
  const metrics = computeAggregateMetrics(allScores);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p95Index = Math.ceil(sortedDurations.length * 0.95) - 1;
  const p95Latency = sortedDurations[p95Index] ?? 0;
  const totalTime = durations.reduce((sum, d) => sum + d, 0);

  console.log(`${"=".repeat(60)}`);
  console.log(`\n  AGGREGATE METRICS\n`);
  console.log(`  Precision:          ${(metrics.precision * 100).toFixed(1)}% (target: >= ${SUCCESS_CRITERIA.minPrecision * 100}%)`);
  console.log(`  Recall:             ${(metrics.recall * 100).toFixed(1)}% (target: >= ${SUCCESS_CRITERIA.minRecall * 100}%)`);
  console.log(`  F1 Score:           ${(metrics.f1 * 100).toFixed(1)}% (target: >= ${SUCCESS_CRITERIA.minF1 * 100}%)`);
  console.log(`  Severity Accuracy:  ${(metrics.severityAccuracy * 100).toFixed(1)}% (target: >= ${SUCCESS_CRITERIA.minSeverityAccuracy * 100}%)`);
  console.log(`  Pass Rate:          ${(metrics.passRate * 100).toFixed(1)}% (target: >= ${SUCCESS_CRITERIA.minPassRate * 100}%)`);
  console.log(`  P95 Latency:        ${(p95Latency / 1000).toFixed(1)}s (target: < ${SUCCESS_CRITERIA.maxP95LatencyMs / 1000}s)`);
  console.log(`  Total Time:         ${(totalTime / 1000).toFixed(1)}s`);

  if (allUsage.length > 0) {
    const totalCacheRead = allUsage.reduce((s, u) => s + u.cacheReadInputTokens, 0);
    const totalCacheWrite = allUsage.reduce((s, u) => s + u.cacheCreationInputTokens, 0);
    const totalInput = allUsage.reduce((s, u) => s + u.inputTokens, 0);
    const totalOutput = allUsage.reduce((s, u) => s + u.outputTokens, 0);
    const totalCost = allUsage.reduce((s, u) => s + u.totalCostUsd, 0);
    const totalTokens = totalInput + totalCacheRead + totalCacheWrite;
    const cacheHitRate = totalTokens > 0 ? totalCacheRead / totalTokens : 0;

    console.log(`\n  CACHE & COST\n`);
    console.log(`  Cache Read Tokens:  ${totalCacheRead.toLocaleString()}`);
    console.log(`  Cache Write Tokens: ${totalCacheWrite.toLocaleString()}`);
    console.log(`  Uncached Tokens:    ${totalInput.toLocaleString()}`);
    console.log(`  Output Tokens:      ${totalOutput.toLocaleString()}`);
    console.log(`  Cache Hit Rate:     ${(cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  Total Cost:         $${totalCost.toFixed(4)}`);
    console.log(`  Avg Cost/Claim:     $${(totalCost / allUsage.length).toFixed(4)}`);
  }
  console.log();

  const criteriaResults = [
    { name: "Precision", met: metrics.precision >= SUCCESS_CRITERIA.minPrecision },
    { name: "Recall", met: metrics.recall >= SUCCESS_CRITERIA.minRecall },
    { name: "F1", met: metrics.f1 >= SUCCESS_CRITERIA.minF1 },
    { name: "Severity Accuracy", met: metrics.severityAccuracy >= SUCCESS_CRITERIA.minSeverityAccuracy },
    { name: "Pass Rate", met: metrics.passRate >= SUCCESS_CRITERIA.minPassRate },
    { name: "P95 Latency", met: p95Latency <= SUCCESS_CRITERIA.maxP95LatencyMs },
  ];

  console.log(`  SUCCESS CRITERIA\n`);
  for (const cr of criteriaResults) {
    console.log(`  ${cr.met ? "✓" : "✗"} ${cr.name}`);
  }

  const allMet = criteriaResults.every((cr) => cr.met);
  console.log(`\n  ${allMet ? "✓ ALL CRITERIA MET" : "✗ SOME CRITERIA NOT MET"}`);

  if (!allMet) {
    console.log(`\n  Failed cases:`);
    for (const s of allScores) {
      if (!s.passed) console.log(`    - ${s.name}`);
    }
  }

  console.log();
}

// CLI entry point
if (import.meta.main) {
  const model = process.argv.includes("--model")
    ? process.argv[process.argv.indexOf("--model") + 1]
    : undefined;
  await runEvals({ model });
  closeDb();
}
