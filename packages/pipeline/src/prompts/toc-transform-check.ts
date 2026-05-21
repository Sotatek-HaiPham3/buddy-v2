export const tocTransformCheckPrompt = (rawToc: string, jsonOut: string): string => `Does the JSON below contain ALL items from the raw TOC?

Raw TOC:
${rawToc}

JSON output:
${jsonOut}

Return JSON: { "complete": "yes" | "no" }`;
