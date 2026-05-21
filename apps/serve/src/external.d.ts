declare module '@buddy/query' {
  export function createTopicCache(opts: {
    dataDir: string;
    watch: boolean;
    onChange?: (topic: string) => void;
  }): { close(): Promise<void> };
}

declare module '@buddy/server' {
  export function createApp(deps: unknown): { fetch: (req: Request) => Promise<Response> };
  export function openDb(filePath: string): { close(): void };
  export function runMigrations(db: unknown): void;
  export function conversationsRepo(db: unknown): unknown;
  export function messagesRepo(db: unknown): unknown;
  export function createPdfCache(max?: number): unknown;
}
