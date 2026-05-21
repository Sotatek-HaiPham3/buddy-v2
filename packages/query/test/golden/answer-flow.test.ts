import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt, type DocOutput } from '@buddy/shared';
import { answer } from '../../src/index.js';
import { docSelectorPrompt } from '../../src/prompts/doc-selector.js';
import { treeReasonerPrompt } from '../../src/prompts/tree-reasoner.js';
import { answerPrompt } from '../../src/prompts/answer.js';

async function mkPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([200, 200]);
  p.drawText(text, { x: 10, y: 100, size: 12, font: f });
  return Buffer.from(await pdf.save());
}

describe('answer flow', () => {
  it('emits trace/token/citations/done', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'af-'));
    const topic = 'tax';
    const doc: DocOutput = {
      doc_id: 'd1',
      doc_name: 'a.pdf',
      doc_description: 'finance',
      structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
    };
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });
    await fs.writeFile(path.join(dataDir, topic, '.index', 'd1.tree.json'), JSON.stringify(doc));
    const pdfPath = path.join(dataDir, topic, 'a.pdf');
    await fs.writeFile(pdfPath, await mkPdf('Revenue grew 10%.'));

    const ds = docSelectorPrompt([doc], 'how was revenue?', '');
    const tr = treeReasonerPrompt([doc], 'how was revenue?', '');
    const ap = answerPrompt(
      'how was revenue?',
      [
        {
          doc_id: 'd1',
          doc_name: 'a.pdf',
          node_id: 'n1',
          title: 'Q3',
          page_range: [1, 1],
          text: '--- page 1 ---\nRevenue grew 10%.',
          image_captions: [],
          tables: [],
        },
      ],
      [],
    );
    const responses = new Map();
    responses.set(hashPrompt([tr]), { text: '{"reasoning":"pick","selections":[{"doc_id":"d1","node_ids":["n1"]}]}' });
    responses.set(hashPrompt([ap]), { text: 'Revenue grew 10%.' });
    responses.set(hashPrompt([ds]), { text: '{"reasoning":"single document topic","doc_ids":["d1"]}' });
    const gemini = createStubGemini({ responses, chunkSize: 100 });

    const events = [];
    for await (const event of answer({
      dataDir,
      topic,
      query: 'how was revenue?',
      history: [],
      gemini,
      pdfPathFor: () => pdfPath,
    })) {
      events.push(event.type);
    }
    expect(events).toContain('trace');
    expect(events).toContain('token');
    expect(events).toContain('citations');
    expect(events).toContain('done');
  });
});
