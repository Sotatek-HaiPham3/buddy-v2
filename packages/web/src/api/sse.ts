import { sseCitationsSchema, sseDoneSchema, sseErrorSchema, sseTokenSchema } from './types.js';

export type SseEvent =
  | { event: 'token' | 'message'; data: { delta: string } }
  | { event: 'citations'; data: unknown }
  | { event: 'trace'; data: unknown }
  | { event: 'done'; data: { message_id: string } }
  | { event: 'error'; data: { message: string } };

function parseData(event: string, raw: string): unknown {
  const parsed = JSON.parse(raw) as unknown;
  if (event === 'token' || event === 'message') return sseTokenSchema.parse(parsed);
  if (event === 'citations') return sseCitationsSchema.parse(parsed);
  if (event === 'done') return sseDoneSchema.parse(parsed);
  if (event === 'error') return sseErrorSchema.parse(parsed);
  return parsed;
}

export async function* parseSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = block.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) {
        yield { event: event as SseEvent['event'], data: parseData(event, data) } as SseEvent;
      }
      idx = buffer.indexOf('\n\n');
    }
  }
}

export async function* openChatStream(opts: {
  conversationId: string;
  query: string;
}): AsyncIterable<SseEvent> {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_id: opts.conversationId, query: opts.query }),
  });
  if (!res.ok || !res.body) throw new Error((await res.text()) || 'chat stream failed');
  yield* parseSseStream(res.body.getReader());
}
