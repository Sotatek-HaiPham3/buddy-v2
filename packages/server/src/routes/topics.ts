import { Hono } from 'hono';
import { listTopicDocs, listTopics } from '../db/repo/topics.js';

export function topicsRoutes(deps: { dataDir: string }): Hono {
  const app = new Hono();
  app.get('/topics', async (c) => c.json(await listTopics(deps.dataDir)));
  app.get('/topics/:topic/docs', async (c) => c.json(await listTopicDocs(deps.dataDir, c.req.param('topic'))));
  return app;
}
