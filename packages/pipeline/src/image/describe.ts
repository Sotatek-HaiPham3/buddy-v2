import type { GeminiClient } from '@buddy/shared';
import { describeImagePrompt } from '../prompts/describe-image.js';
import type { DescribedImage, SavedImage } from './types.js';

interface DescribeImageOpts {
  gemini: GeminiClient;
  image: SavedImage;
  visionModel?: string;
}

export async function describeImage(opts: DescribeImageOpts): Promise<DescribedImage> {
  let caption = '';
  try {
    const result = await opts.gemini.generate(
      [
        describeImagePrompt(),
        {
          inlineData: {
            data: opts.image.bytes.toString('base64'),
            mimeType: opts.image.mime,
          },
        },
      ],
      opts.visionModel ? { model: opts.visionModel } : undefined,
    );
    caption = result.text.trim();
  } catch {
    caption = '';
  }

  return {
    ...opts.image,
    caption,
  };
}
