export const summarizeNodePrompt = (text: string): string => `You are given a part of a document. Generate a 2-3 sentence description of the main points covered.

Document part:
${text}

Directly return the description as plain text (no JSON, no preamble).`;
