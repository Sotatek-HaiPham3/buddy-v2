import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { detectTocPrompt } from '../prompts/detect-toc.js';
import { detectTocResponseSchema } from '../schemas.js';
import type { RawPage } from '../types.js';

interface Opts { gemini: GeminiClient; maxScan: number; }

export async function detectTocPages(pages: RawPage[], opts: Opts): Promise<number[]> {
  const result: number[] = [];
  let lastYes = true;
  for (let i = 0; i < pages.length; i++) {
    if (i >= opts.maxScan && !lastYes) break;
    const text = pages[i]?.text ?? '';
    const r = await opts.gemini.generate([detectTocPrompt(text)]);
    const parsed = detectTocResponseSchema.parse(extractJson(r.text));
    if (parsed.toc_detected === 'yes') {
      result.push(pages[i]!.pageNumber);
      lastYes = true;
    } else {
      lastYes = false;
    }
  }
  return result;
}
