import type { GeminiClient, PageRender } from '@buddy/shared';
import { extractJson } from '../json-utils.js';
import { detectImageBboxPrompt } from '../prompts/detect-image-bbox.js';
import type { DetectedImage } from './types.js';

interface DetectViaVisionOpts {
  gemini: GeminiClient;
  page: number;
  pageRender: PageRender;
  visionModel?: string;
}

interface RawVisualElement {
  bbox?: {
    top?: number;
    left?: number;
    width?: number;
    height?: number;
  };
}

interface RawVisualElementResponse {
  visual_elements?: RawVisualElement[];
}

function isFiniteBox(element: RawVisualElement): element is {
  bbox: { top: number; left: number; width: number; height: number };
} {
  return Number.isFinite(element.bbox?.top)
    && Number.isFinite(element.bbox?.left)
    && Number.isFinite(element.bbox?.width)
    && Number.isFinite(element.bbox?.height)
    && (element.bbox?.width ?? 0) > 0
    && (element.bbox?.height ?? 0) > 0;
}

export async function detectViaVision(opts: DetectViaVisionOpts): Promise<DetectedImage[]> {
  const result = await opts.gemini.generate(
    [
      detectImageBboxPrompt(),
      {
        inlineData: {
          data: opts.pageRender.png.toString('base64'),
          mimeType: 'image/png',
        },
      },
    ],
    opts.visionModel ? { model: opts.visionModel } : undefined,
  );
  try {
    const parsed = extractJson<RawVisualElementResponse>(result.text);

    return (parsed.visual_elements ?? [])
      .filter(isFiniteBox)
      .map(({ bbox }) => ({
        page: opts.page,
        source: 'vision' as const,
        bbox: {
          x: Math.round((bbox.left / 100) * opts.pageRender.widthPx),
          y: Math.round((bbox.top / 100) * opts.pageRender.heightPx),
          w: Math.round((bbox.width / 100) * opts.pageRender.widthPx),
          h: Math.round((bbox.height / 100) * opts.pageRender.heightPx),
        },
        bytes: opts.pageRender.png,
        mime: 'image/png',
      }));
  } catch {
    return [];
  }
}
