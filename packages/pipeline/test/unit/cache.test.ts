import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withCache } from '../../src/cache.js';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcache-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe('withCache', () => {
  it('runs fn on miss, returns its result, writes file', async () => {
    let calls = 0;
    const r = await withCache({ cacheDir: dir, step: 'step01', force: false }, async () => { calls++; return { ok: 1 }; });
    expect(r).toEqual({ ok: 1 });
    expect(calls).toBe(1);
    const stat = await fs.stat(path.join(dir, 'step01.json'));
    expect(stat.isFile()).toBe(true);
  });

  it('skips fn on hit, returns cached', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { v: calls }; };
    await withCache({ cacheDir: dir, step: 's', force: false }, fn);
    const r = await withCache({ cacheDir: dir, step: 's', force: false }, fn);
    expect(r).toEqual({ v: 1 });
    expect(calls).toBe(1);
  });

  it('force=true re-runs even on hit', async () => {
    let calls = 0;
    const fn = async () => { calls++; return { v: calls }; };
    await withCache({ cacheDir: dir, step: 's', force: false }, fn);
    const r = await withCache({ cacheDir: dir, step: 's', force: true }, fn);
    expect(r).toEqual({ v: 2 });
    expect(calls).toBe(2);
  });
});
