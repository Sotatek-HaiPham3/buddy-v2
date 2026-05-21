import { createStubGemini, hashPrompt, type PageRender } from '@buddy/shared';
import { describe, expect, it } from 'vitest';
import { detectViaVision } from '../../../src/image/detect-via-vision.js';
import { detectImageBboxPrompt } from '../../../src/prompts/detect-image-bbox.js';

function makeRender(): PageRender {
  return {
    png: Buffer.from('page-render-png'),
    widthPx: 200,
    heightPx: 100,
  };
}

describe('detectViaVision', () => {
  it('converts percentage bboxes to pixel coordinates', async () => {
    const pageRender = makeRender();
    const parts = [
      detectImageBboxPrompt(),
      {
        inlineData: {
          data: pageRender.png.toString('base64'),
          mimeType: 'image/png',
        },
      },
    ] as const;
    const responses = new Map([
      [hashPrompt([...parts]), {
        text: JSON.stringify({
          visual_elements: [
            {
              type: 'chart',
              bbox: { top: 20, left: 10, width: 30, height: 40 },
              hint: 'sales chart',
            },
          ],
        }),
      }],
    ]);
    const gemini = createStubGemini({ responses });

    const images = await detectViaVision({ gemini, page: 3, pageRender, visionModel: 'vision-x' });

    expect(images).toEqual([
      {
        page: 3,
        source: 'vision',
        bbox: { x: 20, y: 20, w: 60, h: 40 },
        bytes: pageRender.png,
        mime: 'image/png',
      },
    ]);
    expect(gemini.calls[0]?.parts).toEqual([...parts]);
    expect(gemini.calls[0]?.opts).toEqual({ model: 'vision-x' });
  });

  it('returns an empty array when the model finds no visual elements', async () => {
    const pageRender = makeRender();
    const responses = new Map([
      [hashPrompt([
        detectImageBboxPrompt(),
        {
          inlineData: {
            data: pageRender.png.toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]), { text: '{"visual_elements":[]}' }],
    ]);
    const gemini = createStubGemini({ responses });

    await expect(detectViaVision({ gemini, page: 1, pageRender })).resolves.toEqual([]);
  });

  it('returns an empty array on malformed JSON', async () => {
    const pageRender = makeRender();
    const responses = new Map([
      [hashPrompt([
        detectImageBboxPrompt(),
        {
          inlineData: {
            data: pageRender.png.toString('base64'),
            mimeType: 'image/png',
          },
        },
      ]), { text: 'not json' }],
    ]);
    const gemini = createStubGemini({ responses });

    await expect(detectViaVision({ gemini, page: 1, pageRender })).resolves.toEqual([]);
  });
});
