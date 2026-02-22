import {
	webNavigateTool,
	webWaitTool,
	webClickTool,
	webHoverTool,
	webFillTool,
	webFillFormTool,
	webPressKeyTool,
	webSelectOptionTool,
	webFileUploadTool,
	webExtractTool,
	webSnapshotTool,
	webScreenshotTool,
	webEvaluateTool,
	webHandleDialogTool,
	webTabsTool,
	webCloseTool,
} from "./web.js";
import { bashTool } from "./bash.js";
import {
	readFileTool,
	writeFileTool,
	editFileTool,
	listDirectoryTool,
	globFilesTool,
} from "./files.js";
import { grepTool } from "./grep.js";
import { webCrawlTool } from "./crawl.js";

// Web + shell tools for the scraper subagent
export const scraperTools = [
	webCrawlTool,
	webNavigateTool,
	webWaitTool,
	webClickTool,
	webHoverTool,
	webFillTool,
	webFillFormTool,
	webPressKeyTool,
	webSelectOptionTool,
	webFileUploadTool,
	webExtractTool,
	webSnapshotTool,
	webScreenshotTool,
	webEvaluateTool,
	webHandleDialogTool,
	webTabsTool,
	webCloseTool,
	bashTool,
	writeFileTool,
];

// File + shell tools for the coder subagent
export const coderTools = [
	bashTool,
	readFileTool,
	writeFileTool,
	editFileTool,
	listDirectoryTool,
	globFilesTool,
	grepTool,
];

// All tools (for direct use / fallback)
export const allTools = [
	webCrawlTool,
	webNavigateTool,
	webWaitTool,
	webClickTool,
	webHoverTool,
	webFillTool,
	webFillFormTool,
	webPressKeyTool,
	webSelectOptionTool,
	webFileUploadTool,
	webExtractTool,
	webSnapshotTool,
	webScreenshotTool,
	webEvaluateTool,
	webHandleDialogTool,
	webTabsTool,
	webCloseTool,
	bashTool,
	readFileTool,
	writeFileTool,
	editFileTool,
	listDirectoryTool,
	globFilesTool,
	grepTool,
];
