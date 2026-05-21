import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createTopicCache } from '@buddy/query';
import { createApp, createPdfCache, conversationsRepo, messagesRepo, openDb, runMigrations } from '@buddy/server';
import { createLogger, createRealGemini, createRealOpenAI, loadConfig, type Config } from '@buddy/shared';

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
  const llmClient = (() => {
    if (cfg.llmProvider === 'gemini') {
      if (!cfg.geminiApiKey) throw new Error('GEMINI_API_KEY is required when LLM_PROVIDER=gemini');
      return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
    }
    if (cfg.llmProvider === 'openai') {
      if (!cfg.openaiApiKey) throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
      return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
    }
    if (cfg.geminiApiKey) {
      logger.info({ provider: 'gemini', model: cfg.geminiModel }, 'using configured LLM provider');
      return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
    }
    if (cfg.openaiApiKey) {
      logger.info({ provider: 'openai', model: cfg.openaiModel }, 'using configured LLM provider');
      return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
    }
    throw new Error('No LLM key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.');
  })();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(here, '../../../packages/web/dist');
  const app = createApp({
    dataDir: cfg.dataDir,
    convs: conversationsRepo(db),
    msgs: messagesRepo(db),
    pdfCache: createPdfCache(4),
    topicCache,
    gemini: llmClient,
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
