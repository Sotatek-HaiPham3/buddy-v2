# OpenAI Provider Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenAI as a first-class LLM provider — vision support, real streaming, shared provider factory, and pipeline wiring so `build-index` respects `LLM_PROVIDER`.

**Architecture:** Extend `openai.ts` to translate `VisionPart` → OpenAI `image_url` format and add real SSE streaming. Extract provider-selection logic into a new `shared/src/llm/client.ts` factory (`createLlmClient` + `resolveVisionModel`). Wire both `apps/serve` and `packages/pipeline/src/build.ts` to use the factory. Add `OPENAI_VISION_MODEL` to config.

**Tech Stack:** `fetch` (built-in Node 20), `vitest` + `vi.stubGlobal` for fetch mocking, existing `GeminiClient` interface (unchanged), `zod` config schema.

**Pre-reads for the engineer:**
- Spec: `docs/superpowers/specs/2026-05-21-openai-provider-design.md`
- Existing: `packages/shared/src/llm/openai.ts`, `packages/shared/src/llm/gemini.ts`, `packages/shared/src/config.ts`, `packages/pipeline/src/build.ts`, `packages/pipeline/src/types.ts`, `apps/serve/src/index.ts`
- Test patterns: `packages/shared/test/llm/openai.test.ts`, `packages/shared/test/config.test.ts`

---

## File Structure

```
packages/shared/src/
├── config.ts                  MODIFY — add OPENAI_VISION_MODEL field + openaiVisionModel to Config
├── llm/
│   ├── openai.ts              MODIFY — vision support + real streaming
│   └── client.ts              CREATE — createLlmClient(cfg) + resolveVisionModel(cfg)
└── index.ts                   MODIFY — export createLlmClient, resolveVisionModel

packages/shared/test/
├── config.test.ts             MODIFY — add OPENAI_VISION_MODEL default fallback test
└── llm/
    ├── openai.test.ts         MODIFY — add vision + streaming tests
    └── client.test.ts         CREATE — provider selection tests

packages/pipeline/src/
├── types.ts                   MODIFY — visionModel uses resolveVisionModel(cfg)
└── build.ts                   MODIFY — replace hardcoded createRealGemini with createLlmClient(cfg)

apps/serve/src/
└── index.ts                   MODIFY — replace 18-line IIFE with createLlmClient(cfg)
```

---

## Task 0: Prereqs

- [ ] **Step 1:** Confirm baseline tests pass:

```bash
npx vitest run packages/shared/test
```

Expected: 57 tests pass across 10 files.

- [ ] **Step 2:** Confirm current branch:

```bash
git branch --show-current
```

Expected: `feat/pipeline-multimodal` (or your working branch).

---

## Task 1: Config — add OPENAI_VISION_MODEL

**Files:**
- Modify: `packages/shared/src/config.ts`
- Modify: `packages/shared/test/config.test.ts`

- [ ] **Step 1: Write failing test**

Append to the `describe('config', ...)` block in `packages/shared/test/config.test.ts`:

```ts
  it('openaiVisionModel defaults to openaiModel when OPENAI_VISION_MODEL unset', () => {
    const cfg = loadConfig({ OPENAI_API_KEY: 'k', OPENAI_MODEL: 'gpt-4o' });
    expect(cfg.openaiVisionModel).toBe('gpt-4o');
  });

  it('openaiVisionModel uses OPENAI_VISION_MODEL when set', () => {
    const cfg = loadConfig({ OPENAI_API_KEY: 'k', OPENAI_MODEL: 'gpt-4o-mini', OPENAI_VISION_MODEL: 'gpt-4o' });
    expect(cfg.openaiVisionModel).toBe('gpt-4o');
  });
```

- [ ] **Step 2:** Run: `npx vitest run packages/shared/test/config.test.ts` — expect FAIL (property `openaiVisionModel` does not exist).

- [ ] **Step 3: Implement**

In `packages/shared/src/config.ts`, add to `configSchema`:

```ts
  OPENAI_VISION_MODEL: z.string().optional(),
```

Add to `Config` interface (after `openaiModel: string;`):

```ts
  openaiVisionModel: string;
```

Add to `loadConfig` return object (after `openaiModel: parsed.OPENAI_MODEL,`):

```ts
    openaiVisionModel: parsed.OPENAI_VISION_MODEL ?? parsed.OPENAI_MODEL,
```

- [ ] **Step 4:** Run: `npx vitest run packages/shared/test/config.test.ts` — expect PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config.ts packages/shared/test/config.test.ts
git commit -m "feat(shared): add OPENAI_VISION_MODEL config field"
```

---

## Task 2: openai.ts — vision support

**Files:**
- Modify: `packages/shared/src/llm/openai.ts`
- Modify: `packages/shared/test/llm/openai.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/shared/test/llm/openai.test.ts` inside the existing `describe('createRealOpenAI', ...)` block:

```ts
  it('sends VisionPart as image_url with base64 data URI', async () => {
    let capturedBody: unknown;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'described' } }], usage: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    const result = await client.generate([
      'describe this image',
      { inlineData: { data: 'abc123', mimeType: 'image/png' } },
    ]);

    expect(result.text).toBe('described');
    const messages = (capturedBody as { messages: unknown[] }).messages;
    const userMsg = messages.find((m: unknown) => (m as { role: string }).role === 'user') as {
      content: Array<{ type: string; image_url?: { url: string }; text?: string }>;
    };
    expect(userMsg.content).toHaveLength(2);
    expect(userMsg.content[0]).toEqual({ type: 'text', text: 'describe this image' });
    expect(userMsg.content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,abc123' },
    });
  });

  it('throws on non-2xx response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('bad request', { status: 400 }),
    ) as never;
    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    await expect(client.generate(['hello'])).rejects.toThrow('OpenAI request failed: 400');
  });
```

- [ ] **Step 2:** Run: `npx vitest run packages/shared/test/llm/openai.test.ts` — expect FAIL on the vision test (throws "OpenAI fallback currently supports text-only prompts").

- [ ] **Step 3: Implement**

Replace the entire `packages/shared/src/llm/openai.ts` with:

```ts
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
```

- [ ] **Step 4:** Run: `npx vitest run packages/shared/test/llm/openai.test.ts` — expect PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/llm/openai.ts packages/shared/test/llm/openai.test.ts
git commit -m "feat(shared): openai vision support + real SSE streaming"
```

---

## Task 3: openai.ts — streaming test

**Files:**
- Modify: `packages/shared/test/llm/openai.test.ts`

- [ ] **Step 1: Write failing test**

Append inside the `describe('createRealOpenAI', ...)` block:

```ts
  it('generateStream yields token deltas from SSE response', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: [DONE]',
    ].join('\n') + '\n';

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(sseLines, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    ) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    const chunks: string[] = [];
    for await (const chunk of client.generateStream(['hi'])) {
      chunks.push(chunk.delta);
    }
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('generateStream throws on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    ) as never;
    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-4o' });
    const gen = client.generateStream(['hi']);
    await expect(gen.next()).rejects.toThrow('OpenAI stream failed: 401');
  });
```

- [ ] **Step 2:** Run: `npx vitest run packages/shared/test/llm/openai.test.ts` — expect PASS (6 tests). The implementation from Task 2 already handles this.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/test/llm/openai.test.ts
git commit -m "test(shared): openai streaming tests"
```

---

## Task 4: shared/src/llm/client.ts — provider factory

**Files:**
- Create: `packages/shared/src/llm/client.ts`
- Create: `packages/shared/test/llm/client.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/shared/test/llm/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLlmClient, resolveVisionModel } from '../../src/llm/client.js';
import type { Config } from '../../src/config.js';

function cfg(overrides: Partial<Config>): Config {
  return {
    llmProvider: 'auto',
    geminiModel: 'gemini-2.5-flash-lite',
    geminiVisionModel: 'gemini-2.5-flash-lite',
    openaiModel: 'gpt-4o-mini',
    openaiVisionModel: 'gpt-4o',
    port: 3000,
    dataDir: './data',
    maxConcurrentLlm: 10,
    maxPagesPerNode: 20,
    maxRetries: 3,
    addSummaries: true,
    imagesEnabled: true,
    tablesEnabled: true,
    hierarchicalProcessing: true,
    subgroupTokenSize: 7000,
    maxRetrievalsPerMaster: 3,
    logLevel: 'info',
    ...overrides,
  };
}

describe('createLlmClient', () => {
  it('returns a GeminiClient when LLM_PROVIDER=gemini and key present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'gemini', geminiApiKey: 'gk' }));
    expect(client).toHaveProperty('generate');
    expect(client).toHaveProperty('generateStream');
  });

  it('throws when LLM_PROVIDER=gemini and no GEMINI_API_KEY', () => {
    expect(() => createLlmClient(cfg({ llmProvider: 'gemini' }))).toThrow(
      'GEMINI_API_KEY required when LLM_PROVIDER=gemini',
    );
  });

  it('returns a client when LLM_PROVIDER=openai and key present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'openai', openaiApiKey: 'ok' }));
    expect(client).toHaveProperty('generate');
    expect(client).toHaveProperty('generateStream');
  });

  it('throws when LLM_PROVIDER=openai and no OPENAI_API_KEY', () => {
    expect(() => createLlmClient(cfg({ llmProvider: 'openai' }))).toThrow(
      'OPENAI_API_KEY required when LLM_PROVIDER=openai',
    );
  });

  it('auto: picks gemini when geminiApiKey present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'auto', geminiApiKey: 'gk' }));
    expect(client).toHaveProperty('generate');
  });

  it('auto: picks openai when only openaiApiKey present', () => {
    const client = createLlmClient(cfg({ llmProvider: 'auto', openaiApiKey: 'ok' }));
    expect(client).toHaveProperty('generate');
  });

  it('auto: throws when neither key present', () => {
    expect(() => createLlmClient(cfg({ llmProvider: 'auto' }))).toThrow(
      'No LLM key configured',
    );
  });
});

describe('resolveVisionModel', () => {
  it('returns geminiVisionModel when provider=gemini', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'gemini', geminiApiKey: 'gk' }))).toBe(
      'gemini-2.5-flash-lite',
    );
  });

  it('returns openaiVisionModel when provider=openai', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'openai', openaiApiKey: 'ok' }))).toBe('gpt-4o');
  });

  it('auto with geminiApiKey returns geminiVisionModel', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'auto', geminiApiKey: 'gk' }))).toBe(
      'gemini-2.5-flash-lite',
    );
  });

  it('auto with only openaiApiKey returns openaiVisionModel', () => {
    expect(resolveVisionModel(cfg({ llmProvider: 'auto', openaiApiKey: 'ok' }))).toBe('gpt-4o');
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run packages/shared/test/llm/client.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

Create `packages/shared/src/llm/client.ts`:

```ts
import type { Config } from '../config.js';
import type { GeminiClient } from './types.js';
import { createRealGemini } from './gemini.js';
import { createRealOpenAI } from './openai.js';

function resolvedProvider(cfg: Config): 'gemini' | 'openai' {
  if (cfg.llmProvider !== 'auto') return cfg.llmProvider;
  if (cfg.geminiApiKey) return 'gemini';
  if (cfg.openaiApiKey) return 'openai';
  return 'gemini'; // will throw below when key is missing
}

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
  if (cfg.geminiApiKey) {
    return createRealGemini({ apiKey: cfg.geminiApiKey, defaultModel: cfg.geminiModel });
  }
  if (cfg.openaiApiKey) {
    return createRealOpenAI({ apiKey: cfg.openaiApiKey, defaultModel: cfg.openaiModel });
  }
  throw new Error('No LLM key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.');
}

export function resolveVisionModel(cfg: Config): string {
  const provider = resolvedProvider(cfg);
  return provider === 'openai' ? cfg.openaiVisionModel : cfg.geminiVisionModel;
}
```

- [ ] **Step 4:** Run: `npx vitest run packages/shared/test/llm/client.test.ts` — expect PASS (11 tests).

- [ ] **Step 5: Export from index**

In `packages/shared/src/index.ts`, add after the existing llm exports:

```ts
export { createLlmClient, resolveVisionModel } from './llm/client.js';
```

- [ ] **Step 6:** Run: `npx vitest run packages/shared/test` — expect all 68 tests pass (57 existing + 11 new).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/llm/client.ts packages/shared/src/index.ts packages/shared/test/llm/client.test.ts
git commit -m "feat(shared): createLlmClient + resolveVisionModel provider factory"
```

---

## Task 5: Wire pipeline/src/types.ts

**Files:**
- Modify: `packages/pipeline/src/types.ts`

No new test needed — `buildOptsFromConfig` is exercised by all existing pipeline tests.

- [ ] **Step 1: Implement**

In `packages/pipeline/src/types.ts`, update the import line at the top:

```ts
import type { GeminiClient, LlmPool, Logger, Config, resolveVisionModel } from '@buddy/shared';
```

Wait — `resolveVisionModel` is a function, not a type. Use a value import:

```ts
import { resolveVisionModel, type GeminiClient, type LlmPool, type Logger, type Config } from '@buddy/shared';
```

Then in `buildOptsFromConfig`, replace:

```ts
    visionModel: cfg.geminiVisionModel,
```

with:

```ts
    visionModel: resolveVisionModel(cfg),
```

- [ ] **Step 2:** Run: `npx vitest run packages/pipeline/test` — expect all existing pipeline tests still pass.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/types.ts
git commit -m "feat(pipeline): visionModel resolves from active provider"
```

---

## Task 6: Wire pipeline/src/build.ts

**Files:**
- Modify: `packages/pipeline/src/build.ts`

- [ ] **Step 1: Implement**

In `packages/pipeline/src/build.ts`, update the import to add `createLlmClient`:

```ts
import {
  createLlmClient, createLlmPool, createLogger, docId as makeDocId, runId as makeRunId,
  resolveDocCacheDir, resolveDocTreePath, resolveIndexDir, resolveLogsDir,
  resolveDocImagesDir, resolveDocTablesDir,
  type Config, type DocOutput, type GeminiClient, type LlmPool, type Logger,
} from '@buddy/shared';
```

Replace the `gemini` resolution block (lines 40–47):

```ts
  const gemini = args.gemini ?? createLlmClient(args.cfg);
```

- [ ] **Step 2:** Run: `npx vitest run packages/pipeline/test` — expect all existing pipeline tests still pass.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/build.ts
git commit -m "feat(pipeline): build-index respects LLM_PROVIDER via createLlmClient"
```

---

## Task 7: Wire apps/serve/src/index.ts

**Files:**
- Modify: `apps/serve/src/index.ts`

- [ ] **Step 1: Implement**

In `apps/serve/src/index.ts`, update the import line:

```ts
import { createLogger, createLlmClient, loadConfig, type Config } from '@buddy/shared';
```

Replace the `llmClient` IIFE (lines 23–41) with:

```ts
  const llmClient = createLlmClient(cfg);
```

- [ ] **Step 2:** Typecheck:

```bash
npx tsc --noEmit -p apps/serve/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/serve/src/index.ts
git commit -m "refactor(serve): replace provider IIFE with createLlmClient"
```

---

## Task 8: Final verification

- [ ] **Step 1: All tests**

```bash
npx vitest run
```

Expected: all packages green. Shared: 68 tests. Pipeline: existing count unchanged.

- [ ] **Step 2: Typecheck all packages**

```bash
npx tsc --noEmit -p packages/shared/tsconfig.json
npx tsc --noEmit -p packages/pipeline/tsconfig.json
npx tsc --noEmit -p apps/serve/tsconfig.json
```

Expected: no errors in any package.

- [ ] **Step 3: Build shared**

```bash
pnpm --filter @buddy/shared build
```

Expected: `dist/` emits cleanly, no type errors.

- [ ] **Step 4: Update memory**

Add a status line to `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md`:

```
- 2026-05-21: OpenAI provider plan complete. openai.ts has vision (image_url) + real SSE streaming. createLlmClient + resolveVisionModel in shared/llm/client.ts. build-index and serve both use factory. OPENAI_VISION_MODEL added to config.
```

- [ ] **Step 5: Commit plan**

```bash
git add docs/superpowers/plans/2026-05-21-openai-provider.md
git commit -m "chore(plan): openai provider implementation plan"
```

---

## Self-Review Notes

- **Spec §4.2 (Config):** Task 1 covers `OPENAI_VISION_MODEL` + `openaiVisionModel`. ✅
- **Spec §4.3 (resolveVisionModel):** Task 4 implements it in `client.ts`. ✅
- **Spec §4.4 (createLlmClient):** Task 4 implements all 5 branches (gemini, openai, auto×3). ✅
- **Spec §4.5 (openai.ts vision + streaming):** Tasks 2 + 3 cover `partsToContent` + SSE streaming. ✅
- **Spec §4.6 (build.ts):** Task 6. ✅
- **Spec §4.7 (types.ts visionModel):** Task 5. ✅
- **Spec §5 (error handling):** All throw messages match spec exactly. ✅
- **Spec §6 (testing):** `openai.test.ts` (vision + streaming), `client.test.ts` (all 5 provider branches), `config.test.ts` (vision model default). ✅
- **Type consistency:** `resolveVisionModel` defined in Task 4 (`client.ts`), imported in Task 5 (`types.ts`). `createLlmClient` defined in Task 4, imported in Tasks 6 + 7. No name drift. ✅
- **No placeholders detected.** ✅
