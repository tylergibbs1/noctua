import { useRef, useCallback, useState, useEffect } from 'react';
import { ChatHistory } from '../utils/chat-history.js';

const chatHistory = new ChatHistory();

export function useInputHistory() {
  const messagesRef = useRef<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const draftRef = useRef('');

  // load persistent history on mount
  useEffect(() => {
    chatHistory.load().then(() => {
      messagesRef.current = chatHistory.getMessageStrings();
    });
  }, []);

  const saveMessage = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    // avoid consecutive duplicates
    if (messagesRef.current[0] !== trimmed) {
      messagesRef.current.unshift(trimmed);
    }
    setHistoryIndex(-1);
    draftRef.current = '';
    // persist to disk
    chatHistory.addUserMessage(trimmed);
  }, []);

  const updateAgentResponse = useCallback((response: string) => {
    chatHistory.updateAgentResponse(response);
  }, []);

  const navigateUp = useCallback((currentText: string): string | null => {
    const messages = messagesRef.current;
    if (messages.length === 0) return null;

    const nextIndex = historyIndex + 1;
    if (nextIndex >= messages.length) return null;

    // save draft on first navigation
    if (historyIndex === -1) {
      draftRef.current = currentText;
    }

    setHistoryIndex(nextIndex);
    return messages[nextIndex];
  }, [historyIndex]);

  const navigateDown = useCallback((): string | null => {
    if (historyIndex <= -1) return null;

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);

    if (nextIndex === -1) {
      return draftRef.current;
    }

    return messagesRef.current[nextIndex];
  }, [historyIndex]);

  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1);
    draftRef.current = '';
  }, []);

  return {
    navigateUp,
    navigateDown,
    saveMessage,
    updateAgentResponse,
    resetNavigation,
    historyIndex,
  };
}
