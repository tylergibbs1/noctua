import type { ClaimResult, Category, Severity, Finding } from "../types/finding.js";

/**
 * Expected finding: what the eval case expects the agent to detect.
 * A finding "matches" if category matches AND (code matches OR code is omitted in expected).
 */
export type ExpectedFinding = {
  category: Category;
  code?: string;
  severity?: Severity;
};

export type EvalExpected = {
  /** Specific findings the agent MUST produce (true positives) */
  expectedFindings?: ExpectedFinding[];
  /** Categories that MUST NOT appear (for clean claims) */
  mustNotHaveCategories?: Category[];
  /** Severities that MUST NOT appear (e.g., no "error" on clean claims) */
  mustNotHaveSeverity?: Severity[];
  /** Risk score bounds */
  minRiskScore?: number;
  maxRiskScore?: number;
};

export type EvalScore = {
  name: string;
  passed: boolean;
  /** Per-check results */
  checks: Array<{
    check: string;
    passed: boolean;
    detail: string;
  }>;
  /** True positives: expected findings that were correctly detected */
  truePositives: number;
  /** False negatives: expected findings that were missed */
  falseNegatives: number;
  /** False positives: findings that don't match any expected finding */
  falsePositives: number;
  /** Severity accuracy: of matched findings, how many had correct severity */
  severityCorrect: number;
  severityTotal: number;
};

/**
 * Match an actual finding against expected findings, skipping already-matched indices.
 * Returns the index of the matched expected finding, or -1.
 */
function matchFinding(actual: Finding, expected: ExpectedFinding[], alreadyMatched: Set<number>): number {
  for (let i = 0; i < expected.length; i++) {
    if (alreadyMatched.has(i)) continue;
    const exp = expected[i];
    if (actual.category !== exp.category) continue;
    if (exp.code && actual.code !== exp.code) continue;
    return i;
  }
  return -1;
}

export function scoreResult(
  name: string,
  result: ClaimResult,
  expected: EvalExpected
): EvalScore {
  const checks: EvalScore["checks"] = [];
  let truePositives = 0;
  let falseNegatives = 0;
  let falsePositives = 0;
  let severityCorrect = 0;
  let severityTotal = 0;

  // --- Expected findings (precision/recall per case) ---
  if (expected.expectedFindings && expected.expectedFindings.length > 0) {
    const matched = new Set<number>(); // indices of matched expected findings
    const actualMatched = new Set<number>(); // indices of matched actual findings

    // For each actual finding, try to match to an expected finding
    for (let ai = 0; ai < result.findings.length; ai++) {
      const actual = result.findings[ai];
      const idx = matchFinding(actual, expected.expectedFindings, matched);
      if (idx >= 0) {
        matched.add(idx);
        actualMatched.add(ai);
        truePositives++;

        // Check severity accuracy
        const exp = expected.expectedFindings[idx];
        if (exp.severity) {
          severityTotal++;
          if (actual.severity === exp.severity) {
            severityCorrect++;
          } else {
            checks.push({
              check: `severity:${exp.category}${exp.code ? ":" + exp.code : ""}`,
              passed: false,
              detail: `Expected severity '${exp.severity}', got '${actual.severity}'`,
            });
          }
        }
      }
    }

    // Unmatched expected = false negatives
    for (let i = 0; i < expected.expectedFindings.length; i++) {
      if (!matched.has(i)) {
        falseNegatives++;
        const exp = expected.expectedFindings[i];
        checks.push({
          check: `recall:${exp.category}${exp.code ? ":" + exp.code : ""}`,
          passed: false,
          detail: `Expected finding not detected: ${exp.category}${exp.code ? " for " + exp.code : ""}`,
        });
      } else {
        checks.push({
          check: `recall:${expected.expectedFindings[i].category}`,
          passed: true,
          detail: `Correctly detected: ${expected.expectedFindings[i].category}${expected.expectedFindings[i].code ? " for " + expected.expectedFindings[i].code : ""}`,
        });
      }
    }

    // Count unmatched actuals with error/warning severity as false positives
    // (info-level findings are not penalized)
    for (let ai = 0; ai < result.findings.length; ai++) {
      if (!actualMatched.has(ai) && result.findings[ai].severity !== "info") {
        falsePositives++;
      }
    }

    if (falsePositives > 0) {
      checks.push({
        check: "falsePositives",
        passed: false,
        detail: `${falsePositives} unexpected error/warning finding(s) generated`,
      });
    }
  }

  // --- Must-not-have categories ---
  if (expected.mustNotHaveCategories) {
    const foundCategories = new Set(result.findings.map((f) => f.category));
    for (const cat of expected.mustNotHaveCategories) {
      const passed = !foundCategories.has(cat);
      checks.push({
        check: `mustNotHave:${cat}`,
        passed,
        detail: passed
          ? `Correctly absent: '${cat}'`
          : `Unexpected category '${cat}' found (false positive)`,
      });
      if (!passed) falsePositives++;
    }
  }

  // --- Must-not-have severities ---
  if (expected.mustNotHaveSeverity) {
    const foundSeverities = new Set(result.findings.map((f) => f.severity));
    for (const sev of expected.mustNotHaveSeverity) {
      const passed = !foundSeverities.has(sev);
      checks.push({
        check: `mustNotHaveSeverity:${sev}`,
        passed,
        detail: passed
          ? `No '${sev}'-level findings (good)`
          : `Found '${sev}'-level finding(s) on a claim that should not have them`,
      });
    }
  }

  // --- Risk score bounds ---
  if (expected.minRiskScore !== undefined) {
    const passed = result.riskScore >= expected.minRiskScore;
    checks.push({
      check: "minRiskScore",
      passed,
      detail: `Expected >= ${expected.minRiskScore}, got ${result.riskScore}`,
    });
  }

  if (expected.maxRiskScore !== undefined) {
    const passed = result.riskScore <= expected.maxRiskScore;
    checks.push({
      check: "maxRiskScore",
      passed,
      detail: `Expected <= ${expected.maxRiskScore}, got ${result.riskScore}`,
    });
  }

  return {
    name,
    passed: checks.every((c) => c.passed),
    checks,
    truePositives,
    falseNegatives,
    falsePositives,
    severityCorrect,
    severityTotal,
  };
}

/** Compute aggregate precision/recall/F1 across all eval scores */
export function computeAggregateMetrics(scores: EvalScore[]): {
  precision: number;
  recall: number;
  f1: number;
  severityAccuracy: number;
  passRate: number;
} {
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalSevCorrect = 0;
  let totalSevTotal = 0;
  let passed = 0;

  for (const s of scores) {
    totalTP += s.truePositives;
    totalFP += s.falsePositives;
    totalFN += s.falseNegatives;
    totalSevCorrect += s.severityCorrect;
    totalSevTotal += s.severityTotal;
    if (s.passed) passed++;
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const severityAccuracy = totalSevTotal > 0 ? totalSevCorrect / totalSevTotal : 1;
  const passRate = scores.length > 0 ? passed / scores.length : 0;

  return { precision, recall, f1, severityAccuracy, passRate };
}
