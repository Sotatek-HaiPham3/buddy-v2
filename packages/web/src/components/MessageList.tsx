import { useEffect, useRef } from 'react';
import type { PendingMessage } from '../state/chat.js';
import { MessageBubble } from './MessageBubble.js';

type ListMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: unknown[] | undefined;
  trace?: unknown | undefined;
};

export function MessageList({
  messages,
  pending,
  onCitationClick,
}: {
  messages: ListMessage[];
  pending: PendingMessage | null;
  onCitationClick: (cite: { doc: string; page: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [messages, pending?.content]);

  return (
    <div ref={ref} className="flex-1 space-y-3 overflow-y-auto bg-slate-100 p-4">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          role={m.role}
          content={m.content}
          citations={m.citations as never}
          trace={m.trace as never}
          onCitationClick={onCitationClick}
        />
      ))}
      {pending && !pending.done ? (
        <MessageBubble
          role="assistant"
          content={`${pending.content} ▍`}
          citations={pending.citations}
          trace={pending.trace}
          onCitationClick={onCitationClick}
        />
      ) : null}
      {pending?.error ? <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{pending.error}</div> : null}
    </div>
  );
}
