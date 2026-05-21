import type { GeminiClient, LlmPool } from '@buddy/shared';
import { chunkPages } from '../hierarchical/chunk.js';
import { hierarchicalExtract } from '../hierarchical/orchestrator.js';
import { extractJson } from '../json-utils.js';
import { tagPages, parsePhysicalIndexTag } from '../page-tag.js';
import { noTocHeadingsPrompt } from '../prompts/no-toc-headings.js';
import { noTocHeadingsResponseSchema } from '../schemas.js';
import type { FlatTocEntry, RawPage } from '../types.js';
import type { StructuredHeading } from '../hierarchical/group-master.js';
import { z } from 'zod';

interface Opts {
  gemini: GeminiClient;
  pool: LlmPool;
  chunkTokens: number;
  hierarchical: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
}

type NoTocHeadingRow = z.infer<typeof noTocHeadingsResponseSchema>[number];

function fromStructuredHeading(row: StructuredHeading): FlatTocEntry {
  if (row.length === 4) {
    const [structure, title, logical, physical_index] = row;
    return logical === null
      ? { structure, title, physical_index }
      : { structure, title, page: logical, physical_index };
  }
  const [structure, title, physical_index] = row;
  return { structure, title, physical_index };
}

function fromNoTocHeading(row: NoTocHeadingRow): FlatTocEntry {
  if (Array.isArray(row)) {
    if (row.length === 4) {
      const [structure, title, logical, physical_index] = row;
      return logical === null
        ? { structure, title, physical_index }
        : { structure, title, page: logical, physical_index };
    }
    const [structure, title, physical_index] = row;
    return { structure, title, physical_index };
  }

  const physical_index = parsePhysicalIndexTag(row.physical_index);
  if (row.logical_page === undefined || row.logical_page === null) {
    return { structure: row.structure, title: row.title, physical_index };
  }
  return { structure: row.structure, title: row.title, page: row.logical_page, physical_index };
}

/**
 * Extract the first standalone integer from the first ~150 characters of a page's text.
 * This is used to find the "printed" page number (logical page) that may appear in headers/footers.
 */
export function extractPrintedPageNumber(text: string): number | null {
  const head = text.slice(0, 150);
  const m = head.match(/\b(\d{1,4})\b/);
  if (!m) return null;
  if (!m[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Build a map from printed page number → physical page number using the pages in a chunk.
 * If a printed number is ambiguous (appears on multiple physical pages), it is excluded.
 */
function buildPrintedToPhysicalMap(pages: RawPage[]): Map<number, number> {
  const map = new Map<number, number>();
  const ambiguous = new Set<number>();
  for (const p of pages) {
    const printed = extractPrintedPageNumber(p.text);
    if (printed === null) continue;
    if (printed === p.pageNumber) continue; // already physical, skip
    if (ambiguous.has(printed)) continue;
    if (map.has(printed)) {
      // Conflict — mark ambiguous and remove
      ambiguous.add(printed);
      map.delete(printed);
    } else {
      map.set(printed, p.pageNumber);
    }
  }
  return map;
}

/**
 * Apply the printed-to-physical reconstruction pass to a list of parsed entries.
 * Entries whose physical_index is already in [1, pageCount] are left alone.
 * Entries whose physical_index is out of range but matches a printed number in the map
 * are reconstructed: physical_index is replaced with the correct physical page number.
 */
function reconstructPhysicalIndices(
  entries: FlatTocEntry[],
  pageCount: number,
  printedToPhysical: Map<number, number>,
): FlatTocEntry[] {
  return entries.map((entry) => {
    const phys = entry.physical_index;
    if (phys === undefined) return entry;

    const logi = entry.page;

    // Case 0: both physical and logical are present, and map says a different physical —
    // the LLM emitted in-range but wrong physical; trust the map.
    if (logi !== undefined && printedToPhysical.has(logi)) {
      const truePhys = printedToPhysical.get(logi)!;
      if (truePhys !== phys) {
        console.warn(
          `[process-no-toc] physical_index disagreed with logical→physical map for "${entry.title}": ` +
          `LLM emitted physical=${phys} for logical=${logi}, map says logical=${logi} → physical=${truePhys}; reassigning`,
        );
        return { ...entry, physical_index: truePhys };
      }
      // phys agrees with map — keep as-is
      return entry;
    }

    // Case A: already in valid range — keep as-is
    if (phys >= 1 && phys <= pageCount) return entry;

    // Case B: out of range and present in the printed→physical map — reconstruct
    if (printedToPhysical.has(phys)) {
      const corrected = printedToPhysical.get(phys)!;
      console.warn(
        `[process-no-toc] reconstructed physical_index for "${entry.title}": LLM emitted ${phys} (recognized as logical), mapped to physical ${corrected}`,
      );
      const reconstructed: FlatTocEntry = {
        ...entry,
        physical_index: corrected,
      };
      // If page (logical) was not set, the LLM's value was the logical page number
      if (reconstructed.page === undefined) {
        reconstructed.page = phys;
      }
      return reconstructed;
    }

    // Case C: out of range and not in map — leave alone; validateIndices will strip downstream
    return entry;
  });
}

export async function processNoToc(pages: RawPage[], opts: Opts): Promise<FlatTocEntry[]> {
  if (opts.hierarchical) {
    const result = await hierarchicalExtract(pages, '1', {
      gemini: opts.gemini, pool: opts.pool,
      subgroupTokenSize: opts.subgroupTokenSize,
      maxRetrievalsPerMaster: opts.maxRetrievalsPerMaster,
    });
    const entries = result.map(fromStructuredHeading);
    // Build map from ALL pages (hierarchical chain merges results across chunks)
    const printedToPhysical = buildPrintedToPhysicalMap(pages);
    return reconstructPhysicalIndices(entries, pages.length, printedToPhysical);
  }

  const chunks = chunkPages(pages, opts.chunkTokens);
  const all: FlatTocEntry[] = [];
  for (const c of chunks) {
    const tagged = tagPages(c.pages);
    const r = await opts.gemini.generate([noTocHeadingsPrompt(tagged)], { maxOutputTokens: 8192 });
    const parsed = noTocHeadingsResponseSchema.parse(extractJson(r.text));
    const entries = parsed.map(fromNoTocHeading);
    // Build map from this chunk's pages only
    const printedToPhysical = buildPrintedToPhysicalMap(c.pages);
    const reconstructed = reconstructPhysicalIndices(entries, pages.length, printedToPhysical);
    for (const e of reconstructed) all.push(e);
  }
  return all;
}
