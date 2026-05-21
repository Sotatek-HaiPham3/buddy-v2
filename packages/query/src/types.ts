import type { Citation, GeminiClient, Logger, ReasoningTrace } from '@buddy/shared';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AnswerEvent =
  | { type: 'token'; delta: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'trace'; trace: ReasoningTrace }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface RetrievedNode {
  doc_id: string;
  doc_name: string;
  node_id: string;
  title: string;
  page_range: [number, number];
  text: string;
  image_captions: { page: number; caption: string }[];
  tables: { page: number; schema: string; preview: string }[];
}

export interface AnswerOpts {
  dataDir: string;
  topic: string;
  query: string;
  history: HistoryTurn[];
  gemini: GeminiClient;
  pdfPathFor: (docName: string) => string;
  topicCache?: TopicCache;
  logger?: Logger;
}

import type { DocOutput } from '@buddy/shared';
export interface TopicCache {
  get(topic: string): Promise<Map<string, DocOutput>>;
  reload(topic: string): Promise<void>;
  close(): Promise<void>;
}
