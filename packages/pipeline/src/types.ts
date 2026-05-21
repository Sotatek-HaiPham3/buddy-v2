import type { GeminiClient, LlmPool, Logger, Config } from '@buddy/shared';

export interface RawPage {
  pageNumber: number;
  text: string;
  tokenCount: number;
}

export interface FlatTocEntry {
  structure: string;
  title: string;
  page?: number;
  physical_index?: number;
  appear_start?: 'yes' | 'no';
}

export interface BuildOpts {
  addSummaries: boolean;
  hierarchicalProcessing: boolean;
  maxPagesPerNode: number;
  maxTokensPerNode: number;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
  maxRetries: number;
  tocCheckPageNum: number;
  force: boolean;
  forceFromStep?: string;
}

export interface Ctx {
  cfg: Config;
  gemini: GeminiClient;
  pool: LlmPool;
  logger: Logger;
  runId: string;
  topic: string;
  docId: string;
  pdfPath: string;
  cacheDir: string;
  opts: BuildOpts;
}

export function buildOptsFromConfig(cfg: Config, override: Partial<BuildOpts> = {}): BuildOpts {
  return {
    addSummaries: cfg.addSummaries,
    hierarchicalProcessing: cfg.hierarchicalProcessing,
    maxPagesPerNode: cfg.maxPagesPerNode,
    maxTokensPerNode: 20000,
    subgroupTokenSize: cfg.subgroupTokenSize,
    maxRetrievalsPerMaster: cfg.maxRetrievalsPerMaster,
    maxRetries: cfg.maxRetries,
    tocCheckPageNum: 20,
    force: false,
    ...override,
  };
}
