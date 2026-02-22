import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../theme.js';
import { useTextBuffer } from '../hooks/useTextBuffer.js';
import { cursorHandlers } from '../utils/input-key-handlers.js';
import { CursorText } from './CursorText.js';

interface InputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  onHistoryUp?: (currentText: string) => string | null;
  onHistoryDown?: () => string | null;
}

export function Input({ onSubmit, placeholder, onHistoryUp, onHistoryDown }: InputProps) {
  const { text, cursorPosition, actions } = useTextBuffer();

  useInput((input, key) => {
    const ctx = { text, cursorPosition };

    if (key.upArrow) {
      const newPos = cursorHandlers.moveUp(ctx);
      if (newPos !== null) {
        actions.moveCursor(newPos);
      } else if (onHistoryUp) {
        const historyText = onHistoryUp(text);
        if (historyText !== null) {
          actions.setValue(historyText);
        }
      }
      return;
    }

    if (key.downArrow) {
      const newPos = cursorHandlers.moveDown(ctx);
      if (newPos !== null) {
        actions.moveCursor(newPos);
      } else if (onHistoryDown) {
        const historyText = onHistoryDown();
        if (historyText !== null) {
          actions.setValue(historyText);
        }
      }
      return;
    }

    if (key.leftArrow && !key.ctrl && !key.meta) {
      actions.moveCursor(cursorHandlers.moveLeft(ctx));
      return;
    }

    if (key.rightArrow && !key.ctrl && !key.meta) {
      actions.moveCursor(cursorHandlers.moveRight(ctx));
      return;
    }

    if (key.ctrl && input === 'a') {
      actions.moveCursor(cursorHandlers.moveToLineStart(ctx));
      return;
    }

    if (key.ctrl && input === 'e') {
      actions.moveCursor(cursorHandlers.moveToLineEnd(ctx));
      return;
    }

    if ((key.meta && key.leftArrow) || (key.ctrl && key.leftArrow) || (key.meta && input === 'b')) {
      actions.moveCursor(cursorHandlers.moveWordBackward(ctx));
      return;
    }

    if ((key.meta && key.rightArrow) || (key.ctrl && key.rightArrow) || (key.meta && input === 'f')) {
      actions.moveCursor(cursorHandlers.moveWordForward(ctx));
      return;
    }

    if ((key.meta || key.ctrl) && (key.backspace || key.delete)) {
      actions.deleteWordBackward();
      return;
    }

    if (key.backspace || key.delete) {
      actions.deleteBackward();
      return;
    }

    if (key.return && key.shift) {
      actions.insert('\n');
      return;
    }

    if (key.return) {
      const val = text.trim();
      if (val) {
        onSubmit(val);
        actions.clear();
      }
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      actions.insert(input);
    }
  });

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="single"
      borderColor={theme.border.standard}
      borderLeft={false}
      borderRight={false}
      width="100%"
    >
      <Box paddingX={1}>
        <Text color={theme.accent.primary} bold>
          {'>  '}
        </Text>
        {text ? (
          <CursorText text={text} cursorPosition={cursorPosition} />
        ) : (
          <Text color={theme.fg.muted}>{placeholder || ''}</Text>
        )}
      </Box>
    </Box>
  );
}
