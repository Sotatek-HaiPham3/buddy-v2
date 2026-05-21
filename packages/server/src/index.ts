import { Hono } from 'hono';
import { answer as queryAnswer } from '@buddy/query';
import { topicsRoutes } from './routes/topics.js';
import { conversationsRoutes } from './routes/conversations.js';
import { chatRoutes } from './routes/chat.js';
import { pdfRoutes } from './routes/pdf.js';
import { staticRoutes } from './static.js';
import type { ServerDeps } from './deps.js';

export function createApp(deps: ServerDeps): Hono {
  const app = new Hono();
  app.route('/api', topicsRoutes({ dataDir: deps.dataDir }));
  app.route('/api', conversationsRoutes({ convs: deps.convs, msgs: deps.msgs }));
  app.route(
    '/api',
    chatRoutes({
      convs: deps.convs,
      msgs: deps.msgs,
      answer: ({ topic, query, history }) =>
        queryAnswer({
          dataDir: deps.dataDir,
          topic,
          query,
          history,
          gemini: deps.gemini,
          topicCache: deps.topicCache,
          pdfPathFor: (docName: string) => deps.pdfPathFor(topic, docName),
        }) as AsyncIterable<{ type: string; delta?: string; citations?: []; trace?: null; message?: string }>,
    }),
  );
  app.route('/api', pdfRoutes({ dataDir: deps.dataDir, cache: deps.pdfCache, pdfPathFor: deps.pdfPathFor }));
  if (deps.webDistDir) app.route('/', staticRoutes({ webDistDir: deps.webDistDir }));
  return app;
}

export { openDb, runMigrations } from './db/client.js';
export { conversationsRepo } from './db/repo/conversations.js';
export { messagesRepo } from './db/repo/messages.js';
export { createPdfCache } from './pdf-cache.js';
export type { ServerDeps } from './deps.js';
