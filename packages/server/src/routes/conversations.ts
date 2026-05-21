import { Hono } from 'hono';
import { createConversationReqSchema, patchConversationReqSchema } from '@buddy/shared';
import type { conversationsRepo } from '../db/repo/conversations.js';
import type { messagesRepo } from '../db/repo/messages.js';

export function conversationsRoutes(deps: {
  convs: ReturnType<typeof conversationsRepo>;
  msgs: ReturnType<typeof messagesRepo>;
}): Hono {
  const app = new Hono();
  app.get('/conversations', (c) => c.json(deps.convs.listByTopic(c.req.query('topic') ?? '')));
  app.post('/conversations', async (c) => {
    const body = createConversationReqSchema.parse(await c.req.json());
    return c.json({ id: deps.convs.create(body.title ? { topic: body.topic, title: body.title } : { topic: body.topic }).id });
  });
  app.patch('/conversations/:id', async (c) => {
    const body = patchConversationReqSchema.parse(await c.req.json());
    deps.convs.rename(c.req.param('id'), body.title);
    return c.json({ ok: true });
  });
  app.delete('/conversations/:id', (c) => {
    deps.convs.softDelete(c.req.param('id'));
    return c.json({ ok: true });
  });
  app.get('/conversations/:id/messages', (c) => c.json(deps.msgs.listByConversation(c.req.param('id'))));
  return app;
}
