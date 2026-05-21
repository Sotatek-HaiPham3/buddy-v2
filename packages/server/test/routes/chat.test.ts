import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { openDb, runMigrations } from '../../src/db/client.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';
import { messagesRepo } from '../../src/db/repo/messages.js';
import { chatRoutes } from '../../src/routes/chat.js';

describe('chat route', () => {
  it('streams sse', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const convs = conversationsRepo(db);
    const msgs = messagesRepo(db);
    const conv = convs.create({ topic: 'tax' });
    const app = new Hono().route(
      '/api',
      chatRoutes({
        convs,
        msgs,
        answer: async function* () {
          yield { type: 'trace', trace: { doc_selector: { reasoning: 'x', doc_ids: [] } } };
          yield { type: 'token', delta: 'hello' };
          yield { type: 'citations', citations: [] };
          yield { type: 'done' };
        },
      }),
    );
    const res = await app.request('/api/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: conv.id, query: 'hi' }),
    });
    const text = await res.text();
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');
  });
});
