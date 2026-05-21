import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { topicsRoutes } from '../../src/routes/topics.js';

describe('topics routes', () => {
  it('lists topics', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'topics-'));
    await fs.mkdir(path.join(dataDir, 'tax', '.index'), { recursive: true });
    const app = new Hono().route('/api', topicsRoutes({ dataDir }));
    const res = await app.request('/api/topics');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ topic: 'tax', doc_count: 0, last_built_at: null }]);
  });
});
