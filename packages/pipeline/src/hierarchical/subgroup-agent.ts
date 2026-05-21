import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { tagPages } from '../page-tag.js';
import { subgroupHeadingsPrompt } from '../prompts/subgroup-headings.js';
import { subgroupHeadingsResponseSchema } from '../schemas.js';
import type { Chunk } from './chunk.js';

export type LegacyHeading = [string, number];
export type HeadingWithLogical = [string, number | null, number];
export type HeadingTitleOnly = [string];
export type Heading = HeadingTitleOnly | LegacyHeading | HeadingWithLogical;

interface Opts { gemini: GeminiClient; }

export async function subgroupAgent(chunk: Chunk, opts: Opts): Promise<Heading[]> {
  try {
    const tagged = tagPages(chunk.pages);
    const r = await opts.gemini.generate([subgroupHeadingsPrompt(tagged)], { maxOutputTokens: 2048 });
    const parsed = subgroupHeadingsResponseSchema.parse(extractJson(r.text));
    return parsed.map((entry) => [entry[0]]);
  } catch {
    return [];
  }
}
