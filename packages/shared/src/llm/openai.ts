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

type OaiContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function partsToContent(parts: ContentPart[]): OaiContent[] {
  return parts.map((p) =>
    typeof p === 'string'
      ? { type: 'text' as const, text: p }
      : {
          type: 'image_url' as const,
          image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
        },
  );
}

function buildMessages(parts: ContentPart[], callOpts?: GenerateOpts) {
  return [
    ...(callOpts?.systemInstruction
      ? [{ role: 'system', content: callOpts.systemInstruction }]
      : []),
    { role: 'user', content: partsToContent(parts) },
  ];
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
        messages: buildMessages(parts, callOpts),
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
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    const usage = json.usage;
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      ...(usage?.prompt_tokens !== undefined ? { promptTokens: usage.prompt_tokens } : {}),
      ...(usage?.completion_tokens !== undefined ? { outputTokens: usage.completion_tokens } : {}),
      ...(usage?.prompt_tokens_details?.cached_tokens !== undefined
        ? { cachedTokens: usage.prompt_tokens_details.cached_tokens }
        : {}),
    };
  };

  async function* generateStream(
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): AsyncIterable<GenerateStreamChunk> {
    const model = callOpts?.model ?? opts.defaultModel;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: buildMessages(parts, callOpts),
        ...(callOpts?.maxOutputTokens !== undefined
          ? { max_completion_tokens: callOpts.maxOutputTokens }
          : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI stream failed: ${response.status} ${await response.text()}`);
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
        } catch {
          // skip malformed SSE chunk
        }
      }
    }
  }

  return { generate, generateStream };
}
