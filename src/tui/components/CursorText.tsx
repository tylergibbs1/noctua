import React from 'react';
import { Text } from 'ink';
import chalk from 'chalk';

interface CursorTextProps {
  text: string;
  cursorPosition: number;
}

export function CursorText({ text, cursorPosition }: CursorTextProps) {
  const beforeCursor = text.slice(0, cursorPosition);
  const charAtCursor = cursorPosition < text.length ? text[cursorPosition] : null;

  const atCursor = charAtCursor === '\n' || charAtCursor === null ? ' ' : charAtCursor;

  const afterCursor =
    charAtCursor === '\n'
      ? '\n' + text.slice(cursorPosition + 1)
      : text.slice(cursorPosition + 1);

  let displayText = beforeCursor + chalk.inverse(atCursor) + afterCursor;

  const indent = '  ';
  displayText = displayText.replace(/\n/g, '\n' + indent);

  return <Text>{displayText}</Text>;
}
