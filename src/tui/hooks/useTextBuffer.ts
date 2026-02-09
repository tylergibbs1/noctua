import { useRef, useState, useCallback } from 'react';
import { findPrevWordStart } from '../utils/text-navigation.js';

export interface TextBufferActions {
  insert: (text: string) => void;
  deleteBackward: () => void;
  deleteWordBackward: () => void;
  moveCursor: (position: number) => void;
  clear: () => void;
  setValue: (value: string, cursorAtEnd?: boolean) => void;
}

export interface UseTextBufferResult {
  text: string;
  cursorPosition: number;
  actions: TextBufferActions;
}

/**
 * Text buffer with cursor position using refs to avoid race conditions
 */
export function useTextBuffer(): UseTextBufferResult {
  const buffer = useRef('');
  const cursorPos = useRef(0);
  const [, forceRender] = useState(0);

  const rerender = useCallback(() => forceRender(x => x + 1), []);

  const actions: TextBufferActions = {
    insert: (input: string) => {
      const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      buffer.current =
        buffer.current.slice(0, cursorPos.current) +
        normalized +
        buffer.current.slice(cursorPos.current);
      cursorPos.current += normalized.length;
      rerender();
    },

    deleteBackward: () => {
      if (cursorPos.current > 0) {
        buffer.current =
          buffer.current.slice(0, cursorPos.current - 1) +
          buffer.current.slice(cursorPos.current);
        cursorPos.current--;
        rerender();
      }
    },

    deleteWordBackward: () => {
      if (cursorPos.current > 0) {
        const wordStart = findPrevWordStart(buffer.current, cursorPos.current);
        buffer.current =
          buffer.current.slice(0, wordStart) +
          buffer.current.slice(cursorPos.current);
        cursorPos.current = wordStart;
        rerender();
      }
    },

    moveCursor: (position: number) => {
      cursorPos.current = Math.max(0, Math.min(buffer.current.length, position));
      rerender();
    },

    clear: () => {
      buffer.current = '';
      cursorPos.current = 0;
      rerender();
    },

    setValue: (value: string, cursorAtEnd = true) => {
      buffer.current = value;
      cursorPos.current = cursorAtEnd ? value.length : 0;
      rerender();
    },
  };

  return {
    text: buffer.current,
    cursorPosition: cursorPos.current,
    actions,
  };
}
