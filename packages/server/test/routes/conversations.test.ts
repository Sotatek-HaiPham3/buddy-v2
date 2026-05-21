import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { openDb, runMigrations } from '../../src/db/client.js';
import { conversationsRepo } from '../../src/db/repo/conversations.js';
import { messagesRepo } from '../../src/db/repo/messages.js';
import { conversationsRoutes } from '../../src/routes/conversations.js';

describe('conversation routes', () => {
  it('creates conversation', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const app = new Hono().route(
      '/api',
      conversationsRoutes({ convs: conversationsRepo(db), msgs: messagesRepo(db) }),
    );
    const res = await app.request('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'tax' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBeTruthy();
  });
});
