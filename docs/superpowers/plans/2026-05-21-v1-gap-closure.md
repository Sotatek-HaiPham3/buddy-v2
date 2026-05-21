# v1 Gap Closure (Caching + Sqlite Binding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two known v1 gaps after plans 1–5:
- **A. LLM prompt caching** (spec §5.5) for both Gemini and OpenAI providers — best-effort, observable via telemetry.
- **B. better-sqlite3 native binding** unblocked under pnpm `approve-builds` policy, so all server tests (currently 2/7) run.

**Architecture (caching):**
- Both providers already do *implicit* prompt caching when the prompt prefix is identical across calls (Gemini 2.5 family: implicit caching enabled by default on paid tier; OpenAI: automatic caching for prompts ≥ 1024 tokens). No explicit cache-create API call needed.
- This plan **does not** use Gemini's explicit `cachedContent` API (the `tryCreateContextCache` helper in `@buddy/shared/llm/cache.ts` stays unused for now — flash-lite eligibility is uncertain and per-turn cache create+delete adds latency that often exceeds the savings).
- Instead: (1) audit prompts so the *stable* parts (tree contents, retrieved sections) precede the *variable* parts (user query, history); (2) surface `cached_tokens` telemetry from both provider responses so we can verify caching actually fires; (3) log it.
- Provider-agnostic via `GenerateResult.cachedTokens?: number`.

**Architecture (sqlite):** pin `better-sqlite3` in root `package.json` `pnpm.onlyBuiltDependencies` so install always builds the native binding. Verify server test suite goes 2/7 → 7/7.

**Tech Stack:** existing — `@google/generative-ai` SDK (Gemini), raw `fetch` (OpenAI), `better-sqlite3`, vitest. No new deps.

**Pre-reads:**
- Spec: `docs/superpowers/specs/2026-05-21-buddy-design.md` §5.5 (Caching).
- Memory: `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` Status block — confirms both gaps still open.
- Existing code:
  - `packages/shared/src/llm/types.ts` — `GenerateResult` interface (add field here).
  - `packages/shared/src/llm/gemini.ts` — real client (read `r.response.usageMetadata`).
  - `packages/shared/src/llm/openai.ts` — fetch wrapper (read `usage.prompt_tokens_details`).
  - `packages/query/src/prompts/{doc-selector,tree-reasoner,answer}.ts` — check for stable-prefix violations.
  - `packages/server/package.json` — confirm `better-sqlite3` dep.
- External reference (read before Task 2):
  - Gemini implicit caching: prompts cache when the *prefix* is identical across requests within the cache window (~few minutes). Variable suffix should be the query + history. The model field `usageMetadata.cachedContentTokenCount` reports cache hits.
  - OpenAI prompt caching: identical prefix ≥ 1024 tokens caches automatically. Response field `usage.prompt_tokens_details.cached_tokens` reports cache hits.

**Out of scope** (defer):
- Explicit Gemini `cachedContent` API (the existing `cache.ts` helper). Revisit if telemetry shows implicit caching is not firing.
- Cross-conversation cache sharing.
- LLM cost tracking dashboard (telemetry only goes to log).
- Browser E2E (separate session).

---

## File Structure

```
packages/shared/src/
├── llm/
│   ├── types.ts        # MODIFY: GenerateResult.cachedTokens?: number
│   ├── gemini.ts       # MODIFY: surface usageMetadata.cachedContentTokenCount
│   └── openai.ts       # MODIFY: surface usage.prompt_tokens_details.cached_tokens

packages/query/src/
├── prompts/
│   ├── doc-selector.ts # AUDIT: stable prefix (doc list) before variable suffix (query)
│   ├── tree-reasoner.ts# AUDIT: trees before query
│   └── answer.ts       # AUDIT: retrieved sections before history + query
├── doc-selector.ts     # MODIFY: log cachedTokens
├── tree-reasoner.ts    # MODIFY: log cachedTokens
└── answer-generator.ts # MODIFY: log cachedTokens (sum over streaming if available)

packages/shared/test/llm/
├── gemini.test.ts      # MODIFY/ADD: cachedTokens parsed
└── openai.test.ts      # MODIFY/ADD: cachedTokens parsed

packages/query/test/
├── doc-selector.test.ts# ADD: prompt-shape assertion (query is last segment)
├── tree-reasoner.test.ts# ADD: same
└── answer.test.ts      # MODIFY: same

(root) package.json     # MODIFY: pnpm.onlyBuiltDependencies = ["better-sqlite3"]
```

---

## Task 0: Prereqs

- [ ] **Step 1:** Confirm all 5 plans shipped, working tree clean:

```bash
cd E:/dev-space/AI/buddy-v2
git status
git log --oneline | head -10
pnpm -r typecheck
```

Expected: clean tree, plan 5 commits at top, typecheck clean.

- [ ] **Step 2:** Snapshot current test counts:

```bash
pnpm -r test 2>&1 | grep -E "Tests|passed|failed"
```

Record total. After Task 5 we re-snapshot and confirm server tests went 2/7 → 7/7.

- [ ] **Step 3:** Read spec §5.5 + the two external reference notes in this plan's header.

---

## Task 1: Pin better-sqlite3 in pnpm onlyBuiltDependencies

**Files:**
- Modify: `package.json` (repo root)

**Why first:** unlocks server test suite. Failing tests would otherwise mask any regression introduced by Task 2–4.

- [ ] **Step 1: Edit root `package.json`**

Add (or merge into existing `pnpm` block):

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3"]
  }
}
```

If a `pnpm` block already exists, merge — do not overwrite.

- [ ] **Step 2: Reinstall to trigger build**

```bash
pnpm install
```

Expected: log shows `better-sqlite3` postinstall ran. No "ignored build script" warning for it.

- [ ] **Step 3: Run server tests**

```bash
pnpm -F @buddy/server test
```

Expected: 7/7 pass (previously 2/7).

  **If still failing:** the native build itself errored. Inspect output. Common Windows fix:
  - install Visual Studio Build Tools + Python (`pnpm install --reporter=ndjson` shows the gyp log)
  - or run `pnpm rebuild better-sqlite3` after install.
  Document the workaround in the final memory entry — do not commit any code change to bypass.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(repo): pin better-sqlite3 in onlyBuiltDependencies"
```

---

## Task 2: Extend `GenerateResult` with `cachedTokens`

**Files:**
- Modify: `packages/shared/src/llm/types.ts`

- [ ] **Step 1: Edit**

```ts
export interface GenerateResult {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;   // tokens served from provider-side prompt cache (best-effort, 0 or undefined on miss)
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -F @buddy/shared typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/llm/types.ts
git commit -m "feat(shared): add cachedTokens to GenerateResult"
```

---

## Task 3: Surface `cachedTokens` from Gemini client

**Files:**
- Modify: `packages/shared/src/llm/gemini.ts`
- Test: `packages/shared/test/llm/gemini.test.ts` (locate existing file or create)

**Where the number comes from:** Gemini API response includes `usageMetadata.cachedContentTokenCount` when implicit caching fires. The SDK already deserializes it onto `r.response.usageMetadata`.

- [ ] **Step 1: Failing test**

Locate the existing test file under `packages/shared/test/`. If none touches the real-client mapping, add one — otherwise add an `it()` block.

```ts
import { describe, it, expect, vi } from 'vitest';
import { createRealGemini } from '../../src/llm/gemini.js';

describe('createRealGemini → cachedTokens', () => {
  it('passes through usageMetadata.cachedContentTokenCount when present', async () => {
    // Patch the SDK module on require — keep the test simple by faking the model.
    const fakeModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => 'ok',
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 5,
            cachedContentTokenCount: 80,
          },
        },
      }),
    };
    const client = createRealGemini({ apiKey: 'fake', defaultModel: 'm' });
    // Inject the model by spying — easiest: extract `getModel` factory or do prototype patch.
    // If the closure cannot be reached, refactor `createRealGemini` to accept an optional `sdkFactory`
    // override for tests, then assert via that injection.
    (client as any).__setModel = (m: typeof fakeModel) => { (client as any).__model = m; };
    // SKIP if refactor undesired — instead, add a thin integration-style test that records the SDK call.
    // Either way, the assertion is the same:
    // expect(result.cachedTokens).toBe(80);
  });
});
```

  **Note to engineer:** the existing `createRealGemini` closes over the SDK and doesn't expose a seam. Two acceptable patterns:
  1. Refactor: accept `sdkFactory?: (apiKey: string) => GoogleGenerativeAI` parameter (default = real). Tests pass a fake.
  2. Or: skip the unit test for the real client and rely on Task 7's end-to-end smoke. Document why in the commit message.

  Prefer (1) — it's a 5-line change and makes future LLM-vendor tests cheap. Test then:

```ts
const sdkFactory = () => ({
  getGenerativeModel: () => ({
    generateContent: vi.fn().mockResolvedValue({
      response: {
        text: () => 'ok',
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 5, cachedContentTokenCount: 80 },
      },
    }),
  }),
} as never);

const client = createRealGemini({ apiKey: 'x', defaultModel: 'm', sdkFactory });
const r = await client.generate(['hi']);
expect(r.cachedTokens).toBe(80);
expect(r.promptTokens).toBe(100);
```

- [ ] **Step 2:** Run test — expect FAIL.

- [ ] **Step 3: Implement**

In `createRealGemini`:

```ts
// Add to opts:
interface RealGeminiOpts {
  apiKey: string;
  defaultModel: string;
  sdkFactory?: (apiKey: string) => GoogleGenerativeAI;
}

// Replace SDK instantiation:
const sdk = (opts.sdkFactory ?? ((k) => new GoogleGenerativeAI(k)))(opts.apiKey);
```

And in `generate`:

```ts
const usage = r.response.usageMetadata as
  | { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }
  | undefined;
return {
  text,
  ...(usage?.promptTokenCount !== undefined ? { promptTokens: usage.promptTokenCount } : {}),
  ...(usage?.candidatesTokenCount !== undefined ? { outputTokens: usage.candidatesTokenCount } : {}),
  ...(usage?.cachedContentTokenCount !== undefined ? { cachedTokens: usage.cachedContentTokenCount } : {}),
};
```

- [ ] **Step 4:** Run test — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/llm/gemini.ts packages/shared/test/llm/gemini.test.ts
git commit -m "feat(shared): surface gemini cachedContentTokenCount as cachedTokens"
```

---

## Task 4: Surface `cachedTokens` from OpenAI client

**Files:**
- Modify: `packages/shared/src/llm/openai.ts`
- Test: `packages/shared/test/llm/openai.test.ts` (locate or add)

**Where the number comes from:** OpenAI Chat Completions response includes `usage.prompt_tokens_details.cached_tokens` since 2024-10. Older models report 0.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRealOpenAI } from '../../src/llm/openai.js';

const originalFetch = globalThis.fetch;

describe('createRealOpenAI → cachedTokens', () => {
  beforeEach(() => { /* noop */ });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('parses cached_tokens from usage.prompt_tokens_details', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 10,
          prompt_tokens_details: { cached_tokens: 1024 },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as never;

    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'gpt-5.4-nano' });
    const r = await client.generate(['hello']);
    expect(r.text).toBe('ok');
    expect(r.cachedTokens).toBe(1024);
    expect(r.promptTokens).toBe(1200);
  });

  it('omits cachedTokens when API does not return it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 50, completion_tokens: 5 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ) as never;
    const client = createRealOpenAI({ apiKey: 'x', defaultModel: 'm' });
    const r = await client.generate(['hi']);
    expect(r.cachedTokens).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

In `openai.ts` `generate`, replace the return with:

```ts
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
```

- [ ] **Step 4:** Run — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/llm/openai.ts packages/shared/test/llm/openai.test.ts
git commit -m "feat(shared): surface openai cached_tokens as cachedTokens"
```

---

## Task 5: Audit + lock stable-prefix prompt shape

**Files:**
- Modify (if needed): `packages/query/src/prompts/doc-selector.ts`
- Modify (if needed): `packages/query/src/prompts/tree-reasoner.ts`
- Modify (if needed): `packages/query/src/prompts/answer.ts`
- Test: `packages/query/test/prompts.shape.test.ts` (new)

**Rule:** the user *query* (the only thing that varies turn-to-turn for the same conversation) must be the *suffix* of the prompt, not the prefix or middle. Same for the *history summary* — it changes turn-to-turn too. Stable parts (tree dump, retrieved sections, instructions) go first.

**Why:** both providers cache by prefix match. Stable prefix = cache hit. Today's prompts mostly already do this, but lock it with tests so future edits cannot regress.

- [ ] **Step 1: Failing tests**

Create `packages/query/test/prompts.shape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { docSelectorPrompt } from '../src/prompts/doc-selector.js';
import { treeReasonerPrompt } from '../src/prompts/tree-reasoner.js';
import { answerPrompt } from '../src/prompts/answer.js';
import type { DocOutput } from '@buddy/shared';
import type { RetrievedNode } from '../src/types.js';

const docs: DocOutput[] = [{
  doc_id: 'd1', doc_name: 'a.pdf', doc_description: 'about a',
  structure: [{ title: 'ch1', start_index: 1, end_index: 1, node_id: 'n1', nodes: [], images: [], tables: [] }],
}];

describe('prompt shape (cache-friendly)', () => {
  it('doc-selector: query appears AFTER doc list', () => {
    const p = docSelectorPrompt(docs, 'MY_UNIQUE_QUERY_TOKEN', '');
    const docIdx = p.indexOf('doc_id: d1');
    const queryIdx = p.indexOf('MY_UNIQUE_QUERY_TOKEN');
    expect(docIdx).toBeGreaterThanOrEqual(0);
    expect(queryIdx).toBeGreaterThan(docIdx);
  });

  it('doc-selector: prefix is identical when only query changes', () => {
    const a = docSelectorPrompt(docs, 'q1', '');
    const b = docSelectorPrompt(docs, 'q2', '');
    const minLen = Math.min(a.length, b.length);
    let common = 0;
    while (common < minLen && a[common] === b[common]) common++;
    expect(common).toBeGreaterThan(100);   // substantial shared prefix
  });

  it('tree-reasoner: query appears AFTER tree dump', () => {
    const p = treeReasonerPrompt(docs, 'MY_QUERY_TOKEN', '');
    expect(p.indexOf('doc_id: d1')).toBeLessThan(p.indexOf('MY_QUERY_TOKEN'));
  });

  it('answer: retrieved sections appear BEFORE query', () => {
    const retrieved: RetrievedNode[] = [{
      doc_id: 'd1', doc_name: 'a.pdf', node_id: 'n1', title: 't',
      page_range: [1, 1], text: 'SECTION_BODY_TOKEN', image_captions: [], tables: [],
    }];
    const p = answerPrompt('MY_QUERY_TOKEN', retrieved, []);
    expect(p.indexOf('SECTION_BODY_TOKEN')).toBeLessThan(p.indexOf('MY_QUERY_TOKEN'));
  });
});
```

- [ ] **Step 2:** Run — most should already PASS (current prompts roughly do this). For any test that FAILS, edit the corresponding prompt: move stable content (doc list / tree / sections / instructions) to the top, query + history to the bottom. Keep wording intact.

  **Inspect first.** If all 4 pass, no prompt edits needed — proceed to Step 4. If any fail, fix the prompt minimally (move ordering only; don't rephrase instructions).

- [ ] **Step 3:** Re-run after any edit — expect all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/query/test/prompts.shape.test.ts \
        packages/query/src/prompts/   # only if any prompt edited
git commit -m "test(query): lock cache-friendly prompt shape (stable prefix, variable suffix)"
```

---

## Task 6: Log `cachedTokens` per LLM call

**Files:**
- Modify: `packages/query/src/doc-selector.ts`
- Modify: `packages/query/src/tree-reasoner.ts`
- Modify: `packages/query/src/answer-generator.ts`

**Note:** these three modules currently do not have a logger passed in. Add an optional `logger?: Logger` field to each opts type and log at `debug` level. Caller (`@buddy/query/index.ts → answer()`) is invoked from the server, which already has a logger via `ctx`. Plumb it through.

  Inspect call-sites first:
  - `packages/query/src/index.ts → answer()` — its `AnswerOpts` may already have a logger; check.
  - If not, add `logger?: Logger` to `AnswerOpts` and forward to each downstream call. The server already constructs a logger; pass it.

- [ ] **Step 1: Failing test**

In `packages/query/test/doc-selector.test.ts` add:

```ts
it('logs cachedTokens when present in result', async () => {
  const logs: { msg: string; obj: unknown }[] = [];
  const fakeLogger = {
    debug: (obj: unknown, msg: string) => logs.push({ msg, obj }),
    info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, trace: () => {},
    child: () => fakeLogger,
  } as never;

  const gemini = { generate: async () => ({
    text: JSON.stringify({ reasoning: 'r', doc_ids: ['d1'] }),
    cachedTokens: 512,
    promptTokens: 800,
  }), generateStream: async function* () { /* unused */ } } as never;

  await selectDocs({ gemini, docs: testDocs, query: 'q', historySummary: '', logger: fakeLogger });
  expect(logs.some((l) => /cachedTokens|cache/i.test(l.msg))).toBe(true);
});
```

(Mirror similar tests in tree-reasoner.test.ts and answer-generator.test.ts.)

- [ ] **Step 2:** Run — expect FAIL.

- [ ] **Step 3: Implement**

Pattern per module (example for `doc-selector.ts`):

```ts
import type { Logger } from '@buddy/shared';

export interface SelectDocsOpts {
  gemini: GeminiClient;
  docs: DocOutput[];
  query: string;
  historySummary: string;
  logger?: Logger;
}

export async function selectDocs(opts: SelectDocsOpts): Promise<DocSelection> {
  // ... existing pre-call short-circuits stay ...
  const r = await opts.gemini.generate([prompt]);
  if (opts.logger && (r.cachedTokens !== undefined || r.promptTokens !== undefined)) {
    opts.logger.debug(
      { step: 'doc-selector', cachedTokens: r.cachedTokens ?? 0, promptTokens: r.promptTokens },
      'LLM usage',
    );
  }
  // ... existing parsing ...
}
```

Repeat for `tree-reasoner.ts` and `answer-generator.ts`. For `answer-generator`, the call is `generateStream` — usage may not be available until the stream resolves. If the underlying SDK supplies usage only via the final non-streaming call, log `(r.promptTokens, r.cachedTokens)` when present — otherwise skip (don't fabricate zero).

Wire through `AnswerOpts.logger`:

```ts
// packages/query/src/types.ts
export interface AnswerOpts {
  // ... existing ...
  logger?: Logger;
}

// packages/query/src/index.ts → answer()
const docSelection = await selectDocs({
  gemini: opts.gemini, docs, query: opts.query, historySummary,
  ...(opts.logger ? { logger: opts.logger } : {}),
});
// similarly for reasonTree, generateAnswer
```

And update server caller `packages/server/src/routes/chat.ts` (or wherever it builds `answer({...})`):

```ts
queryAnswer({
  // ... existing ...
  logger: deps.logger,   // already has it
});
```

  Inspect the actual file paths and existing `deps` shape — adjust naming to whatever is already there.

- [ ] **Step 4:** Run all 3 tests — expect PASS.

- [ ] **Step 5: Smoke**

```bash
LOG_LEVEL=debug pnpm -F @buddy/serve start
```

In another terminal, fire a chat against an indexed topic:

```bash
curl -X POST http://localhost:3000/api/conversations -H "content-type: application/json" -d '{"topic":"<yours>"}'
# capture id
curl -N -X POST http://localhost:3000/api/chat/stream -H "content-type: application/json" \
  -d '{"conversation_id":"<id>","query":"summarize"}'
```

Then fire a second identical query in the same conversation. Server log should show `cachedTokens > 0` on the second call (if your provider+model+prompt-size are eligible).

  **Caveat:** flash-lite may not yet support implicit caching. If `cachedTokens` is always 0 / undefined, that is a *finding*, not a bug — document in the memory entry. The infra now exposes the metric, which is the deliverable.

- [ ] **Step 6: Commit**

```bash
git add packages/query/src/doc-selector.ts \
        packages/query/src/tree-reasoner.ts \
        packages/query/src/answer-generator.ts \
        packages/query/src/index.ts \
        packages/query/src/types.ts \
        packages/query/test/doc-selector.test.ts \
        packages/query/test/tree-reasoner.test.ts \
        packages/query/test/answer-generator.test.ts \
        packages/server/src/routes/chat.ts
git commit -m "feat(query): log LLM cached/prompt tokens per call"
```

---

## Task 7: Final verification + memory update

- [ ] **Step 1: Typecheck all**

```bash
pnpm -r typecheck
```

Expected: clean.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 3: All tests**

```bash
pnpm -r test
```

Expected:
- shared: prior count + 3 new (gemini cachedTokens, openai cachedTokens × 2).
- query: prior count + 4 new (3 logger tests + 1 prompt-shape test, or however many you ended up with).
- server: 7/7 (was 2/7).
- Net +10 or so. No regressions.

- [ ] **Step 4: Append memory status** in `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under "## Status (auto-updated)":

```
- 2026-MM-DD: v1 gap closure complete. Pinned better-sqlite3 in pnpm.onlyBuiltDependencies → server tests now 7/7. Both LLM clients surface cachedTokens (Gemini cachedContentTokenCount / OpenAI prompt_tokens_details.cached_tokens) on GenerateResult; query layer logs per-step LLM usage at debug. Prompts locked cache-friendly (stable prefix before query) via shape tests. Smoke result: <observed cachedTokens behavior — e.g. "openai shows cache hits ≥1024-token prompts; gemini flash-lite shows 0 — implicit caching may be unsupported on this model, infra ready when it lands">. Explicit Gemini cachedContent API still NOT wired (out of scope this round). Total tests: <NN>.
```

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-05-21-v1-gap-closure.md
git commit -m "chore(plan): v1 gap closure plan"
```

---

## Self-Review Notes (author)

- **Gap A coverage:** caching is now observable end-to-end on both providers. Prompt shape locked so implicit caching can fire. Explicit Gemini `cachedContent` API intentionally deferred — see header rationale.
- **Gap B coverage:** Task 1 pins the native build; Task 7 verifies 7/7 server tests.
- **Provider-agnostic shape:** `cachedTokens?: number` lives on the shared `GenerateResult` interface; both clients populate it. Query/server layer reads it via that field, doesn't branch on provider.
- **No placeholders.** Every step has either concrete code, a concrete grep target, or a concrete command.
- **Type consistency:** `cachedTokens` field name identical across Tasks 2/3/4/6. `Logger` import from `@buddy/shared` consistent in Task 6 wiring.
- **Behavior under flash-lite:** the plan assumes Gemini implicit caching *might* not fire on flash-lite. The deliverable is the *infra*, not a guaranteed cache hit — clearly stated. If telemetry confirms it never fires, a follow-up plan can wire the explicit `cachedContent` API using the existing `tryCreateContextCache` helper.
- **Risk:** Task 6 plumbs a `logger?` through 4 modules. Keep it strictly optional — tests using stub clients should still pass without supplying one.
- **Caveats for the engineer:**
  - If the Gemini SDK closure in `createRealGemini` makes injecting a fake awkward, prefer Option 1 (small refactor) over Option 2 (skip the test). The seam pays off when adding more providers.
  - Don't add a `cachedTokens` default of `0` — distinguish "API didn't report" (undefined) from "API reported zero hits" (0). Tests assert this.
  - When the server caller wires `logger`, do not log at `info` — caching telemetry at `info` would spam normal output. Keep it `debug`.
