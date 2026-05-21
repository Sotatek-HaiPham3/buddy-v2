import { createStubGemini, hashPrompt } from '@buddy/shared';
import { describe, expect, it } from 'vitest';
import { describeImage } from '../../../src/image/describe.js';
import { describeImagePrompt } from '../../../src/prompts/describe-image.js';
import type { SavedImage } from '../../../src/image/types.js';

describe('describeImage', () => {
  it('returns a described image and sends the prompt with inline image bytes', async () => {
    const image: SavedImage = {
      page: 2,
      idx: 1,
      source: 'embedded',
      bbox: { x: 1, y: 2, w: 3, h: 4 },
      bytes: Buffer.from('png-bytes'),
      mime: 'image/png',
      path: '/tmp/2-1.png',
      sidecarPath: '/tmp/2-1.json',
    };
    const parts = [
      describeImagePrompt(),
      {
        inlineData: {
          data: image.bytes.toString('base64'),
          mimeType: image.mime,
        },
      },
    ] as const;
    const gemini = createStubGemini({
      responses: new Map([[hashPrompt([...parts]), { text: '  bar chart of Q3 revenue.\n' }]]),
    });

    const described = await describeImage({ gemini, image, visionModel: 'vision-x' });

    expect(described).toEqual({ ...image, caption: 'bar chart of Q3 revenue.' });
    expect(gemini.calls[0]?.parts).toEqual([...parts]);
    expect(gemini.calls[0]?.opts).toEqual({ model: 'vision-x' });
  });
});
