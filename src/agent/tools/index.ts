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

export const allTools = [
	// web — reading
	webCrawlTool,
	webNavigateTool,
	webWaitTool,
	// web — interaction
	webClickTool,
	webHoverTool,
	webFillTool,
	webFillFormTool,
	webPressKeyTool,
	webSelectOptionTool,
	webFileUploadTool,
	// web — extraction
	webExtractTool,
	webSnapshotTool,
	webScreenshotTool,
	webEvaluateTool,
	// web — management
	webHandleDialogTool,
	webTabsTool,
	webCloseTool,
	// shell
	bashTool,
	// files
	readFileTool,
	writeFileTool,
	editFileTool,
	listDirectoryTool,
	globFilesTool,
	// search
	grepTool,
];
