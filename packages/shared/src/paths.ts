import path from 'node:path';

export const resolveTopicDir = (dataDir: string, topic: string): string =>
  path.join(dataDir, topic);

export const resolveIndexDir = (dataDir: string, topic: string): string =>
  path.join(resolveTopicDir(dataDir, topic), '.index');

export const resolveDocTreePath = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), `${docId}.tree.json`);

export const resolveDocCacheDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, '.cache');

export const resolveDocPagesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, 'pages');

export const resolveImagesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), 'images', docId);

export const resolveDocImagesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, 'images');

export const resolveDocTablesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, 'tables');

export const resolveLogsDir = (dataDir: string, topic: string): string =>
  path.join(resolveIndexDir(dataDir, topic), 'logs');
