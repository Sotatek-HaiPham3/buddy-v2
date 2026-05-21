export const tocTransformPrompt = (tocText: string): string => `Transform the table of contents into JSON format.

"structure" is the hierarchy index (1, 1.1, 1.2, 2, etc.)

Response format:
{
  "table_of_contents": [
    { "structure": "1", "title": "Executive Summary", "page": 1 },
    { "structure": "1.1", "title": "Overview", "page": 3 }
  ]
}

Given table of contents:
${tocText}`;

export const tocTransformContinuePrompt = (priorJson: string): string => `Continue the JSON structure below. Output ONLY the remaining items as a JSON array continuation, no preamble.

Prior output:
${priorJson}`;
