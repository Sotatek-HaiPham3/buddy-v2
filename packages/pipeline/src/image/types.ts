export interface DetectedImage {
  page: number;
  source: 'embedded' | 'vision';
  bbox: { x: number; y: number; w: number; h: number };
  bytes: Buffer;
  mime: string;
}

export interface SavedImage extends DetectedImage {
  path: string;
  sidecarPath: string;
  idx: number;
}

export interface DescribedImage extends SavedImage {
  caption: string;
}
