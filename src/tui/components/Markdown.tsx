import React, { useMemo } from "react";
import { Text } from "ink";
import chalk from "chalk";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { transformMarkdownTables } from "../utils/markdown-table.js";
import { theme } from "../theme.js";

// force chalk to produce ANSI — Ink intercepts stdout which
// makes chalk think there's no TTY
chalk.level = 3;

marked.use(markedTerminal({
  reflowText: true,
  width: process.stdout.columns || 120,
  tab: 2,
  showSectionPrefix: false,
  strong: chalk.hex(theme.fg.primary).bold,
  em: chalk.hex(theme.fg.secondary).italic,
  codespan: chalk.hex(theme.accent.tertiary),
  heading: chalk.hex(theme.accent.primary).bold,
  firstHeading: chalk.hex(theme.accent.primary).bold,
  link: chalk.hex(theme.accent.secondary).underline,
  href: chalk.hex(theme.accent.secondary),
}));

type Props = {
  children: string;
};

/**
 * Normalize LLM markdown so marked parses it correctly:
 * - Dedent list items (4+ space indent → 0 indent, avoids code block)
 * - Ensure blank line before list blocks
 * - Convert markdown tables to box-drawing tables
 */
// Hoisted static regexes — avoid allocating on every render
const BARE_URL_RE = /(?<!\]\(|<)(https?:\/\/[^\s)\]>]+)/g;
const BULLET_RE = /^(\s*)\* /gm;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /(?<!\*)\*([^*]+)\*(?!\*)/g;

/**
 * Convert bare URLs to markdown links so marked-terminal renders them
 * as single styled spans instead of splitting them across lines during reflow.
 */
function protectUrls(text: string): string {
  return text.replace(BARE_URL_RE, (url) => `[${url}](${url})`);
}

function preprocess(raw: string): string {
  let text = raw;

  // protect bare URLs from being split across lines during reflow
  text = protectUrls(text);

  // transform markdown tables to box-drawing before marked touches them
  text = transformMarkdownTables(text);

  // dedent list items — LLMs often indent with 4+ spaces which
  // CommonMark interprets as a code block
  const lines = text.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^(\s{2,})([-*+]\s)/);
    if (listMatch) {
      // ensure blank line before list block starts
      if (i > 0 && result.length > 0 && result[result.length - 1].trim() !== '') {
        const prevLine = result[result.length - 1];
        if (!/^\s*[-*+]\s/.test(prevLine)) {
          result.push('');
        }
      }
      // strip leading whitespace from list item
      result.push(line.replace(/^\s+/, ''));
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Clean up marked-terminal output:
 * - Replace * bullets with • chars
 * - Apply bold on any remaining raw **...** (marked v17 compat fallback)
 * - Apply italic on any remaining raw *...*
 */
function postprocess(rendered: string): string {
  let text = rendered;
  text = text.replace(BULLET_RE, '$1\u2022 ');
  text = text.replace(BOLD_RE, (_, inner) =>
    chalk.hex(theme.fg.primary).bold(inner)
  );
  text = text.replace(ITALIC_RE, (_, inner) =>
    chalk.hex(theme.fg.secondary).italic(inner)
  );
  return text;
}

export function Markdown({ children }: Props) {
  const text = useMemo(() => {
    const processed = preprocess(children);
    const rendered = marked.parse(processed);
    return typeof rendered === "string" ? postprocess(rendered.trim()) : children;
  }, [children]);
  return <Text>{text}</Text>;
}
