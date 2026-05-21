import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveImage } from '../../../src/image/save.js';
import type { DetectedImage } from '../../../src/image/types.js';

describe('saveImage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'buddy-image-save-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes a page-idx png and sidecar json under the target directory', async () => {
    const image: DetectedImage = {
      page: 3,
      source: 'embedded',
      bbox: { x: 1, y: 2, w: 3, h: 4 },
      bytes: Buffer.from('original'),
      mime: 'image/png',
    };
    const materialized = Buffer.from([1, 2, 3]);

    const saved = await saveImage({ dir, idx: 0, image, bytes: materialized });

    expect(path.basename(saved.path)).toBe('3-0.png');
    expect(path.basename(saved.sidecarPath)).toBe('3-0.json');
    await expect(fs.readFile(saved.path)).resolves.toEqual(materialized);
    const sidecar = JSON.parse(await fs.readFile(saved.sidecarPath, 'utf8'));
    expect(sidecar).toEqual({
      page: 3,
      source: 'embedded',
      bbox: { x: 1, y: 2, w: 3, h: 4 },
      mime: 'image/png',
    });
  });
});
