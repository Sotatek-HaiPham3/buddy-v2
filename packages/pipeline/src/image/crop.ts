import { cropPng } from '@buddy/shared';
import type { DetectedImage } from './types.js';

export async function materializeImageBytes(image: DetectedImage): Promise<Buffer> {
  if (image.source === 'embedded') {
    return image.bytes;
  }
  return cropPng(image.bytes, image.bbox);
}
