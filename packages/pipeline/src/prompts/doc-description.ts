import type { TreeNode } from '@buddy/shared';

export const docDescriptionPrompt = (titles: TreeNode[]): string => `Given the section titles of a document, generate a 2-3 sentence description of what the document is about.

Top-level titles:
${titles.map(t => `- ${t.title}`).join('\n')}

Directly return the description as plain text.`;
