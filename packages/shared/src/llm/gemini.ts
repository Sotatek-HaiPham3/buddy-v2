import { GoogleGenerativeAI, type Part } from '@google/generative-ai';
import type {
  ContentPart,
  GeminiClient,
  GenerateOpts,
  GenerateResult,
  GenerateStreamChunk,
} from './types.js';

interface RealGeminiOpts {
  apiKey: string;
  defaultModel: string;
  sdkFactory?: (apiKey: string) => GoogleGenerativeAI;
}

function toSdkParts(parts: ContentPart[]): Part[] {
  return parts.map((p) =>
    typeof p === 'string'
      ? { text: p }
      : { inlineData: { data: p.inlineData.data, mimeType: p.inlineData.mimeType } },
  );
}

export function createRealGemini(opts: RealGeminiOpts): GeminiClient {
  const sdk = (opts.sdkFactory ?? ((apiKey: string) => new GoogleGenerativeAI(apiKey)))(opts.apiKey);

  const getModel = (callOpts?: GenerateOpts) => {
    const modelName = callOpts?.model ?? opts.defaultModel;
    const sdkOpts: Parameters<typeof sdk.getGenerativeModel>[0] = {
      model: modelName,
    };
    if (callOpts?.systemInstruction) sdkOpts.systemInstruction = callOpts.systemInstruction;
    if (callOpts?.responseSchema) {
      sdkOpts.generationConfig = {
        responseMimeType: 'application/json',
        responseSchema: callOpts.responseSchema as never,
      };
    }
    if (callOpts?.temperature !== undefined || callOpts?.maxOutputTokens !== undefined) {
      sdkOpts.generationConfig = {
        ...(sdkOpts.generationConfig ?? {}),
        ...(callOpts.temperature !== undefined ? { temperature: callOpts.temperature } : {}),
        ...(callOpts.maxOutputTokens !== undefined
          ? { maxOutputTokens: callOpts.maxOutputTokens }
          : {}),
      };
    }
    return sdk.getGenerativeModel(sdkOpts);
  };

  const generate = async (
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): Promise<GenerateResult> => {
    const model = getModel(callOpts);
    const r = await model.generateContent({
      contents: [{ role: 'user', parts: toSdkParts(parts) }],
    });
    const text = r.response.text();
    const usage = r.response.usageMetadata;
    return {
      text,
      ...(usage?.promptTokenCount !== undefined ? { promptTokens: usage.promptTokenCount } : {}),
      ...(usage?.candidatesTokenCount !== undefined
        ? { outputTokens: usage.candidatesTokenCount }
        : {}),
      ...(usage?.cachedContentTokenCount !== undefined
        ? { cachedTokens: usage.cachedContentTokenCount }
        : {}),
    };
  };

  async function* generateStream(
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): AsyncIterable<GenerateStreamChunk> {
    const model = getModel(callOpts);
    const r = await model.generateContentStream({
      contents: [{ role: 'user', parts: toSdkParts(parts) }],
    });
    for await (const chunk of r.stream) {
      const text = chunk.text();
      if (text) yield { delta: text };
    }
  }

  return { generate, generateStream };
}
