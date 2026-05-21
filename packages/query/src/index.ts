import { summarizeHistory } from './history.js';
import { selectDocs } from './doc-selector.js';
import { reasonTree } from './tree-reasoner.js';
import { retrieveNodes } from './retrieval.js';
import { generateAnswer } from './answer-generator.js';
import { createTopicCache } from './topic-loader.js';
import type { AnswerEvent, AnswerOpts } from './types.js';

export async function* answer(opts: AnswerOpts): AsyncIterable<AnswerEvent> {
  try {
    const cache = opts.topicCache ?? createTopicCache({ dataDir: opts.dataDir, watch: false });
    const topicDocs = await cache.get(opts.topic);
    const docs = [...topicDocs.values()];
    const historySummary = summarizeHistory(opts.history);
    const docSelection = await selectDocs({
      gemini: opts.gemini,
      docs,
      query: opts.query,
      historySummary,
      ...(opts.logger ? { logger: opts.logger } : {}),
    });
    const selectedDocs =
      docSelection.doc_ids.length > 0
        ? docs.filter((d) => docSelection.doc_ids.includes(d.doc_id))
        : docs;
    const tree = await reasonTree({
      gemini: opts.gemini,
      docs: selectedDocs,
      query: opts.query,
      historySummary,
      ...(opts.logger ? { logger: opts.logger } : {}),
    });
    const nodeIds = tree.selections.flatMap((s) => s.node_ids);
    yield {
      type: 'trace',
      trace: {
        doc_selector: { reasoning: docSelection.reasoning, doc_ids: docSelection.doc_ids },
        tree_reasoner: { reasoning: tree.reasoning, node_ids: nodeIds },
      },
    };
    if (tree.selections.length === 0) {
      yield { type: 'token', delta: 'No relevant section found in indexed documents.' };
      yield { type: 'citations', citations: [] };
      yield { type: 'done' };
      return;
    }
    const retrieved = await retrieveNodes({
      dataDir: opts.dataDir,
      topic: opts.topic,
      docs: selectedDocs,
      selections: tree.selections,
      pdfPathFor: opts.pdfPathFor,
    });
    for await (const event of generateAnswer({
      gemini: opts.gemini,
      query: opts.query,
      retrieved,
      history: opts.history,
      ...(opts.logger ? { logger: opts.logger } : {}),
    })) {
      yield event;
    }
    yield { type: 'done' };
  } catch (error) {
    yield { type: 'error', message: error instanceof Error ? error.message : 'unknown error' };
  }
}

export * from './types.js';
export * from './topic-loader.js';
export * from './prompts/doc-selector.js';
export * from './prompts/tree-reasoner.js';
export * from './prompts/answer.js';
