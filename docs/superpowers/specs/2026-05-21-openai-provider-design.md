# OpenAI Provider Support — Design Spec

**Date:** 2026-05-21
**Status:** Approved (pending implementation plan)
**Branch:** feat/pipeline-multimodal (or new branch off main)

## 1. Goal

Add OpenAI as a fully supported LLM provider alongside Gemini. The `serve` app already has partial OpenAI support (text-only, provider selection). This spec completes it:

- Full vision support in `openai.ts` (image detection + description in the pipeline)
- Separate `OPENAI_VISION_MODEL` env var mirroring `GEMINI_VISION_MODEL`
- Shared `createLlmClient(cfg)` factory eliminating duplicated provider-selection logic
- `build-index` CLI respects `LLM_PROVIDER` (currently hardcodes Gemini)

## 2. Current State

| Location | Status |
|----------|--------|
| `shared/src/llm/openai.ts` | Exists. Text-only. Throws on `VisionPart`. `generateStream` yields full text as one chunk (no real streaming). |
| `shared/src/config.ts` | Has `LLM_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`. Missing `OPENAI_VISION_MODEL`. |
| `apps/serve/src/index.ts` | Full provider selection (auto/gemini/openai). Uses `createRealOpenAI` for text. |
| `packages/pipeline/src/build.ts` | Hardcodes `createRealGemini`. Ignores `llmProvider`. |
| `packages/pipeline/src/types.ts` | `visionModel` hardcoded to `cfg.geminiVisionModel`. |

## 3. Constraints & Decisions

| Area | Decision |
|------|----------|
| Vision format | OpenAI uses `image_url` with `data:<mime>;base64,<data>` URI. Gemini uses `inlineData`. Both map from the same `VisionPart` type — translation is internal to each provider. |
| Streaming | Add real token streaming to `openai.ts` via `stream: true` + SSE line parsing. Current single-chunk yield is a UX regression for chat. |
| Vision model | Add `OPENAI_VISION_MODEL` (defaults to `OPENAI_MODEL` if unset). Mirrors `GEMINI_VISION_MODEL` pattern. |
| Provider factory | Extract into `shared/src/llm/client.ts`. Both `serve` and `build-index` call `createLlmClient(cfg)`. |
| `GeminiClient` interface | Unchanged. OpenAI implements the same interface. No rename. |
| `auto` resolution | Gemini preferred when both keys present. Consistent with existing `serve` behavior. |

## 4. Architecture

### 4.1 Files Changed

```
packages/shared/src/
├── config.ts                  # ADD: OPENAI_VISION_MODEL, openaiVisionModel, resolveVisionModel helper
├── llm/
│   ├── openai.ts              # MODIFY: vision support + real streaming
│   ├── client.ts              # NEW: createLlmClient(cfg) + resolveVisionModel(cfg)
│   └── types.ts               # unchanged
└── index.ts                   # EXPORT: createLlmClient, resolveVisionModel

packages/pipeline/src/
├── build.ts                   # MODIFY: replace createRealGemini block with createLlmClient(cfg)
└── types.ts                   # MODIFY: visionModel uses resolveVisionModel(cfg)

apps/serve/src/
└── index.ts                   # MODIFY: replace 18-line IIFE with createLlmClient(cfg)
```

### 4.2 Config Changes

```
# .env additions
OPENAI_VISION_MODEL=gpt-4o    # optional; defaults to OPENAI_MODEL if unset
```

`configSchema`:
```ts
OPENAI_VISION_MODEL: z.string().optional()
```

`Config` interface:
```ts
openaiVisionModel: string;    // resolved: OPENAI_VISION_MODEL ?? OPENAI_MODEL
```

`loadConfig` resolution:
```ts
openaiVisionModel: parsed.OPENAI_VISION_MODEL ?? parsed.OPENAI_MODEL,
```

### 4.3 `resolveVisionModel(cfg)`

```ts
export function resolveVisionModel(cfg: Config): string {
  const provider = cfg.llmProvider === 'auto'
    ? (cfg.geminiApiKey ? 'gemini' : 'openai')
    : cfg.llmProvider;
  return provider === 'openai' ? cfg.openaiVisionModel : cfg.geminiVisionModel;
}
```

Lives in `shared/src/llm/client.ts` alongside `createLlmClient`.

### 4.4 `createLlmClient(cfg)`

```ts
export function createLlmClient(cfg: Config): GeminiClient {
  if (cfg.llmProvider === 'gemini') {
    if (!cfg.geminiApiKey) throw new Error('GEMINI_API_KEY required when LLM_PROVIDER=gemini');
    return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
  }
  if (cfg.llmProvider === 'openai') {
    if (!cfg.openaiApiKey) throw new Error('OPENAI_API_KEY required when LLM_PROVIDER=openai');
    return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
  }
  // auto
  if (cfg.geminiApiKey) return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
  if (cfg.openaiApiKey) return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
  throw new Error('No LLM key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.');
}
```

### 4.5 `openai.ts` — Vision + Streaming

**Vision:** Replace `partsToText` with `partsToContent` returning an OpenAI content array:

```ts
type OaiContent = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

function partsToContent(parts: ContentPart[]): OaiContent[] {
  return parts.map((p) =>
    typeof p === 'string'
      ? { type: 'text', text: p }
      : { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }
  );
}
```

The `messages` array in `generate` changes from `{ role: 'user', content: partsToText(parts) }` to `{ role: 'user', content: partsToContent(parts) }`.

**Streaming:** `generateStream` uses `stream: true` and reads the SSE response:

```ts
async function* generateStream(parts, callOpts) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true, messages: [...] }),
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';   // keep incomplete last line for next read
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
      } catch { /* skip malformed */ }
    }
  }
}
```

### 4.6 `build.ts` Changes

Replace:
```ts
const gemini = args.gemini ?? (() => {
  if (!args.cfg.geminiApiKey) throw new Error('GEMINI_API_KEY is required for pipeline builds');
  return createRealGemini({ apiKey: args.cfg.geminiApiKey, defaultModel: args.cfg.geminiModel });
})();
```

With:
```ts
const gemini = args.gemini ?? createLlmClient(args.cfg);
```

### 4.7 `pipeline/src/types.ts` Changes

`buildOptsFromConfig` replaces:
```ts
visionModel: cfg.geminiVisionModel,
```
With:
```ts
visionModel: resolveVisionModel(cfg),
```

## 5. Error Handling

| Failure | Behavior |
|---------|----------|
| `LLM_PROVIDER=gemini` + no `GEMINI_API_KEY` | Throws at startup with clear message |
| `LLM_PROVIDER=openai` + no `OPENAI_API_KEY` | Throws at startup with clear message |
| `LLM_PROVIDER=auto` + no keys | Throws at startup |
| OpenAI non-2xx response | Throws `Error('OpenAI request failed: <status> <body>')` — caught by `withRetry` |
| Malformed SSE chunk in stream | Silently skipped; stream continues |

## 6. Testing

```
packages/shared/test/
├── llm/
│   ├── openai.test.ts         # vision part translation, streaming chunks, error cases
│   └── client.test.ts         # createLlmClient provider selection (all 5 branches)
└── config.test.ts             # OPENAI_VISION_MODEL default fallback
```

- `openai.test.ts`: stub `fetch` via `vi.stubGlobal`. Assert `partsToContent` maps `VisionPart` to correct `image_url` format. Assert streaming yields multiple chunks. Assert non-2xx throws.
- `client.test.ts`: inject mock `createRealGemini`/`createRealOpenAI` factories; assert correct factory called for each `llmProvider` value and key combination.
- `config.test.ts`: assert `openaiVisionModel` defaults to `openaiModel` when `OPENAI_VISION_MODEL` unset.
- Existing pipeline + query tests unaffected (all use `createStubGemini`).

## 7. Out of Scope

- Renaming `GeminiClient` → `LlmClient` (no churn for two providers)
- Anthropic / other providers
- OpenAI context caching (Gemini-specific feature; OpenAI prompt caching is automatic)
- Structured output via `response_format` for OpenAI (pipeline uses JSON-in-text + `parseJson` helper; works as-is)
