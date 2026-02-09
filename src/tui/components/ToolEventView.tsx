import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

// tool display names — lowercase per brand voice, acronyms keep case
const TOOL_LABELS: Record<string, string> = {
  lookup_icd10: 'lookup ICD-10',
  lookup_hcpcs: 'lookup HCPCS',
  validate_code_pair: 'validate code pair',
  check_bundling: 'check bundling',
  check_mue: 'check MUE',
  check_addon: 'check add-on',
  check_modifier: 'check modifier',
  check_age_sex: 'check age/sex',
};

// Progress messages for each tool
const TOOL_PROGRESS: Record<string, string> = {
  lookup_icd10: 'validating diagnosis code',
  lookup_hcpcs: 'validating procedure code',
  validate_code_pair: 'checking PTP edit pair',
  check_bundling: 'scanning all PTP conflicts',
  check_mue: 'checking unit limits',
  check_addon: 'verifying add-on requirements',
  check_modifier: 'reviewing modifier usage',
  check_age_sex: 'checking demographic appropriateness',
};

function stripMcpPrefix(name: string): string {
  // SDK sends "mcp__<server>__<tool>" — strip the prefix
  const match = name.match(/^mcp__[^_]+__(.+)$/);
  return match ? match[1] : name;
}

function formatToolName(name: string): string {
  const bare = stripMcpPrefix(name);
  if (TOOL_LABELS[bare]) return TOOL_LABELS[bare];
  return bare.replace(/_/g, ' ');
}

function truncateAtWord(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const lastSpace = str.lastIndexOf(' ', maxLength);
  if (lastSpace > maxLength * 0.5) {
    return str.slice(0, lastSpace) + '...';
  }
  return str.slice(0, maxLength) + '...';
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => {
      const strValue = String(value);
      return `${key}=${truncateAtWord(strValue, 60)}`;
    })
    .join(', ');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncateResult(result: string, maxLength = 100): string {
  if (result.length <= maxLength) return result;
  return result.slice(0, maxLength) + '...';
}

// ─── Event types ───────────────────────────────────────────────────────────

export interface ToolStartEvent {
  type: 'tool_start';
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolEndEvent {
  type: 'tool_end';
  tool: string;
  args: Record<string, unknown>;
  result: string;
  duration: number;
}

export interface ToolErrorEvent {
  type: 'tool_error';
  tool: string;
  error: string;
}

export type ToolEvent = ToolStartEvent | ToolEndEvent | ToolErrorEvent;

export interface DisplayEvent {
  id: string;
  event: ToolEvent;
  completed?: boolean;
  endEvent?: ToolEvent;
}

// ─── View components ───────────────────────────────────────────────────────

interface ToolStartViewProps {
  tool: string;
  args: Record<string, unknown>;
  isActive?: boolean;
}

export function ToolStartView({ tool, args, isActive = false }: ToolStartViewProps) {
  const progressMsg = TOOL_PROGRESS[stripMcpPrefix(tool)] || 'working';
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent.secondary}>{'\u23FA'} </Text>
        <Text color={theme.fg.primary}>{formatToolName(tool)}</Text>
        <Text color={theme.fg.muted}>({formatArgs(args)})</Text>
      </Box>
      {isActive && (
        <Box marginLeft={2}>
          <Text color={theme.fg.muted}>{'\u23BF'}  </Text>
          <Text color={theme.accent.primary}>
            <Spinner type="dots" />
          </Text>
          <Text color={theme.fg.secondary}> {progressMsg}</Text>
        </Box>
      )}
    </Box>
  );
}

interface ToolEndViewProps {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  duration: number;
}

export function ToolEndView({ tool, args, result, duration }: ToolEndViewProps) {
  let summary = 'received data';

  try {
    const parsed = JSON.parse(result);
    if (parsed.content && Array.isArray(parsed.content)) {
      // MCP tool result format
      const textContent = parsed.content.find((c: { type: string }) => c.type === 'text');
      if (textContent?.text) {
        const innerText = textContent.text;
        try {
          const innerParsed = JSON.parse(innerText);
          if (innerParsed.found === false) {
            summary = 'not found';
          } else if (innerParsed.conflicts && Array.isArray(innerParsed.conflicts)) {
            summary = `found ${innerParsed.conflicts.length} conflict${innerParsed.conflicts.length !== 1 ? 's' : ''}`;
          } else if (innerParsed.code) {
            summary = `found ${innerParsed.code}`;
          } else if (innerParsed.valid !== undefined) {
            summary = innerParsed.valid ? 'valid' : 'invalid';
          } else {
            summary = truncateResult(innerText, 50);
          }
        } catch {
          summary = truncateResult(innerText, 50);
        }
      }
    } else if (Array.isArray(parsed)) {
      summary = `received ${parsed.length} item${parsed.length !== 1 ? 's' : ''}`;
    } else if (typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      summary = `received ${keys.length} field${keys.length !== 1 ? 's' : ''}`;
    }
  } catch {
    summary = truncateResult(result, 50);
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent.secondary}>{'\u23FA'} </Text>
        <Text color={theme.fg.primary}>{formatToolName(tool)}</Text>
        <Text color={theme.fg.muted}>({formatArgs(args)})</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={theme.fg.muted}>{'\u23BF'}  </Text>
        <Text color={theme.fg.secondary}>{summary}</Text>
        <Text color={theme.fg.muted}> in {formatDuration(duration)}</Text>
      </Box>
    </Box>
  );
}

interface ToolErrorViewProps {
  tool: string;
  error: string;
}

export function ToolErrorView({ tool, error }: ToolErrorViewProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent.primary}>{'\u23FA'} </Text>
        <Text color={theme.fg.primary}>{formatToolName(tool)}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={theme.fg.muted}>{'\u23BF'}  </Text>
        <Text color={theme.accent.primary}>error: {truncateResult(error, 80)}</Text>
      </Box>
    </Box>
  );
}

// ─── Event list ────────────────────────────────────────────────────────────

interface EventListViewProps {
  events: DisplayEvent[];
  activeToolId?: string;
}

export function EventListView({ events, activeToolId }: EventListViewProps) {
  return (
    <Box flexDirection="column" gap={0} marginTop={1}>
      {events.map((displayEvent) => {
        const { id, event, completed, endEvent } = displayEvent;

        // Completed tool — show end state
        if (event.type === 'tool_start' && completed && endEvent?.type === 'tool_end') {
          return (
            <Box key={id} marginBottom={1}>
              <ToolEndView
                tool={endEvent.tool}
                args={(event as ToolStartEvent).args}
                result={endEvent.result}
                duration={endEvent.duration}
              />
            </Box>
          );
        }

        if (event.type === 'tool_start' && completed && endEvent?.type === 'tool_error') {
          return (
            <Box key={id} marginBottom={1}>
              <ToolErrorView tool={endEvent.tool} error={endEvent.error} />
            </Box>
          );
        }

        // Active tool — show spinner
        if (event.type === 'tool_start') {
          return (
            <Box key={id} marginBottom={1}>
              <ToolStartView
                tool={event.tool}
                args={event.args}
                isActive={!completed && id === activeToolId}
              />
            </Box>
          );
        }

        return null;
      })}
    </Box>
  );
}
