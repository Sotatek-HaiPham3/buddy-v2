import { msgId, type Citation, type ReasoningTrace } from '@buddy/shared';
import type { Db } from '../client.js';

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  trace: ReasoningTrace | null;
  created_at: number;
}

export function messagesRepo(db: Db) {
  return {
    create(input: {
      conversation_id: string;
      role: 'user' | 'assistant';
      content: string;
      citations?: Citation[];
      trace?: ReasoningTrace | null;
    }): MessageRow {
      const row: MessageRow = {
        id: msgId(),
        conversation_id: input.conversation_id,
        role: input.role,
        content: input.content,
        citations: input.citations ?? [],
        trace: input.trace ?? null,
        created_at: Date.now(),
      };
      db.prepare(
        'INSERT INTO messages(id,conversation_id,role,content,citations,trace,created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(
        row.id,
        row.conversation_id,
        row.role,
        row.content,
        JSON.stringify(row.citations),
        row.trace ? JSON.stringify(row.trace) : null,
        row.created_at,
      );
      return row;
    },
    listByConversation(conversationId: string): MessageRow[] {
      const rows = db
        .prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC')
        .all(conversationId) as {
        id: string;
        conversation_id: string;
        role: 'user' | 'assistant';
        content: string;
        citations: string | null;
        trace: string | null;
        created_at: number;
      }[];
      return rows.map((r) => ({
        ...r,
        citations: r.citations ? (JSON.parse(r.citations) as Citation[]) : [],
        trace: r.trace ? (JSON.parse(r.trace) as ReasoningTrace) : null,
      }));
    },
  };
}
