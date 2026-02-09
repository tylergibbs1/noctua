import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface ConversationEntry {
  id: string;
  timestamp: string;
  userMessage: string;
  agentResponse: string | null;
}

interface HistoryFile {
  messages: ConversationEntry[];
}

const HISTORY_PATH = join(homedir(), '.claimguard', 'chat_history.json');

/**
 * Persistent conversation history stored in ~/.claimguard/chat_history.json
 * Stack ordering — most recent at index 0
 */
export class ChatHistory {
  private messages: ConversationEntry[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (existsSync(HISTORY_PATH)) {
        const content = await readFile(HISTORY_PATH, 'utf-8');
        const data: HistoryFile = JSON.parse(content);
        this.messages = data.messages || [];
      } else {
        this.messages = [];
        await this.save();
      }
    } catch {
      this.messages = [];
    }

    this.loaded = true;
  }

  private async save(): Promise<void> {
    const dir = dirname(HISTORY_PATH);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const data: HistoryFile = { messages: this.messages };
    await writeFile(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  async addUserMessage(message: string): Promise<void> {
    if (!this.loaded) await this.load();

    const entry: ConversationEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      userMessage: message,
      agentResponse: null,
    };

    this.messages.unshift(entry);
    await this.save();
  }

  async updateAgentResponse(response: string): Promise<void> {
    if (!this.loaded) await this.load();

    if (this.messages.length > 0) {
      this.messages[0].agentResponse = response;
      await this.save();
    }
  }

  /**
   * User message strings in stack order (newest first), deduplicated
   */
  getMessageStrings(): string[] {
    const result: string[] = [];
    for (const m of this.messages) {
      const last = result[result.length - 1];
      if (last !== m.userMessage) {
        result.push(m.userMessage);
      }
    }
    return result;
  }
}
