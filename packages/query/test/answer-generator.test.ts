import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import type { Citation } from '@buddy/shared';
import { answerPrompt } from '../src/prompts/answer.js';
import { generateAnswer } from '../src/answer-generator.js';
import type { RetrievedNode } from '../src/types.js';

describe('generateAnswer', () => {
  it('streams tokens and emits citations', async () => {
    const retrieved = [
      {
        doc_id: 'd1',
        doc_name: 'a.pdf',
        node_id: 'n1',
        title: 'Q3',
        page_range: [1, 1] as [number, number],
        text: 'Revenue grew 10%',
        image_captions: [],
        tables: [],
      },
    ];
    const prompt = answerPrompt('how?', retrieved, []);
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'Revenue grew 10%.' });
    const gemini = createStubGemini({ responses, chunkSize: 100 });
    const events = [];
    for await (const e of generateAnswer({ gemini, query: 'how?', retrieved, history: [] })) events.push(e);
    expect(events.at(0)?.type).toBe('token');
    expect(events.at(-1)?.type).toBe('citations');
  });

  it('logs usage when stream chunk includes token usage', async () => {
    const retrieved = [
      {
        doc_id: 'd1',
        doc_name: 'a.pdf',
        node_id: 'n1',
        title: 'Q3',
        page_range: [1, 1] as [number, number],
        text: 'Revenue grew 10%',
        image_captions: [],
        tables: [],
      },
    ];
    const logs: Array<{ msg: string; obj: unknown }> = [];
    const logger = {
      debug: (obj: unknown, msg: string) => logs.push({ msg, obj }),
    } as never;
    const gemini = {
      async *generateStream() {
        yield { delta: 'Revenue', cachedTokens: 300, promptTokens: 900 };
      },
    } as never;

    const events = [];
    for await (const e of generateAnswer({ gemini, query: 'how?', retrieved, history: [], logger })) {
      events.push(e);
    }

    expect(events.at(0)).toEqual({ type: 'token', delta: 'Revenue' });
    expect(logs.some((l) => l.msg === 'LLM usage')).toBe(true);
  });

  it('emits doc_pages in citation when doc_page_range is present', async () => {
    const retrieved: RetrievedNode[] = [{
      doc_id: 'd1',
      doc_name: 'Chapter01.pdf',
      node_id: 'n1',
      title: 'OXEN',
      page_range: [1, 1],
      doc_page_range: [5, 5],
      text: 'Oxen are castrated adult male bovine animals.',
      image_captions: [],
      tables: [],
    }];
    const prompt = answerPrompt('What are oxen?', retrieved, []);
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'Oxen are draft animals.' });
    const gemini = createStubGemini({ responses });
    const chunks: unknown[] = [];
    for await (const chunk of generateAnswer({ gemini, query: 'What are oxen?', retrieved, history: [] })) {
      chunks.push(chunk);
    }
    const citEvent = chunks.find((c: unknown) => (c as { type: string }).type === 'citations') as
      { type: 'citations'; citations: Citation[] } | undefined;
    expect(citEvent).toBeDefined();
    expect(citEvent!.citations[0].pages).toEqual([1]);
    expect(citEvent!.citations[0].doc_pages).toEqual([5]);
  });

  it('omits doc_pages from citation when doc_page_range is absent', async () => {
    const retrieved: RetrievedNode[] = [{
      doc_id: 'd1',
      doc_name: 'Chapter01.pdf',
      node_id: 'n1',
      title: 'OXEN',
      page_range: [1, 1],
      text: 'Oxen are draft animals.',
      image_captions: [],
      tables: [],
    }];
    const prompt = answerPrompt('What are oxen?', retrieved, []);
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'Oxen are draft animals.' });
    const gemini = createStubGemini({ responses });
    const chunks: unknown[] = [];
    for await (const chunk of generateAnswer({ gemini, query: 'What are oxen?', retrieved, history: [] })) {
      chunks.push(chunk);
    }
    const citEvent = chunks.find((c: unknown) => (c as { type: string }).type === 'citations') as
      { type: 'citations'; citations: Citation[] } | undefined;
    expect(citEvent!.citations[0].doc_pages).toBeUndefined();
  });

  it('emits logical_pages when logical_page_range is present', async () => {
    const retrieved: RetrievedNode[] = [{
      doc_id: 'd1',
      doc_name: 'Chapter01.pdf',
      node_id: 'n1',
      title: 'OXEN',
      page_range: [40, 40],
      logical_page_range: [9, 9],
      text: 'Oxen are draft animals.',
      image_captions: [],
      tables: [],
    }];
    const prompt = answerPrompt('What are oxen?', retrieved, []);
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'Oxen are draft animals.' });
    const gemini = createStubGemini({ responses });
    const chunks: unknown[] = [];
    for await (const chunk of generateAnswer({ gemini, query: 'What are oxen?', retrieved, history: [] })) {
      chunks.push(chunk);
    }
    const citEvent = chunks.find((c: unknown) => (c as { type: string }).type === 'citations') as
      { type: 'citations'; citations: Citation[] } | undefined;
    expect(citEvent!.citations[0].logical_pages).toEqual([9]);
  });

  it('omits logical_pages when neither logical nor doc_page range is present', async () => {
    const retrieved: RetrievedNode[] = [{
      doc_id: 'd1',
      doc_name: 'Chapter01.pdf',
      node_id: 'n1',
      title: 'OXEN',
      page_range: [40, 40],
      text: 'Oxen are draft animals.',
      image_captions: [],
      tables: [],
    }];
    const prompt = answerPrompt('What are oxen?', retrieved, []);
    const responses = new Map();
    responses.set(hashPrompt([prompt]), { text: 'Oxen are draft animals.' });
    const gemini = createStubGemini({ responses });
    const chunks: unknown[] = [];
    for await (const chunk of generateAnswer({ gemini, query: 'What are oxen?', retrieved, history: [] })) {
      chunks.push(chunk);
    }
    const citEvent = chunks.find((c: unknown) => (c as { type: string }).type === 'citations') as
      { type: 'citations'; citations: Citation[] } | undefined;
    expect(citEvent!.citations[0].logical_pages).toBeUndefined();
  });
});
