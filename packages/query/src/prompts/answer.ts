import type { HistoryTurn, RetrievedNode } from '../types.js';

const HISTORY_TURNS = 6;

function formatSection(r: RetrievedNode): string {
  const head =
    '[CITE doc=' +
    r.doc_id +
    ' node=' +
    r.node_id +
    ' p.' +
    r.page_range[0] +
    '-' +
    r.page_range[1] +
    '] ' +
    r.title;
  const imgs = r.image_captions.length
    ? '\nImages on these pages:\n' +
      r.image_captions.map((c) => '  - p.' + c.page + ': ' + c.caption).join('\n')
    : '';
  const tbls = r.tables.length
    ? '\nTables on these pages:\n' +
      r.tables.map((t) => '  - p.' + t.page + ' schema=' + t.schema + '\n    ' + t.preview).join('\n')
    : '';
  return head + '\n' + r.text + imgs + tbls;
}

export function answerPrompt(query: string, retrieved: RetrievedNode[], history: HistoryTurn[]): string {
  const recent = history
    .slice(-HISTORY_TURNS)
    .map((t) => t.role.toUpperCase() + ': ' + t.content)
    .join('\n');
  const sections = retrieved.map(formatSection).join('\n\n---\n\n') || '(none retrieved)';
  const recentBlock = recent ? 'Recent conversation:\n' + recent + '\n\n' : '';
  return [
    'You are answering using ONLY the retrieved sections below.',
    'Be concise. When making a factual claim, append a citation in the form [doc-name p.X] using the doc name and page from the relevant section.',
    'If no retrieved section supports an answer, say so and do not invent citations.',
    '',
    'Retrieved sections:',
    '',
    sections,
    '',
    recentBlock + 'User: ' + query,
  ].join('\n');
}
