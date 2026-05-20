import 'dotenv/config';
import { z } from 'zod';

const boolStr = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true');

const intStr = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive());

export const configSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),
  GEMINI_VISION_MODEL: z.string().default('gemini-2.5-flash-lite'),
  PORT: intStr(3000),
  DATA_DIR: z.string().default('./data'),
  MAX_CONCURRENT_LLM: intStr(10),
  MAX_PAGES_PER_NODE: intStr(20),
  MAX_RETRIES: intStr(3),
  ADD_SUMMARIES: z.string().optional().default('true').transform((v) => v === 'true'),
  IMAGES_ENABLED: z.string().optional().default('true').transform((v) => v === 'true'),
  TABLES_ENABLED: z.string().optional().default('true').transform((v) => v === 'true'),
  HIERARCHICAL_PROCESSING: z.string().optional().default('true').transform((v) => v === 'true'),
  SUBGROUP_TOKEN_SIZE: intStr(7000),
  MAX_RETRIEVALS_PER_MASTER: intStr(3),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type RawConfig = z.infer<typeof configSchema>;

export interface Config {
  geminiApiKey: string;
  geminiModel: string;
  geminiVisionModel: string;
  port: number;
  dataDir: string;
  maxConcurrentLlm: number;
  maxPagesPerNode: number;
  maxRetries: number;
  addSummaries: boolean;
  imagesEnabled: boolean;
  tablesEnabled: boolean;
  hierarchicalProcessing: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.parse(env);
  return {
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiModel: parsed.GEMINI_MODEL,
    geminiVisionModel: parsed.GEMINI_VISION_MODEL,
    port: parsed.PORT,
    dataDir: parsed.DATA_DIR,
    maxConcurrentLlm: parsed.MAX_CONCURRENT_LLM,
    maxPagesPerNode: parsed.MAX_PAGES_PER_NODE,
    maxRetries: parsed.MAX_RETRIES,
    addSummaries: parsed.ADD_SUMMARIES,
    imagesEnabled: parsed.IMAGES_ENABLED,
    tablesEnabled: parsed.TABLES_ENABLED,
    hierarchicalProcessing: parsed.HIERARCHICAL_PROCESSING,
    subgroupTokenSize: parsed.SUBGROUP_TOKEN_SIZE,
    maxRetrievalsPerMaster: parsed.MAX_RETRIEVALS_PER_MASTER,
    logLevel: parsed.LOG_LEVEL,
  };
}
