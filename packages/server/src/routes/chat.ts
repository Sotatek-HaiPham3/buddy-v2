import { Hono } from 'hono';
import { chatStreamReqSchema, type Citation, type ReasoningTrace } from '@buddy/shared';
import type { conversationsRepo } from '../db/repo/conversations.js';
import type { messagesRepo } from '../db/repo/messages.js';
import { writeSse } from '../sse.js';

export function chatRoutes(deps: {
  convs: ReturnType<typeof conversationsRepo>;
  msgs: ReturnType<typeof messagesRepo>;
  answer: (opts: {
    topic: string;
    query: string;
    history: { role: 'user' | 'assistant'; content: string }[];
  }) => AsyncIterable<any>;
}): Hono {
  const app = new Hono();
  app.post('/chat/stream', async (c) => {
    const body = chatStreamReqSchema.parse(await c.req.json());
    const conv = deps.convs.get(body.conversation_id);
    if (!conv) return c.json({ error: 'conversation not found' }, 404);

    const prior = deps.msgs.listByConversation(conv.id);
    deps.msgs.create({ conversation_id: conv.id, role: 'user', content: body.query });

    const stream = new ReadableStream({
      start: async (controller) => {
        const enc = new TextEncoder();
        let full = '';
        let citations: Citation[] = [];
        let trace: ReasoningTrace | null = null;
        try {
          for await (const event of deps.answer({
            topic: conv.topic,
            query: body.query,
            history: prior.map((m) => ({ role: m.role, content: m.content })),
          })) {
            if (event.type === 'token') {
              const delta = event.delta ?? '';
              full += delta;
              controller.enqueue(enc.encode(writeSse('token', { delta })));
            } else if (event.type === 'citations') {
              citations = event.citations ?? [];
              controller.enqueue(enc.encode(writeSse('citations', citations)));
            } else if (event.type === 'trace') {
              trace = event.trace ?? null;
              controller.enqueue(enc.encode(writeSse('trace', trace)));
            } else if (event.type === 'error') {
              controller.enqueue(enc.encode(writeSse('error', { message: event.message })));
            }
          }
          const saved = deps.msgs.create({
            conversation_id: conv.id,
            role: 'assistant',
            content: full,
            citations,
            trace,
          });
          deps.convs.touch(conv.id);
          if (prior.length === 0 && conv.title === 'New chat') {
            deps.convs.rename(conv.id, body.query.slice(0, 60));
          }
          controller.enqueue(enc.encode(writeSse('done', { message_id: saved.id })));
        } catch (error) {
          controller.enqueue(
            enc.encode(
              writeSse('error', {
                message: error instanceof Error ? error.message : 'chat stream failed',
              }),
            ),
          );
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });
  return app;
}
