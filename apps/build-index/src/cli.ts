import path from 'node:path';
import { Command } from 'commander';
import { createLogger, loadConfig } from '@buddy/shared';
import { buildDoc, buildTopic } from '@buddy/pipeline';
import { discoverTopicPdfs, listTopics } from './discover.js';

export function buildCli(): Command {
  const cmd = new Command();
  cmd
    .name('buddy-build-index')
    .description('Build PageIndex trees for buddy-v2 topics')
    .option('--all', 'Build all topics under DATA_DIR')
    .option('--topic <name>', 'Build a single topic')
    .option('--doc <path>', 'Build a single PDF (requires --topic)')
    .option('--force', 'Ignore caches and rebuild')
    .option('--no-summaries', 'Disable summary generation')
    .option('--no-hierarchical', 'Disable hierarchical agents')
    .option('--no-images', 'Disable image extraction')
    .option('--no-tables', 'Disable table extraction')
    .action(async (opts: {
      all?: boolean; topic?: string; doc?: string; force?: boolean;
      summaries?: boolean; hierarchical?: boolean; images?: boolean; tables?: boolean;
    }) => {
      const cfg = loadConfig();
      const logger = createLogger({ level: cfg.logLevel });
      const override = {
        force: !!opts.force,
        addSummaries: opts.summaries !== false && cfg.addSummaries,
        hierarchicalProcessing: opts.hierarchical !== false && cfg.hierarchicalProcessing,
        imagesEnabled: opts.images !== false && cfg.imagesEnabled,
        tablesEnabled: opts.tables !== false && cfg.tablesEnabled,
      };

      if (opts.doc) {
        if (!opts.topic) throw new Error('--doc requires --topic');
        const docPath = path.resolve(opts.doc);
        const out = await buildDoc({ cfg, topic: opts.topic, pdfPath: docPath, optsOverride: override, logger });
        logger.info({ doc: out.doc_id, topic: opts.topic }, 'built doc');
        return;
      }
      if (opts.topic) {
        const pdfs = await discoverTopicPdfs(cfg.dataDir, opts.topic);
        if (pdfs.length === 0) { logger.warn({ topic: opts.topic }, 'no PDFs found'); return; }
        await buildTopic({ cfg, topic: opts.topic, pdfPaths: pdfs, optsOverride: override, logger });
        return;
      }
      if (opts.all) {
        for (const t of await listTopics(cfg.dataDir)) {
          const pdfs = await discoverTopicPdfs(cfg.dataDir, t);
          await buildTopic({ cfg, topic: t, pdfPaths: pdfs, optsOverride: override, logger });
        }
        return;
      }
      cmd.help();
    });
  return cmd;
}
