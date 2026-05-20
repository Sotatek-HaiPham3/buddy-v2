import * as mupdf from 'mupdf';

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
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = pixmap.asPNG();
  return Buffer.from(png);
}

export interface EmbeddedImage {
  bbox: { x: number; y: number; w: number; h: number };
  bytes: Buffer;
  mime: string;
}

export function extractEmbeddedImages(doc: PdfDoc, pageIndex: number): EmbeddedImage[] {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  const json = page.toStructuredText('preserve-images').asJSON();
  const data = JSON.parse(json) as {
    blocks?: {
      type?: string;
      bbox?: { x: number; y: number; w: number; h: number };
      image?: { data?: string; mimeType?: string };
    }[];
  };
  const out: EmbeddedImage[] = [];
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
