import { lookupIcd10Tool } from "./lookup-icd10.js";
import { lookupHcpcsTool } from "./lookup-hcpcs.js";
import { validateCodePairTool } from "./validate-code-pair.js";
import { checkBundlingTool } from "./check-bundling.js";
import { checkMueTool } from "./check-mue.js";
import { checkAddonTool } from "./check-addon.js";
import { checkModifierTool } from "./check-modifier.js";
import { checkAgeSexTool } from "./check-age-sex.js";

export const allTools = [
  lookupIcd10Tool,
  lookupHcpcsTool,
  validateCodePairTool,
  checkBundlingTool,
  checkMueTool,
  checkAddonTool,
  checkModifierTool,
  checkAgeSexTool,
];

export {
  lookupIcd10Tool,
  lookupHcpcsTool,
  validateCodePairTool,
  checkBundlingTool,
  checkMueTool,
  checkAddonTool,
  checkModifierTool,
  checkAgeSexTool,
};
