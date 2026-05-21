import fs from 'node:fs/promises';
import path from 'node:path';
import type { DetectedImage, SavedImage } from './types.js';

interface SaveImageOpts {
  dir: string;
  idx: number;
  image: DetectedImage;
  bytes: Buffer;
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export async function saveImage(opts: SaveImageOpts): Promise<SavedImage> {
  await fs.mkdir(opts.dir, { recursive: true });
  const base = `${opts.image.page}-${opts.idx}`;
  const imagePath = path.join(opts.dir, `${base}.${extensionForMime(opts.image.mime)}`);
  const sidecarPath = path.join(opts.dir, `${base}.json`);

  await fs.writeFile(imagePath, opts.bytes);
  await fs.writeFile(
    sidecarPath,
    JSON.stringify(
      {
        page: opts.image.page,
        source: opts.image.source,
        bbox: opts.image.bbox,
        mime: opts.image.mime,
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    ...opts.image,
    bytes: opts.bytes,
    path: imagePath,
    sidecarPath,
    idx: opts.idx,
  };
}
