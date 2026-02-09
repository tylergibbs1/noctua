import {
  findPrevWordStart,
  findNextWordEnd,
  getLineAndColumn,
  getCursorPosition,
  getLineStart,
  getLineEnd,
  getLineCount,
} from './text-navigation.js';

export interface CursorContext {
  text: string;
  cursorPosition: number;
}

export const cursorHandlers = {
  moveLeft: (ctx: CursorContext): number =>
    Math.max(0, ctx.cursorPosition - 1),

  moveRight: (ctx: CursorContext): number =>
    Math.min(ctx.text.length, ctx.cursorPosition + 1),

  moveToLineStart: (ctx: CursorContext): number =>
    getLineStart(ctx.text, ctx.cursorPosition),

  moveToLineEnd: (ctx: CursorContext): number =>
    getLineEnd(ctx.text, ctx.cursorPosition),

  moveUp: (ctx: CursorContext): number | null => {
    const { line, column } = getLineAndColumn(ctx.text, ctx.cursorPosition);
    if (line === 0) return null;
    return getCursorPosition(ctx.text, line - 1, column);
  },

  moveDown: (ctx: CursorContext): number | null => {
    const { line, column } = getLineAndColumn(ctx.text, ctx.cursorPosition);
    const lineCount = getLineCount(ctx.text);
    if (line >= lineCount - 1) return null;
    return getCursorPosition(ctx.text, line + 1, column);
  },

  moveWordBackward: (ctx: CursorContext): number =>
    findPrevWordStart(ctx.text, ctx.cursorPosition),

  moveWordForward: (ctx: CursorContext): number =>
    findNextWordEnd(ctx.text, ctx.cursorPosition),
};
