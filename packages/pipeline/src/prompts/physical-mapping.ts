import type { FlatTocEntry } from '../types.js';

export const physicalMappingPrompt = (tocJson: FlatTocEntry[], taggedPages: string): string => `You are given a table of contents in JSON format and several pages of a document.
Add the physical_index to the table of contents.

The provided pages contain tags like <physical_index_X> to indicate page location.
Use the tag values for physical_index. Ignore any printed page numbers in page text (those are logical page numbers and are not requested here).

Response format:
[
  { "structure": "1", "title": "Executive Summary", "physical_index": "<physical_index_5>" }
]

TOC:
${JSON.stringify(tocJson)}

Pages:
${taggedPages}`;
