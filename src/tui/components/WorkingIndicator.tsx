import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';
import { getRandomThinkingVerb } from '../utils/thinking-verbs.js';

function ShineText({ text, color, shineColor }: { text: string; color: string; shineColor: string }) {
  const [shinePos, setShinePos] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) {
      const timeout = setTimeout(() => {
        setShinePos(0);
        setIsPaused(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }

    const interval = setInterval(() => {
      setShinePos((prev) => {
        const next = prev + 1;
        if (next >= text.length) {
          setIsPaused(true);
          return prev;
        }
        return next;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [isPaused, text.length]);

  const parts = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let i = 0; i < text.length; i++) {
      const isShine = !isPaused && Math.abs(i - shinePos) < 1.25;
      result.push(
        <Text key={i} color={isShine ? shineColor : color}>
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
  }, [state]);

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
