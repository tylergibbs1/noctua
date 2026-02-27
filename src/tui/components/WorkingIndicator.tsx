import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';
import { getRandomThinkingVerb } from '../utils/thinking-verbs.js';

/**
 * Hex color blending for cosine shimmer.
 * t=0 → base color, t=1 → highlight color.
 */
function blendHex(base: string, highlight: string, t: number): string {
  const b = parseInt(base.slice(1), 16);
  const h = parseInt(highlight.slice(1), 16);
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const hr = (h >> 16) & 0xff, hg = (h >> 8) & 0xff, hb = h & 0xff;
  const r = Math.round(br + (hr - br) * t);
  const g = Math.round(bg + (hg - bg) * t);
  const bv = Math.round(bb + (hb - bb) * t);
  return `#${((r << 16) | (g << 8) | bv).toString(16).padStart(6, '0')}`;
}

const BAND_HALF_WIDTH = 5;
const SWEEP_DURATION = 2000; // ms
const PAUSE_DURATION = 2000; // ms between sweeps

function ShineText({ text, color, shineColor }: { text: string; color: string; shineColor: string }) {
  const [shinePos, setShinePos] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) {
      const timeout = setTimeout(() => {
        setShinePos(0);
        setIsPaused(false);
      }, PAUSE_DURATION);
      return () => clearTimeout(timeout);
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pos = (elapsed / SWEEP_DURATION) * (text.length + BAND_HALF_WIDTH * 2) - BAND_HALF_WIDTH;
      if (pos >= text.length + BAND_HALF_WIDTH) {
        setIsPaused(true);
        return;
      }
      setShinePos(pos);
    }, 16); // ~60fps for smooth gradient

    return () => clearInterval(interval);
  }, [isPaused, text.length]);

  const parts = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let i = 0; i < text.length; i++) {
      let charColor = color;
      if (!isPaused) {
        const dist = Math.abs(i - shinePos);
        if (dist < BAND_HALF_WIDTH) {
          const t = 0.5 * (1 + Math.cos(Math.PI * dist / BAND_HALF_WIDTH));
          charColor = blendHex(color, shineColor, t);
        }
      }
      result.push(
        <Text key={i} color={charColor}>
          {text[i]}
        </Text>
      );
    }
    return result;
  }, [text, shinePos, isPaused, color, shineColor]);

  return <>{parts}</>;
}

export type WorkingState =
  | { status: 'idle' }
  | { status: 'thinking' }
  | { status: 'tool'; toolName: string }
  | { status: 'answering'; startTime: number };

interface WorkingIndicatorProps {
  state: WorkingState;
}

export function WorkingIndicator({ state }: WorkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);
  const [thinkingVerb, setThinkingVerb] = useState(getRandomThinkingVerb);
  const prevStatusRef = useRef<WorkingState['status']>('idle');

  useEffect(() => {
    const isThinking = state.status === 'thinking' || state.status === 'tool';
    const wasThinking = prevStatusRef.current === 'thinking' || prevStatusRef.current === 'tool';

    if (isThinking && !wasThinking) {
      setThinkingVerb(getRandomThinkingVerb());
    }

    prevStatusRef.current = state.status;
  }, [state.status]);

  useEffect(() => {
    if (state.status !== 'answering') {
      setElapsed(0);
      return;
    }

    const startTime = state.startTime;
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.status, state.status === 'answering' ? state.startTime : 0]);

  if (state.status === 'idle') {
    return null;
  }

  let statusWord: string;
  switch (state.status) {
    case 'thinking':
    case 'tool':
      statusWord = `${thinkingVerb}...`;
      break;
    case 'answering':
      statusWord = `answering (${elapsed}s)`;
      break;
  }

  return (
    <Box>
      <Text color={theme.accent.primary}>
        <Spinner type="dots" />
      </Text>
      <Text color={theme.accent.primary}>{'  '}</Text>
      <ShineText text={statusWord} color={theme.accent.primary} shineColor={theme.fg.primary} />
      <Text color={theme.fg.muted}> (</Text>
      <Text color={theme.fg.muted} bold>esc</Text>
      <Text color={theme.fg.muted}> to interrupt)</Text>
    </Box>
  );
}
