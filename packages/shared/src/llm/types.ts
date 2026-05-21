export interface GenerateOpts {
  model?: string;
  systemInstruction?: string;
  responseSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

export interface GenerateStreamChunk {
  delta: string;
}

export interface VisionPart {
  inlineData: { data: string; mimeType: string };
}

export type ContentPart = string | VisionPart;

export interface GeminiClient {
  generate(parts: ContentPart[], opts?: GenerateOpts): Promise<GenerateResult>;
  generateStream(parts: ContentPart[], opts?: GenerateOpts): AsyncIterable<GenerateStreamChunk>;
}
