import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createTopicCache } from '@buddy/query';
import { createApp, createPdfCache, conversationsRepo, messagesRepo, openDb, runMigrations } from '@buddy/server';
import { createLogger, createRealGemini, loadConfig, type Config } from '@buddy/shared';

async function main(): Promise<void> {
  const cfg: Config = loadConfig();
  const logger = createLogger({ level: cfg.logLevel });
  const dbPath = path.join(cfg.dataDir, 'buddy.sqlite');
  const db = openDb(dbPath);
  runMigrations(db);
  const topicCache = createTopicCache({
    dataDir: cfg.dataDir,
    watch: true,
    onChange: (topic: string) => logger.info({ topic }, 'tree cache reloaded'),
  });
  const gemini = createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(here, '../../../packages/web/dist');
  const app = createApp({
    dataDir: cfg.dataDir,
    convs: conversationsRepo(db),
    msgs: messagesRepo(db),
    pdfCache: createPdfCache(4),
    topicCache,
    gemini,
    webDistDir: webDist,
    pdfPathFor: (topic: string, docName: string) => path.join(cfg.dataDir, topic, docName),
  });
  serve({ fetch: app.fetch, port: cfg.port }, (info) => logger.info({ port: info.port }, 'buddy server listening'));
  const shutdown = async () => {
    logger.info('shutting down');
    await topicCache.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
