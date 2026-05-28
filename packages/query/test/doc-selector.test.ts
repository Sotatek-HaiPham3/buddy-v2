import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { selectDocs } from '../src/doc-selector.js';
import { collectTitlesWithSummaries, docSelectorPrompt } from '../src/prompts/doc-selector.js';
import type { TreeNode } from '@buddy/shared';

const doc: DocOutput = {
  doc_id: 'd1',
  doc_name: 'a.pdf',
  doc_description: 'finance',
  structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
};

const node = (title: string, summary?: string, nodes: TreeNode[] = []): TreeNode => ({
  title,
  start_index: 1,
  end_index: 1,
  node_id: title.toLowerCase().replace(/\s+/g, '-'),
  nodes,
  images: [],
  tables: [],
  ...(summary ? { summary } : {}),
});

describe('selectDocs', () => {
  it('uses llm for multi-doc topics', async () => {
    const prompt = docSelectorPrompt([doc, { ...doc, doc_id: 'd2' }], 'revenue?', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: '{"reasoning":"fit","doc_ids":["d1"]}' });
    const gemini = createStubGemini({ responses });
    const out = await selectDocs({ gemini, docs: [doc, { ...doc, doc_id: 'd2' }], query: 'revenue?', historySummary: '' });
    expect(out.doc_ids).toEqual(['d1']);
  });

  it('logs cached token usage when present', async () => {
    const prompt = docSelectorPrompt([doc, { ...doc, doc_id: 'd2' }], 'revenue?', '');
    const responses = new Map();
    responses.set(hashPrompt([prompt]), {
      text: '{"reasoning":"fit","doc_ids":["d1"]}',
      cachedTokens: 512,
      promptTokens: 800,
    });
    const gemini = createStubGemini({ responses });
    const logs: Array<{ msg: string; obj: unknown }> = [];
    const logger = {
      debug: (obj: unknown, msg: string) => logs.push({ msg, obj }),
    } as never;

    await selectDocs({
      gemini,
      docs: [doc, { ...doc, doc_id: 'd2' }],
      query: 'revenue?',
      historySummary: '',
      logger,
    });

    expect(logs.some((l) => l.msg === 'LLM usage')).toBe(true);
  });
});

describe('collectTitlesWithSummaries', () => {
  it('emits indented titles and includes summaries when present', () => {
    const tree: TreeNode[] = [
      node('CHAPTER 2', undefined, [
        node('0207.14.91'),
        node(
          'MECHANICALLY DEBONED OR SEPARATED MEAT',
          'The document explains mechanically deboned or separated meat as a paste-like product.',
        ),
        node('FREEZE-DRIED DICED CHICKEN', 'Cubed chicken preserved by freezing and vacuum drying.'),
      ]),
    ];
    const out = collectTitlesWithSummaries(tree, 2, 30);
    const text = out.join('\n');
    expect(text).toContain('- CHAPTER 2');
    expect(text).toContain('- MECHANICALLY DEBONED OR SEPARATED MEAT');
    expect(text).toContain('paste-like product');
    expect(text).toContain('FREEZE-DRIED DICED CHICKEN');
    expect(text).toContain('vacuum drying');
  });

  it('respects maxDepth and does not descend past depth limit', () => {
    const deep: TreeNode[] = [node('A', undefined, [node('A.1', undefined, [node('A.1.1')])])];
    const out = collectTitlesWithSummaries(deep, 1, 30);
    const text = out.join('\n');
    expect(text).toContain('- A');
    expect(text).toContain('- A.1');
    expect(text).not.toContain('A.1.1');
  });

  it('caps output at maxLines and emits more marker', () => {
    const many: TreeNode[] = [];
    for (let i = 0; i < 50; i++) many.push(node('item-' + i));
    const out = collectTitlesWithSummaries(many, 2, 10);
    expect(out.length).toBeLessThanOrEqual(11);
    expect(out[out.length - 1]).toMatch(/more/);
  });

  it('omits summary line when node has no summary', () => {
    const tree: TreeNode[] = [node('A')];
    const out = collectTitlesWithSummaries(tree, 1, 30);
    expect(out).toEqual(['- A']);
  });
});

describe('docSelectorPrompt shape', () => {
  const mk = (id: string, name: string, structure: TreeNode[]): DocOutput => ({
    doc_id: id,
    doc_name: name,
    doc_description: 'desc',
    structure,
  });

  it('includes nested titles (depth 2) for each doc', () => {
    const docs: DocOutput[] = [
      mk('d1', 'Doc.pdf', [node('CHAPTER 1', undefined, [node('MECHANICALLY DEBONED MEAT')])]),
    ];
    const prompt = docSelectorPrompt(docs, 'q', '');
    expect(prompt).toContain('MECHANICALLY DEBONED MEAT');
  });

  it('includes node summaries when present', () => {
    const docs: DocOutput[] = [
      mk('d1', 'Doc.pdf', [node('CHAPTER 1', undefined, [node('A topic', 'A useful summary that mentions deboning.')])]),
    ];
    const prompt = docSelectorPrompt(docs, 'q', '');
    expect(prompt).toContain('A useful summary that mentions deboning.');
  });

  it('shows doc_description and structure together', () => {
    const docs: DocOutput[] = [mk('d1', 'Doc.pdf', [node('A')])];
    const prompt = docSelectorPrompt(docs, 'q', '');
    expect(prompt).toContain('description: desc');
    expect(prompt).toContain('structure (titles + summaries');
  });
});
