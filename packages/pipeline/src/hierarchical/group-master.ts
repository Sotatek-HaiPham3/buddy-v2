import type { GeminiClient } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { groupMasterPrompt } from '../prompts/group-master.js';
import { tagPages } from '../page-tag.js';
import type { Heading } from './subgroup-agent.js';
import type { RawPage } from '../types.js';

export type StructuredHeading =
  | [string, string]
  | [string, string, number]
  | [string, string, number | null, number];

interface Opts { gemini: GeminiClient; maxRetrievals: number; }
interface RetrieveAction { action: 'retrieve'; pages: number[]; reason?: string; }

function toPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const tagMatch = value.match(/^<physical_index_(\d+)>$/);
    if (tagMatch) return Number.parseInt(tagMatch[1]!, 10);
    const n = Number.parseInt(value, 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function coerceStructuredHeadings(rows: unknown[]): Array<StructuredHeading | RetrieveAction> {
  const out: Array<StructuredHeading | RetrieveAction> = [];
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const action = row as { action?: unknown; pages?: unknown; reason?: unknown };
      if (action.action === 'retrieve' && Array.isArray(action.pages)) {
        const pages = action.pages.map(toPositiveInt).filter((p): p is number => p !== null);
        out.push({ action: 'retrieve', pages, reason: typeof action.reason === 'string' ? action.reason : '' });
      }
      continue;
    }
    if (!Array.isArray(row) || row.length < 2) continue;
    const structure = String(row[0] ?? '');
    const title = String(row[1] ?? '');
    out.push([structure, title]);
  }
  return out;
}

export async function groupMaster(
  subgroupResults: Heading[][],
  pages: RawPage[],
  opts: Opts,
): Promise<StructuredHeading[]> {
  let retrieved: string | undefined;
  const byNum = new Map(pages.map(p => [p.pageNumber, p]));
  for (let attempt = 0; attempt <= opts.maxRetrievals; attempt++) {
    const r = await opts.gemini.generate(
      [groupMasterPrompt(subgroupResults, retrieved)],
      { maxOutputTokens: 4096 },
    );
    const raw = extractJson(r.text);
    const normalized = Array.isArray(raw) ? raw : [raw];
    const parsed = coerceStructuredHeadings(normalized);
    const action = parsed.find((p): p is RetrieveAction => !Array.isArray(p));
    if (action && attempt < opts.maxRetrievals) {
      const slice = action.pages.map(n => byNum.get(n)).filter((p): p is RawPage => !!p);
      retrieved = (retrieved ? retrieved + '\n' : '') + tagPages(slice);
      continue;
    }
    return parsed.filter((p): p is StructuredHeading => Array.isArray(p));
  }
  return [];
}
