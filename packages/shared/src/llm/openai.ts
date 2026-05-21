import type {
  ContentPart,
  GeminiClient,
  GenerateOpts,
  GenerateResult,
  GenerateStreamChunk,
} from './types.js';

interface RealOpenAIOpts {
  apiKey: string;
  defaultModel: string;
}

function partsToText(parts: ContentPart[]): string {
  return parts
    .map((p) => {
      if (typeof p === 'string') return p;
      throw new Error('OpenAI fallback currently supports text-only prompts');
    })
    .join('\n');
}

export function createRealOpenAI(opts: RealOpenAIOpts): GeminiClient {
  const generate = async (
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): Promise<GenerateResult> => {
    const model = callOpts?.model ?? opts.defaultModel;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: callOpts?.temperature,
        messages: [
          ...(callOpts?.systemInstruction
            ? [{ role: 'system', content: callOpts.systemInstruction }]
            : []),
          { role: 'user', content: partsToText(parts) },
        ],
        ...(callOpts?.maxOutputTokens !== undefined
          ? { max_completion_tokens: callOpts.maxOutputTokens }
          : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return { text: json.choices?.[0]?.message?.content ?? '' };
  };

  async function* generateStream(
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): AsyncIterable<GenerateStreamChunk> {
    const model = callOpts?.model ?? opts.defaultModel;
    const out = await generate(parts, callOpts);
    if (out.text) yield { delta: out.text };
  }

  return { generate, generateStream };
}
