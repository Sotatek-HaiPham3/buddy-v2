import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createLlmPool, createLogger, createRealGemini, docId as makeDocId, runId as makeRunId,
  resolveDocCacheDir, resolveDocTreePath, resolveIndexDir, resolveLogsDir,
  resolveDocImagesDir, resolveDocTablesDir,
  type Config, type DocOutput, type GeminiClient, type LlmPool, type Logger,
} from '@buddy/shared';
import { runPipeline } from './orchestrator.js';
import { buildOptsFromConfig, type BuildOpts, type Ctx } from './types.js';

interface BuildDocArgs {
  cfg: Config;
  topic: string;
  pdfPath: string;
  optsOverride?: Partial<BuildOpts>;
  gemini?: GeminiClient;
  pool?: LlmPool;
  logger?: Logger;
}

export async function buildDoc(args: BuildDocArgs): Promise<DocOutput> {
  const docName = path.basename(args.pdfPath);
  const docId = makeDocId();
  const runId = makeRunId();
  const cacheDir = resolveDocCacheDir(args.cfg.dataDir, args.topic, docId);
  const indexDir = resolveIndexDir(args.cfg.dataDir, args.topic);
  const logsDir = resolveLogsDir(args.cfg.dataDir, args.topic);
  const imagesDir = resolveDocImagesDir(args.cfg.dataDir, args.topic, docId);
  const tablesDir = resolveDocTablesDir(args.cfg.dataDir, args.topic, docId);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(indexDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.mkdir(tablesDir, { recursive: true });

  const logger = (args.logger ?? createLogger({ level: args.cfg.logLevel }))
    .child({ runId, topic: args.topic, docId, docName });

  const gemini =
    args.gemini ??
    (() => {
      if (!args.cfg.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is required for pipeline builds');
      }
      return createRealGemini({ apiKey: args.cfg.geminiApiKey, defaultModel: args.cfg.geminiModel });
    })();
  const pool = args.pool ?? createLlmPool(args.cfg.maxConcurrentLlm);

  const ctx: Ctx = {
    cfg: args.cfg, gemini, pool, logger, runId,
    topic: args.topic, docId, pdfPath: args.pdfPath, cacheDir,
    opts: buildOptsFromConfig(args.cfg, args.optsOverride),
    imagesDir, tablesDir,
  };

  const outPath = resolveDocTreePath(args.cfg.dataDir, args.topic, docId);
  return runPipeline(ctx, outPath, docName);
}

interface BuildTopicArgs extends Omit<BuildDocArgs, 'pdfPath'> {
  pdfPaths: string[];
}

export async function buildTopic(args: BuildTopicArgs): Promise<DocOutput[]> {
  const out: DocOutput[] = [];
  for (const pdfPath of args.pdfPaths) {
    try {
      out.push(await buildDoc({ ...args, pdfPath }));
    } catch (err) {
      (args.logger ?? createLogger()).error({ err, pdfPath }, 'buildDoc failed; continuing topic');
    }
  }
  return out;
}
