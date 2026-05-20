import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveDocCacheDir,
  resolveDocPagesDir,
  resolveDocTreePath,
  resolveImagesDir,
  resolveIndexDir,
  resolveLogsDir,
  resolveTopicDir,
} from '../src/paths.js';

const DATA = '/tmp/data';

describe('paths', () => {
  it('resolveTopicDir joins DATA_DIR + topic', () => {
    expect(resolveTopicDir(DATA, 'finance')).toBe(path.join(DATA, 'finance'));
  });

  it('resolveIndexDir adds .index', () => {
    expect(resolveIndexDir(DATA, 'finance')).toBe(path.join(DATA, 'finance', '.index'));
  });

  it('resolveDocTreePath adds <doc>.tree.json', () => {
    expect(resolveDocTreePath(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'doc_abc.tree.json'),
    );
  });

  it('resolveDocCacheDir adds <doc>/.cache', () => {
    expect(resolveDocCacheDir(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'doc_abc', '.cache'),
    );
  });

  it('resolveDocPagesDir adds <doc>/pages', () => {
    expect(resolveDocPagesDir(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'doc_abc', 'pages'),
    );
  });

  it('resolveImagesDir adds images/<doc>', () => {
    expect(resolveImagesDir(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'images', 'doc_abc'),
    );
  });

  it('resolveLogsDir adds logs', () => {
    expect(resolveLogsDir(DATA, 'finance')).toBe(
      path.join(DATA, 'finance', '.index', 'logs'),
    );
  });
});
