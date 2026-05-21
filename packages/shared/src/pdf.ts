import * as mupdf from 'mupdf';
import { PNG } from 'pngjs';

export interface PdfDoc {
  readonly _doc: mupdf.PDFDocument;
}

export function openPdf(buffer: Buffer | Uint8Array): PdfDoc {
  const bytes = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf') as mupdf.PDFDocument;
  return { _doc: doc };
}

export function getPageCount(doc: PdfDoc): number {
  return doc._doc.countPages();
}

function assertPageIndex(doc: PdfDoc, pageIndex: number): void {
  const count = getPageCount(doc);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= count) {
    throw new RangeError(`pageIndex ${pageIndex} out of range [0, ${count - 1}]`);
  }
}

export function getPageText(doc: PdfDoc, pageIndex: number): string {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const json = page.toStructuredText('preserve-whitespace').asJSON();
  const data = JSON.parse(json) as {
    blocks?: { lines?: { text?: string }[] }[];
  };
  const lines: string[] = [];
  for (const block of data.blocks ?? []) {
    for (const line of block.lines ?? []) {
      if (line.text) lines.push(line.text);
    }
  }
  return lines.join('\n');
}

export function getPageImage(doc: PdfDoc, pageIndex: number, scale = 1.0): Buffer {
  return renderPage(doc, pageIndex, scale).png;
}

export interface PageRender {
  png: Buffer;
  widthPx: number;
  heightPx: number;
}

export function renderPage(doc: PdfDoc, pageIndex: number, scale = 2.0): PageRender {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  return {
    png: Buffer.from(pixmap.asPNG()),
    widthPx: pixmap.getWidth(),
    heightPx: pixmap.getHeight(),
  };
}

export interface PixelBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

function assertValidPixelBbox(bbox: PixelBbox): void {
  assertFiniteNumber('bbox.x', bbox.x);
  assertFiniteNumber('bbox.y', bbox.y);
  assertFiniteNumber('bbox.w', bbox.w);
  assertFiniteNumber('bbox.h', bbox.h);
  if (bbox.w <= 0) {
    throw new RangeError('bbox.w must be greater than 0');
  }
  if (bbox.h <= 0) {
    throw new RangeError('bbox.h must be greater than 0');
  }
}

export async function cropPng(png: Buffer, bbox: PixelBbox): Promise<Buffer> {
  assertValidPixelBbox(bbox);
  const src = PNG.sync.read(png);
  const maxLeft = Math.max(0, src.width - 1);
  const maxTop = Math.max(0, src.height - 1);
  const left = Math.max(0, Math.min(maxLeft, Math.floor(bbox.x)));
  const top = Math.max(0, Math.min(maxTop, Math.floor(bbox.y)));
  const right = Math.max(left + 1, Math.min(src.width, Math.ceil(bbox.x + bbox.w)));
  const bottom = Math.max(top + 1, Math.min(src.height, Math.ceil(bbox.y + bbox.h)));
  const width = right - left;
  const height = bottom - top;
  const dst = new PNG({ width, height });

  for (let row = 0; row < height; row++) {
    const srcStart = ((top + row) * src.width + left) * 4;
    const dstStart = row * width * 4;
    src.data.copy(dst.data, dstStart, srcStart, srcStart + width * 4);
  }

  return PNG.sync.write(dst);
}

export interface EmbeddedImage {
  bbox: { x: number; y: number; w: number; h: number };
  bytes: Buffer;
  mime: string;
}

export function extractEmbeddedImages(doc: PdfDoc, pageIndex: number): EmbeddedImage[] {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const structuredText = page.toStructuredText('preserve-images');
  const out: EmbeddedImage[] = [];

  structuredText.walk({
    onImageBlock(bbox, _transform, image) {
      const pixmap = image.toPixmap();
      out.push({
        bbox: {
          x: bbox[0],
          y: bbox[1],
          w: bbox[2] - bbox[0],
          h: bbox[3] - bbox[1],
        },
        bytes: Buffer.from(pixmap.asPNG()),
        mime: 'image/png',
      });
    },
  });
  if (out.length > 0) return out;

  const json = structuredText.asJSON();
  const data = JSON.parse(json) as {
    blocks?: {
      type?: string;
      bbox?: { x: number; y: number; w: number; h: number };
      image?: { data?: string; mimeType?: string };
    }[];
  };

  for (const b of data.blocks ?? []) {
    if (b.type === 'image' && b.bbox && b.image?.data && b.image.mimeType) {
      out.push({
        bbox: b.bbox,
        bytes: Buffer.from(b.image.data, 'base64'),
        mime: b.image.mimeType,
      });
    }
  }

  return out;
}
