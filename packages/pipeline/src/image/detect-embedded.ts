import { extractEmbeddedImages, type PdfDoc } from '@buddy/shared';
import type { DetectedImage } from './types.js';

export function detectEmbeddedImages(doc: PdfDoc, page: number): DetectedImage[] {
  return extractEmbeddedImages(doc, page - 1).map((image) => ({
    page,
    source: 'embedded',
    bbox: image.bbox,
    bytes: image.bytes,
    mime: image.mime,
  }));
}
