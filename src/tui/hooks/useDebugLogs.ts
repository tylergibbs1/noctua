import { useState, useEffect } from 'react';
import type { LogEntry } from '../utils/logger.js';
import { logger } from '../utils/logger.js';

export function useDebugLogs(): LogEntry[] {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const unsubscribe = logger.subscribe((entries) => {
      setLogs(entries);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return logs;
}
