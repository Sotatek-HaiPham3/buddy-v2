type ExportMessage = { role: 'user' | 'assistant'; content: string };

export function toMarkdown(messages: ExportMessage[], title: string): string {
  const sections = [`# ${title}`];
  for (const m of messages) {
    sections.push(`\n## ${m.role === 'user' ? 'User' : 'Assistant'}\n${m.content}`);
  }
  return sections.join('\n');
}

export function toJson(messages: unknown[]): string {
  return JSON.stringify(messages, null, 2);
}

export function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
