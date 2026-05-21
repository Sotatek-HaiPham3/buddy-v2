import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '@buddy/shared';
import { answerPrompt } from '../src/prompts/answer.js';
import { generateAnswer } from '../src/answer-generator.js';

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
});
