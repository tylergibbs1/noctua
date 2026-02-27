import { prompt, createCostEstimator, withTrace } from "stratus-sdk";
import { AzureResponsesModel } from "stratus-sdk/azure";
import { ReconReportOutput } from "./src/pipeline/state.js";
import { buildReconExplorePrompt, buildReconSynthesizePrompt } from "./src/pipeline/stages/index.js";
import { scraperTools } from "./src/agent/tools/index.js";
import { readFileTool } from "./src/agent/tools/files.js";

const model = new AzureResponsesModel({
  endpoint: process.env.AZURE_ENDPOINT || "",
  apiKey: process.env.AZURE_API_KEY || "",
  deployment: process.env.AZURE_DEPLOYMENT || "gpt-5.2-codex",
});

const costEstimator = createCostEstimator({
  inputTokenCostPer1k: 0.003,
  outputTokenCostPer1k: 0.015,
  cachedInputTokenCostPer1k: 0.0003,
});

function extractFindings(messages: any[]) {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.content) parts.push(msg.content);
    else if (msg.role === "tool" && msg.content) parts.push(msg.content);
  }
  return parts.join("\n\n").slice(0, 15000);
}

const state = {
  targetUrl: "https://publicaccess.courts.state.mn.us/CaseSearch",
  userIntent: "minnesota court records with case number, filing date, case type, court location, parties, and case status",
};

await withTrace("test-pipeline", async () => {
  // Phase 1: REAL explore with actual web tools  
  console.log("Phase 1: real explore...");
  const exploreResult = await prompt(buildReconExplorePrompt(state as any), {
    model,
    tools: [...scraperTools, readFileTool],
    maxTurns: 50,
    costEstimator,
    maxBudgetUsd: 1.4,
    modelSettings: { reasoningEffort: "medium" },
    instructions: "You are a site reconnaissance agent. Explore the target website using the provided tools and summarize your findings.",
  });
  
  const findings = exploreResult.output
    ? exploreResult.output.slice(0, 15000)
    : extractFindings(exploreResult.messages);
  console.log("Explore:", exploreResult.numTurns, "turns,", findings.length, "chars findings, finishReason:", exploreResult.finishReason);

  // Phase 2: synthesize
  console.log("Phase 2: synthesize...");
  const start = Date.now();
  const synthResult = await prompt(buildReconSynthesizePrompt(state as any, findings), {
    model,
    outputType: ReconReportOutput,
    maxTurns: 1,
    costEstimator,
    maxBudgetUsd: 0.6,
    modelSettings: { reasoningEffort: "medium" },
    instructions: "Convert site exploration findings into the structured JSON report schema.",
  });
  console.log("Synth:", Date.now() - start, "ms");
  console.log("  output:", synthResult.output?.length ?? 0, "chars");
  console.log("  finishReason:", synthResult.finishReason);
  console.log("  hasFinalOutput:", Boolean(synthResult.finalOutput));
  if (synthResult.finalOutput) {
    const fo = synthResult.finalOutput as any;
    console.log("  pages:", fo.pages?.length, "strategy:", fo.suggestedStrategy);
  }
});
