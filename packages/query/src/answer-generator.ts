import type { Citation, GeminiClient, Logger } from '@buddy/shared';
import { answerPrompt } from './prompts/answer.js';
import type { HistoryTurn, RetrievedNode } from './types.js';

export async function* generateAnswer(opts: {
  gemini: GeminiClient;
  query: string;
  retrieved: RetrievedNode[];
  history: HistoryTurn[];
  logger?: Logger;
}): AsyncIterable<{ type: 'token'; delta: string } | { type: 'citations'; citations: Citation[] }> {
  const prompt = answerPrompt(opts.query, opts.retrieved, opts.history);
  for await (const chunk of opts.gemini.generateStream([prompt], { temperature: 0.2 })) {
    const usage = chunk as { cachedTokens?: number; promptTokens?: number };
    if (opts.logger && (usage.cachedTokens !== undefined || usage.promptTokens !== undefined)) {
      opts.logger.debug(
        {
          step: 'answer-generator',
          cachedTokens: usage.cachedTokens,
          promptTokens: usage.promptTokens,
        },
        'LLM usage',
      );
    }
    yield { type: 'token', delta: chunk.delta };
  }
  const citations: Citation[] = opts.retrieved.map((r) => ({
    doc: r.doc_name,
    node_ids: [r.node_id],
    pages: [r.page_range[0], r.page_range[1]].filter((v, i, arr) => arr.indexOf(v) === i),
    ...(r.doc_page_range !== undefined
      ? { doc_pages: [r.doc_page_range[0], r.doc_page_range[1]].filter((v, i, arr) => arr.indexOf(v) === i) }
      : {}),
  }));
  yield { type: 'citations', citations };
}
