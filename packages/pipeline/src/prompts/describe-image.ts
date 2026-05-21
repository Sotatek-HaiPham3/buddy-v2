export const describeImagePrompt = (): string => `Describe this visual element in plain text.

Include all text that is visible. For charts, include axes, legends, labels, values, and trends.
For diagrams, include nodes, connections, and flow direction. For photos or illustrations,
describe the subject, context, and any notable details.

Return plain text only. Do not use markdown.`;
