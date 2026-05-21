import type { FlatTocEntry } from '../types.js';

export const verifyMappingPrompt = (entries: FlatTocEntry[], taggedPages: string): string => `For each TOC entry, verify whether its assigned physical_index page actually contains that section title.

Entries:
${JSON.stringify(entries)}

Pages (tagged):
${taggedPages}

Return JSON:
{ "results": [{ "structure": "<s>", "correct": "yes" | "no" }] }`;
