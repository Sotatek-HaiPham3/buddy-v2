import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages } from '../page-tag.js';
import { subgroupHeadingsPrompt } from '../prompts/subgroup-headings.js';
import { subgroupHeadingsResponseSchema } from '../schemas.js';
import type { Chunk } from './chunk.js';

export type Heading = [string, number];

interface Opts { gemini: GeminiClient; }

export async function subgroupAgent(chunk: Chunk, opts: Opts): Promise<Heading[]> {
  try {
    const tagged = tagPages(chunk.pages);
    const r = await opts.gemini.generate([subgroupHeadingsPrompt(tagged)], { maxOutputTokens: 2048 });
    return subgroupHeadingsResponseSchema.parse(extractJson(r.text));
  } catch {
    return [];
  }
}
