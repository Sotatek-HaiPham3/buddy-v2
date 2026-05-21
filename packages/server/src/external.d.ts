declare module '@buddy/query' {
  export interface TopicCache {
    get(topic: string): Promise<Map<string, unknown>>;
    reload(topic: string): Promise<void>;
    close(): Promise<void>;
  }
  export function answer(opts: {
    dataDir: string;
    topic: string;
    query: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    gemini: unknown;
    topicCache?: TopicCache;
    pdfPathFor: (docName: string) => string;
  }): AsyncIterable<unknown>;
}
