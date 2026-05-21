import type { GeminiClient } from '@buddy/shared';
import type { TopicCache } from '@buddy/query';
import type { conversationsRepo } from './db/repo/conversations.js';
import type { messagesRepo } from './db/repo/messages.js';
import type { createPdfCache } from './pdf-cache.js';

export interface ServerDeps {
  dataDir: string;
  convs: ReturnType<typeof conversationsRepo>;
  msgs: ReturnType<typeof messagesRepo>;
  pdfCache: ReturnType<typeof createPdfCache>;
  topicCache: TopicCache;
  gemini: GeminiClient;
  webDistDir?: string;
  pdfPathFor: (topic: string, docName: string) => string;
}
