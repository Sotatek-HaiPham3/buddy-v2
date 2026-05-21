import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { openChatStream } from '../api/sse.js';
import type { Citation, ReasoningTrace } from '../api/types.js';

export interface PendingMessage {
  content: string;
  citations: Citation[];
  trace: ReasoningTrace | null;
  done: boolean;
  error?: string;
}

export function useChatStream(opts: { conversationId: string }) {
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const qc = useQueryClient();

  const send = async (query: string): Promise<void> => {
    if (!opts.conversationId) return;
    setPending({ content: '', citations: [], trace: null, done: false });
    try {
      for await (const ev of openChatStream({ conversationId: opts.conversationId, query })) {
        if (ev.event === 'token' || ev.event === 'message') {
          setPending((p) => (p ? { ...p, content: p.content + ev.data.delta } : p));
        } else if (ev.event === 'citations') {
          setPending((p) => (p ? { ...p, citations: ev.data as Citation[] } : p));
        } else if (ev.event === 'trace') {
          setPending((p) => (p ? { ...p, trace: ev.data as ReasoningTrace } : p));
        } else if (ev.event === 'done') {
          setPending((p) => (p ? { ...p, done: true } : p));
          await qc.invalidateQueries({ queryKey: ['messages', opts.conversationId] });
          await qc.invalidateQueries({ queryKey: ['conversations'] });
        } else if (ev.event === 'error') {
          setPending((p) => (p ? { ...p, error: ev.data.message, done: true } : p));
        }
      }
    } catch (error) {
      setPending((p) => (p ? { ...p, error: String(error), done: true } : p));
    }
  };

  return { pending, send };
}
