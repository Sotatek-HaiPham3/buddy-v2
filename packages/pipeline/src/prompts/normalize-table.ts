export const normalizeTablePrompt = (rawCells: string[][]): string => `You are normalizing a table extracted from a PDF.

Raw cells (rows top-to-bottom, columns left-to-right):
${JSON.stringify(rawCells, null, 2)}

Tasks:
1. Decide whether row 1 is a header. If yes, return it as headers; otherwise synthesize column names: "col1", "col2", ...
2. Clean OCR artifacts: collapse whitespace, drop border characters (|, -, _).
3. Infer column type per column: "string" | "number" | "date" | "mixed".
4. Write a one-line schema descriptor describing what the table is about (e.g. "Quarterly revenue by product").

Return JSON only:
{
  "headers": ["..."],
  "rows": [["..."]],
  "columnTypes": ["string"|"number"|"date"|"mixed", ...],
  "schemaDescriptor": "..."
}`;
