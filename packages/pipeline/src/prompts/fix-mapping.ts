import type { FlatTocEntry } from '../types.js';

export const fixMappingPrompt = (incorrect: FlatTocEntry[], taggedPages: string): string => `The following TOC entries have wrong physical_index. Find the correct page in the tagged pages.

Wrong entries:
${JSON.stringify(incorrect)}

Pages:
${taggedPages}

Return JSON array of corrected entries:
[{ "structure": "<s>", "title": "<t>", "physical_index": "<physical_index_N>" }]`;
