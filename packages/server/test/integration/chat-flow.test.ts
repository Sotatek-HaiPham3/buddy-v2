import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  createStubGemini,
  hashPrompt,
  type DocOutput,
} from '@buddy/shared';
import { createTopicCache, docSelectorPrompt, treeReasonerPrompt, answerPrompt } from '@buddy/query';
import {
  conversationsRepo,
  createApp,
  createPdfCache,
  messagesRepo,
  openDb,
  runMigrations,
} from '../../src/index.js';

describe('chat flow integration', () => {
  it('round trip with SSE and persistence', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-'));
    const topic = 'tax';
    const docId = 'd1';
    await fs.mkdir(path.join(dataDir, topic, '.index'), { recursive: true });

    const pdf = await PDFDocument.create();
    const f = await pdf.embedFont(StandardFonts.Helvetica);
    const p = pdf.addPage([200, 200]);
    p.drawText('Revenue grew 10%.', { x: 10, y: 100, size: 12, font: f });
    await fs.writeFile(path.join(dataDir, topic, 'a.pdf'), Buffer.from(await pdf.save()));

    const doc: DocOutput = {
      doc_id: docId,
      doc_name: 'a.pdf',
      doc_description: 'finance',
      structure: [{ title: 'Q3', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
    };
    await fs.writeFile(path.join(dataDir, topic, '.index', `${docId}.tree.json`), JSON.stringify(doc));

    const tp = treeReasonerPrompt([doc], 'how was revenue?', '');
    const ap = answerPrompt(
      'how was revenue?',
      [
        {
          doc_id: docId,
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
    const dp = docSelectorPrompt([doc], 'how was revenue?', '');
    const responses = new Map();
    responses.set(hashPrompt([dp]), { text: '{"reasoning":"single document topic","doc_ids":["d1"]}' });
    responses.set(hashPrompt([tp]), { text: '{"reasoning":"pick Q3","selections":[{"doc_id":"d1","node_ids":["n1"]}]}' });
    responses.set(hashPrompt([ap]), { text: 'Revenue grew 10%.' });
    const gemini = createStubGemini({ responses });

    const db = openDb(':memory:');
    runMigrations(db);
    const convs = conversationsRepo(db);
    const msgs = messagesRepo(db);
    const app = createApp({
      dataDir,
      convs,
      msgs,
      pdfCache: createPdfCache(),
      topicCache: createTopicCache({ dataDir, watch: false }),
      gemini,
      pdfPathFor: (t, name) => path.join(dataDir, t, name),
    });
    const created = await app.request('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic }),
    });
    const { id } = (await created.json()) as { id: string };
    const res = await app.request('/api/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: id, query: 'how was revenue?' }),
    });
    const text = await res.text();
    expect(text).toContain('event: trace');
    expect(text).toContain('event: citations');
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');
    const stored = msgs.listByConversation(id);
    expect(stored.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});
