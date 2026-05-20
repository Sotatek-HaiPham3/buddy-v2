# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the pnpm workspace monorepo and build `@buddy/shared` — the foundation package that every other package depends on (config, logger, gemini client, retry, concurrency pool, zod schemas, mupdf PDF helper, id utilities).

**Architecture:** ESM-only TypeScript monorepo using pnpm workspaces. `@buddy/shared` exports a typed `cfg` object loaded from `.env`, a pino logger factory, a Gemini SDK wrapper behind a small interface (so tests can stub it), `withRetry`/`p-limit` cross-cutting helpers, zod schemas for tree + API + step IO types, and a mupdf-js wrapper for PDF text/pixmap/structured-text. No business logic — all pipeline/query/server packages consume this.

**Tech Stack:** TypeScript 5.x (strict, ESM, NodeNext), pnpm workspaces, Node ≥ 20, `tsx` (dev runner), `tsup` (build), Vitest (test), Biome (lint/format), zod, pino, p-limit, mupdf (`mupdf` npm pkg = official MuPDF WASM bindings), `@google/generative-ai`, nanoid, dotenv.

**Spec reference:** `docs/superpowers/specs/2026-05-21-buddy-design.md` — Sections 3.1 (repo layout), 8 (`@buddy/shared`), 9 (config), 10 (error handling), 11 (testing), 12 (tooling).

---

## File Structure (what gets created)

```
buddy-v2/
├── .env.example                            # Template env file (gitignored real .env)
├── .gitignore
├── .npmrc                                  # pnpm config
├── biome.json                              # lint+format
├── package.json                            # root (private, workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json                      # shared compiler options
├── vitest.config.ts                        # root vitest config (collects packages)
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── src/
│       │   ├── index.ts                    # barrel
│       │   ├── config.ts                   # zod .env loader
│       │   ├── logger.ts                   # pino factory
│       │   ├── ids.ts                      # nanoid wrappers
│       │   ├── paths.ts                    # data-dir path helpers
│       │   ├── pdf.ts                      # mupdf wrapper
│       │   ├── llm/
│       │   │   ├── types.ts                # GeminiClient interface
│       │   │   ├── gemini.ts               # @google/generative-ai impl
│       │   │   ├── stub.ts                 # stub impl for tests
│       │   │   ├── retry.ts                # withRetry exp backoff
│       │   │   ├── pool.ts                 # shared p-limit pool
│       │   │   └── cache.ts                # best-effort context cache
│       │   └── schemas/
│       │       ├── tree.ts                 # TreeNode, Tree, DocOutput
│       │       └── api.ts                  # request/response zod schemas
│       └── test/
│           ├── ids.test.ts
│           ├── paths.test.ts
│           ├── config.test.ts
│           ├── llm/retry.test.ts
│           ├── llm/pool.test.ts
│           ├── llm/stub.test.ts
│           ├── schemas/tree.test.ts
│           ├── pdf.test.ts
│           └── fixtures/
│               └── make-sample-pdf.ts      # generates tiny PDF in-memory for pdf.test.ts
```

Each `src/*.ts` file has one responsibility. Tests live beside each file.

---

### Task 0: Verify Prerequisites

**Files:** none

- [ ] **Step 1: Verify Node version**

Run: `node --version`
Expected: `v20.x.x` or higher.
If lower: install Node 20+ before continuing.

- [ ] **Step 2: Verify pnpm installed**

Run: `pnpm --version`
Expected: `9.x.x` or higher.
If missing: `npm install -g pnpm@latest`

- [ ] **Step 3: Verify working directory**

Run: `pwd` (or `cd` on Windows) — must be `E:\dev-space\AI\buddy-v2` (or repo root if cloned elsewhere).
Expected output: the buddy-v2 repo root.

- [ ] **Step 4: Initialize git if missing**

Run: `git rev-parse --is-inside-work-tree`
If error "not a git repository": run `git init && git add invest-page-index docs/superpowers/specs && git commit -m "chore: import spec and reference docs"`
Expected: subsequent `git status` shows clean working tree (apart from any unrelated files).

---

### Task 1: Create `.gitignore` and `.npmrc`

**Files:**
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
*.tsbuildinfo

# Env files
.env
.env.local
.env.*.local
!.env.example

# Data (user PDFs and built indexes)
data/

# Logs
*.log

# Editor / OS
.DS_Store
.idea/
.vscode/
Thumbs.db

# Test artifacts
coverage/
.vitest-cache/
```

- [ ] **Step 2: Write `.npmrc`**

```ini
# Hoist nothing — explicit deps only
hoist=false
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore .npmrc
git commit -m "chore: add gitignore and npmrc"
```

---

### Task 2: Create Root `package.json` and `pnpm-workspace.yaml`

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "buddy-v2",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "pnpm -r --filter='./packages/*' --filter='./apps/*' run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r run typecheck",
    "lint": "biome check .",
    "format": "biome format --write .",
    "clean": "pnpm -r exec rm -rf dist node_modules .tsbuildinfo"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  }
}
```

- [ ] **Step 3: Install root deps**

Run: `pnpm install`
Expected: lockfile created (`pnpm-lock.yaml`), no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace root"
```

---

### Task 3: Create `tsconfig.base.json`

**Files:**
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.base.json
git commit -m "chore: add base tsconfig"
```

---

### Task 4: Create `biome.json`

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": ["node_modules", "dist", "data", "coverage", "**/*.tsbuildinfo"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off",
        "useImportType": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  }
}
```

- [ ] **Step 2: Verify biome runs**

Run: `pnpm lint`
Expected: passes (no source files yet, just config).

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore: configure biome"
```

---

### Task 5: Create Root `vitest.config.ts`

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts'],
    },
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 2: Verify vitest discovers no tests yet**

Run: `pnpm test`
Expected: exits 0 with "No test files found, exiting with code 0" — or similar. (Vitest 2 may exit 1 on no-tests; if so add `--passWithNoTests` to script. If error appears, update script.)

- [ ] **Step 3: If needed, update `test` script**

If previous step errored on no tests, edit `package.json`:

```json
"test": "vitest run --passWithNoTests",
```

Re-run `pnpm test` to confirm clean exit.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure vitest"
```

---

### Task 6: Scaffold `@buddy/shared` Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/tsup.config.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@buddy/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "dotenv": "^16.4.5",
    "mupdf": "^1.3.1",
    "nanoid": "^5.0.7",
    "p-limit": "^6.1.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "./.tsbuildinfo",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `packages/shared/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
});
```

- [ ] **Step 4: Write empty barrel `packages/shared/src/index.ts`**

```ts
// Barrel — populated by subsequent tasks.
export {};
```

- [ ] **Step 5: Install package deps**

Run: `pnpm install`
Expected: `packages/shared/node_modules` linked via pnpm; no errors.

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes (no source yet).

- [ ] **Step 7: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "chore(shared): scaffold @buddy/shared package"
```

---

### Task 7: Implement `ids.ts` (TDD)

**Files:**
- Create: `packages/shared/test/ids.test.ts`
- Create: `packages/shared/src/ids.ts`

`ids.ts` exports prefixed nanoid generators for each entity type (matches spec Section 8): `convId()`, `msgId()`, `docId()`, `nodeId()`, `runId()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/ids.test.ts
import { describe, expect, it } from 'vitest';
import { convId, docId, msgId, nodeId, runId } from '../src/ids.js';

describe('ids', () => {
  it('convId returns string with conv_ prefix and 22+ chars', () => {
    const id = convId();
    expect(id).toMatch(/^conv_[A-Za-z0-9_-]{20,}$/);
  });

  it('msgId returns string with msg_ prefix', () => {
    expect(msgId()).toMatch(/^msg_[A-Za-z0-9_-]{20,}$/);
  });

  it('docId returns string with doc_ prefix', () => {
    expect(docId()).toMatch(/^doc_[A-Za-z0-9_-]{20,}$/);
  });

  it('nodeId returns string with node_ prefix', () => {
    expect(nodeId()).toMatch(/^node_[A-Za-z0-9_-]{20,}$/);
  });

  it('runId returns string with run_ prefix', () => {
    expect(runId()).toMatch(/^run_[A-Za-z0-9_-]{20,}$/);
  });

  it('generated ids are unique across many calls', () => {
    const set = new Set(Array.from({ length: 1000 }, () => convId()));
    expect(set.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/ids.test.ts`
Expected: FAIL — module `../src/ids.js` not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/ids.ts
import { nanoid } from 'nanoid';

const make = (prefix: string) => (): string => `${prefix}_${nanoid(21)}`;

export const convId = make('conv');
export const msgId = make('msg');
export const docId = make('doc');
export const nodeId = make('node');
export const runId = make('run');
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/ids.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './ids.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ids.ts packages/shared/src/index.ts packages/shared/test/ids.test.ts
git commit -m "feat(shared): add prefixed id generators"
```

---

### Task 8: Implement `paths.ts` (TDD)

**Files:**
- Create: `packages/shared/test/paths.test.ts`
- Create: `packages/shared/src/paths.ts`

`paths.ts` centralizes filesystem path resolution under `DATA_DIR`. Pure functions, no I/O.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/paths.test.ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveDocCacheDir,
  resolveDocPagesDir,
  resolveDocTreePath,
  resolveImagesDir,
  resolveIndexDir,
  resolveLogsDir,
  resolveTopicDir,
} from '../src/paths.js';

const DATA = '/tmp/data';

describe('paths', () => {
  it('resolveTopicDir joins DATA_DIR + topic', () => {
    expect(resolveTopicDir(DATA, 'finance')).toBe(path.join(DATA, 'finance'));
  });

  it('resolveIndexDir adds .index', () => {
    expect(resolveIndexDir(DATA, 'finance')).toBe(path.join(DATA, 'finance', '.index'));
  });

  it('resolveDocTreePath adds <doc>.tree.json', () => {
    expect(resolveDocTreePath(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'doc_abc.tree.json'),
    );
  });

  it('resolveDocCacheDir adds <doc>/.cache', () => {
    expect(resolveDocCacheDir(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'doc_abc', '.cache'),
    );
  });

  it('resolveDocPagesDir adds <doc>/pages', () => {
    expect(resolveDocPagesDir(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'doc_abc', 'pages'),
    );
  });

  it('resolveImagesDir adds images/<doc>', () => {
    expect(resolveImagesDir(DATA, 'finance', 'doc_abc')).toBe(
      path.join(DATA, 'finance', '.index', 'images', 'doc_abc'),
    );
  });

  it('resolveLogsDir adds logs', () => {
    expect(resolveLogsDir(DATA, 'finance')).toBe(
      path.join(DATA, 'finance', '.index', 'logs'),
    );
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/paths.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/paths.ts
import path from 'node:path';

export const resolveTopicDir = (dataDir: string, topic: string): string =>
  path.join(dataDir, topic);

export const resolveIndexDir = (dataDir: string, topic: string): string =>
  path.join(resolveTopicDir(dataDir, topic), '.index');

export const resolveDocTreePath = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), `${docId}.tree.json`);

export const resolveDocCacheDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, '.cache');

export const resolveDocPagesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), docId, 'pages');

export const resolveImagesDir = (dataDir: string, topic: string, docId: string): string =>
  path.join(resolveIndexDir(dataDir, topic), 'images', docId);

export const resolveLogsDir = (dataDir: string, topic: string): string =>
  path.join(resolveIndexDir(dataDir, topic), 'logs');
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/paths.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './ids.js';
export * from './paths.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/paths.ts packages/shared/src/index.ts packages/shared/test/paths.test.ts
git commit -m "feat(shared): add path resolvers"
```

---

### Task 9: Implement `config.ts` (TDD)

**Files:**
- Create: `.env.example`
- Create: `packages/shared/test/config.test.ts`
- Create: `packages/shared/src/config.ts`

`config.ts` loads `.env` via `dotenv`, validates via zod, exports both the schema and a `loadConfig()` function (so tests can pass overrides). Spec Section 9 defines the env vars.

- [ ] **Step 1: Write `.env.example`**

```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_VISION_MODEL=gemini-2.5-flash-lite
PORT=3000
DATA_DIR=./data
MAX_CONCURRENT_LLM=10
MAX_PAGES_PER_NODE=20
MAX_RETRIES=3
ADD_SUMMARIES=true
IMAGES_ENABLED=true
TABLES_ENABLED=true
HIERARCHICAL_PROCESSING=true
SUBGROUP_TOKEN_SIZE=7000
MAX_RETRIEVALS_PER_MASTER=3
LOG_LEVEL=info
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/shared/test/config.test.ts
import { describe, expect, it } from 'vitest';
import { configSchema, loadConfig } from '../src/config.js';

describe('config', () => {
  const baseEnv = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-2.5-flash-lite',
    GEMINI_VISION_MODEL: 'gemini-2.5-flash-lite',
    PORT: '3000',
    DATA_DIR: './data',
    MAX_CONCURRENT_LLM: '10',
    MAX_PAGES_PER_NODE: '20',
    MAX_RETRIES: '3',
    ADD_SUMMARIES: 'true',
    IMAGES_ENABLED: 'true',
    TABLES_ENABLED: 'true',
    HIERARCHICAL_PROCESSING: 'true',
    SUBGROUP_TOKEN_SIZE: '7000',
    MAX_RETRIEVALS_PER_MASTER: '3',
    LOG_LEVEL: 'info',
  };

  it('parses valid env into typed config', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.geminiApiKey).toBe('test-key');
    expect(cfg.port).toBe(3000);
    expect(cfg.maxConcurrentLlm).toBe(10);
    expect(cfg.addSummaries).toBe(true);
    expect(cfg.logLevel).toBe('info');
  });

  it('uses defaults for missing optional vars', () => {
    const cfg = loadConfig({ GEMINI_API_KEY: 'k' });
    expect(cfg.geminiModel).toBe('gemini-2.5-flash-lite');
    expect(cfg.port).toBe(3000);
    expect(cfg.dataDir).toBe('./data');
    expect(cfg.imagesEnabled).toBe(true);
  });

  it('throws on missing GEMINI_API_KEY', () => {
    expect(() => loadConfig({})).toThrow(/GEMINI_API_KEY/);
  });

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ GEMINI_API_KEY: 'k', LOG_LEVEL: 'banana' })).toThrow();
  });

  it('configSchema is exported for reuse', () => {
    expect(configSchema).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// packages/shared/src/config.ts
import 'dotenv/config';
import { z } from 'zod';

const boolStr = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true');

const intStr = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive());

export const configSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),
  GEMINI_VISION_MODEL: z.string().default('gemini-2.5-flash-lite'),
  PORT: intStr(3000),
  DATA_DIR: z.string().default('./data'),
  MAX_CONCURRENT_LLM: intStr(10),
  MAX_PAGES_PER_NODE: intStr(20),
  MAX_RETRIES: intStr(3),
  ADD_SUMMARIES: boolStr.default('true'),
  IMAGES_ENABLED: boolStr.default('true'),
  TABLES_ENABLED: boolStr.default('true'),
  HIERARCHICAL_PROCESSING: boolStr.default('true'),
  SUBGROUP_TOKEN_SIZE: intStr(7000),
  MAX_RETRIEVALS_PER_MASTER: intStr(3),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type RawConfig = z.infer<typeof configSchema>;

export interface Config {
  geminiApiKey: string;
  geminiModel: string;
  geminiVisionModel: string;
  port: number;
  dataDir: string;
  maxConcurrentLlm: number;
  maxPagesPerNode: number;
  maxRetries: number;
  addSummaries: boolean;
  imagesEnabled: boolean;
  tablesEnabled: boolean;
  hierarchicalProcessing: boolean;
  subgroupTokenSize: number;
  maxRetrievalsPerMaster: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.parse(env);
  return {
    geminiApiKey: parsed.GEMINI_API_KEY,
    geminiModel: parsed.GEMINI_MODEL,
    geminiVisionModel: parsed.GEMINI_VISION_MODEL,
    port: parsed.PORT,
    dataDir: parsed.DATA_DIR,
    maxConcurrentLlm: parsed.MAX_CONCURRENT_LLM,
    maxPagesPerNode: parsed.MAX_PAGES_PER_NODE,
    maxRetries: parsed.MAX_RETRIES,
    addSummaries: parsed.ADD_SUMMARIES,
    imagesEnabled: parsed.IMAGES_ENABLED,
    tablesEnabled: parsed.TABLES_ENABLED,
    hierarchicalProcessing: parsed.HIERARCHICAL_PROCESSING,
    subgroupTokenSize: parsed.SUBGROUP_TOKEN_SIZE,
    maxRetrievalsPerMaster: parsed.MAX_RETRIEVALS_PER_MASTER,
    logLevel: parsed.LOG_LEVEL,
  };
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './paths.js';
```

- [ ] **Step 7: Commit**

```bash
git add .env.example packages/shared/src/config.ts packages/shared/src/index.ts packages/shared/test/config.test.ts
git commit -m "feat(shared): add zod-validated config loader"
```

---

### Task 10: Implement `logger.ts`

**Files:**
- Create: `packages/shared/src/logger.ts`

Pino factory. Pretty-print in dev, JSON in prod. Supports `.child()` for per-run/per-step context.

- [ ] **Step 1: Implement**

```ts
// packages/shared/src/logger.ts
import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

interface CreateLoggerOpts {
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  pretty?: boolean;
  destination?: string;
}

export function createLogger(opts: CreateLoggerOpts = {}): Logger {
  const level = opts.level ?? 'info';
  const pretty = opts.pretty ?? process.env.NODE_ENV !== 'production';

  const base: LoggerOptions = {
    level,
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (opts.destination) {
    return pino(base, pino.destination({ dest: opts.destination, mkdir: true, sync: false }));
  }

  if (pretty) {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l' },
      },
    });
  }

  return pino(base);
}
```

- [ ] **Step 2: Smoke-check (no test — pino itself is well-tested; we only verify the wrapper compiles and runs)**

Run: `pnpm typecheck`
Expected: passes.

Run inline check:
```bash
node --input-type=module -e "import('./packages/shared/src/logger.ts').catch(e=>{console.error(e);process.exit(1)})" 2>/dev/null || true
```
(This may fail because `.ts` can't be imported by raw node; it's a sanity command only. Real validation comes from the typecheck above and from later tasks importing the logger.)

- [ ] **Step 3: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './logger.js';
export * from './paths.js';
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/logger.ts packages/shared/src/index.ts
git commit -m "feat(shared): add pino logger factory"
```

---

### Task 11: Implement `schemas/tree.ts` (TDD)

**Files:**
- Create: `packages/shared/test/schemas/tree.test.ts`
- Create: `packages/shared/src/schemas/tree.ts`

Zod schema for the PageIndex tree output (spec Section 3.3, plus shape from `invest-page-index/docs/README.md`). Recursive `TreeNode` with optional `summary`, `images`, `tables`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/schemas/tree.test.ts
import { describe, expect, it } from 'vitest';
import { docOutputSchema, treeNodeSchema } from '../../src/schemas/tree.js';

describe('treeNodeSchema', () => {
  it('parses a minimal leaf node', () => {
    const node = {
      title: 'Intro',
      start_index: 1,
      end_index: 3,
      node_id: 'node_abc',
    };
    expect(treeNodeSchema.parse(node)).toEqual({ ...node, nodes: [], images: [], tables: [] });
  });

  it('parses a nested node with children', () => {
    const node = {
      title: 'Chapter 1',
      start_index: 1,
      end_index: 10,
      node_id: 'node_1',
      nodes: [
        {
          title: '1.1 Background',
          start_index: 2,
          end_index: 5,
          node_id: 'node_1_1',
        },
      ],
    };
    const out = treeNodeSchema.parse(node);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]?.title).toBe('1.1 Background');
  });

  it('accepts optional summary, images, tables', () => {
    const node = {
      title: 'Risk',
      start_index: 8,
      end_index: 14,
      node_id: 'node_r',
      summary: 'Analyzes risks.',
      images: [{ path: 'img/8-1.png', caption: 'Chart', page: 9 }],
      tables: [{ path: 'tbl/10-1.json', page: 10, schema: 'Revenue by region' }],
    };
    const out = treeNodeSchema.parse(node);
    expect(out.summary).toBe('Analyzes risks.');
    expect(out.images[0]?.caption).toBe('Chart');
    expect(out.tables[0]?.schema).toBe('Revenue by region');
  });

  it('rejects nodes with end_index < start_index', () => {
    expect(() =>
      treeNodeSchema.parse({
        title: 'Bad',
        start_index: 10,
        end_index: 5,
        node_id: 'node_b',
      }),
    ).toThrow();
  });
});

describe('docOutputSchema', () => {
  it('parses a full document output', () => {
    const doc = {
      doc_id: 'doc_x',
      doc_name: 'annual-report.pdf',
      doc_description: '2023 financial report',
      structure: [
        { title: 'Exec Summary', start_index: 1, end_index: 14, node_id: 'node_0' },
      ],
    };
    const out = docOutputSchema.parse(doc);
    expect(out.doc_name).toBe('annual-report.pdf');
    expect(out.structure).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/schemas/tree.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/schemas/tree.ts
import { z } from 'zod';

export const imageRefSchema = z.object({
  path: z.string(),
  caption: z.string().optional(),
  page: z.number().int().positive(),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const tableRefSchema = z.object({
  path: z.string(),
  page: z.number().int().positive(),
  schema: z.string().optional(),
});
export type TableRef = z.infer<typeof tableRefSchema>;

export interface TreeNode {
  title: string;
  start_index: number;
  end_index: number;
  node_id: string;
  summary?: string;
  nodes: TreeNode[];
  images: ImageRef[];
  tables: TableRef[];
}

export const treeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z
    .object({
      title: z.string(),
      start_index: z.number().int().positive(),
      end_index: z.number().int().positive(),
      node_id: z.string(),
      summary: z.string().optional(),
      nodes: z.array(treeNodeSchema).default([]),
      images: z.array(imageRefSchema).default([]),
      tables: z.array(tableRefSchema).default([]),
    })
    .refine((n) => n.end_index >= n.start_index, {
      message: 'end_index must be >= start_index',
    }),
);

export const docOutputSchema = z.object({
  doc_id: z.string(),
  doc_name: z.string(),
  doc_description: z.string(),
  structure: z.array(treeNodeSchema),
});
export type DocOutput = z.infer<typeof docOutputSchema>;
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/schemas/tree.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './logger.js';
export * from './paths.js';
export * from './schemas/tree.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/tree.ts packages/shared/src/index.ts packages/shared/test/schemas/tree.test.ts
git commit -m "feat(shared): add tree zod schema"
```

---

### Task 12: Implement `schemas/api.ts`

**Files:**
- Create: `packages/shared/src/schemas/api.ts`

Zod schemas for HTTP API request/response shapes (spec Section 6.3). Web + server import from here for type-safe boundaries.

- [ ] **Step 1: Implement**

```ts
// packages/shared/src/schemas/api.ts
import { z } from 'zod';

export const topicSummarySchema = z.object({
  topic: z.string(),
  doc_count: z.number().int().nonnegative(),
  last_built_at: z.number().int().nullable(),
});
export type TopicSummary = z.infer<typeof topicSummarySchema>;

export const docSummarySchema = z.object({
  doc_id: z.string(),
  doc_name: z.string(),
  doc_description: z.string(),
  page_count: z.number().int().positive(),
});
export type DocSummary = z.infer<typeof docSummarySchema>;

export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.number().int(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const citationSchema = z.object({
  doc: z.string(),
  node_ids: z.array(z.string()),
  pages: z.array(z.number().int().positive()),
});
export type Citation = z.infer<typeof citationSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const reasoningTraceSchema = z.object({
  doc_selector: z
    .object({
      reasoning: z.string(),
      doc_ids: z.array(z.string()),
    })
    .optional(),
  tree_reasoner: z
    .object({
      reasoning: z.string(),
      node_ids: z.array(z.string()),
    })
    .optional(),
});
export type ReasoningTrace = z.infer<typeof reasoningTraceSchema>;

export const messageSchema = z.object({
  id: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  citations: z.array(citationSchema).default([]),
  trace: reasoningTraceSchema.nullable().default(null),
  created_at: z.number().int(),
});
export type Message = z.infer<typeof messageSchema>;

export const createConversationReqSchema = z.object({
  topic: z.string().min(1),
  title: z.string().optional(),
});

export const patchConversationReqSchema = z.object({
  title: z.string().min(1),
});

export const chatStreamReqSchema = z.object({
  conversation_id: z.string(),
  query: z.string().min(1),
});

// SSE event payloads
export const sseTokenSchema = z.object({ delta: z.string() });
export const sseCitationsSchema = z.array(citationSchema);
export const sseDoneSchema = z.object({ message_id: z.string() });
export const sseErrorSchema = z.object({ message: z.string() });
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './logger.js';
export * from './paths.js';
export * from './schemas/api.js';
export * from './schemas/tree.js';
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas/api.ts packages/shared/src/index.ts
git commit -m "feat(shared): add api zod schemas"
```

---

### Task 13: Implement `llm/pool.ts` (TDD)

**Files:**
- Create: `packages/shared/test/llm/pool.test.ts`
- Create: `packages/shared/src/llm/pool.ts`

Shared concurrency gate wrapping `p-limit`. Singleton per process, configurable at init.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/llm/pool.test.ts
import { describe, expect, it } from 'vitest';
import { createLlmPool } from '../../src/llm/pool.js';

describe('createLlmPool', () => {
  it('caps concurrency to N', async () => {
    const pool = createLlmPool(2);
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;

    const task = (id: string) =>
      pool(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 10));
        order.push(id);
        running--;
        return id;
      });

    const results = await Promise.all([task('a'), task('b'), task('c'), task('d')]);
    expect(results).toEqual(['a', 'b', 'c', 'd']);
    expect(maxRunning).toBeLessThanOrEqual(2);
    expect(order).toHaveLength(4);
  });

  it('throws if concurrency < 1', () => {
    expect(() => createLlmPool(0)).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/llm/pool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/llm/pool.ts
import pLimit from 'p-limit';

export type LlmPool = <T>(fn: () => Promise<T>) => Promise<T>;

export function createLlmPool(concurrency: number): LlmPool {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }
  const limit = pLimit(concurrency);
  return <T>(fn: () => Promise<T>) => limit(fn);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/llm/pool.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/llm/pool.ts packages/shared/test/llm/pool.test.ts
git commit -m "feat(shared): add llm concurrency pool"
```

---

### Task 14: Implement `llm/retry.ts` (TDD)

**Files:**
- Create: `packages/shared/test/llm/retry.test.ts`
- Create: `packages/shared/src/llm/retry.ts`

`withRetry`: exponential backoff per `invest-page-index/docs/edge-cases/api-retry.md` — retry on 429/5xx/network errors, 3 attempts default, base 1s with jitter.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/test/llm/retry.test.ts
import { describe, expect, it, vi } from 'vitest';
import { isRetryable, withRetry } from '../../src/llm/retry.js';

describe('isRetryable', () => {
  it('returns true for status 429', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('returns true for status 500', () => {
    expect(isRetryable({ status: 500 })).toBe(true);
  });

  it('returns true for status 503', () => {
    expect(isRetryable({ status: 503 })).toBe(true);
  });

  it('returns false for status 400', () => {
    expect(isRetryable({ status: 400 })).toBe(false);
  });

  it('returns true for network errors (no status)', () => {
    expect(isRetryable({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRetryable(null)).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable failure then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400, message: 'bad request' });
    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 400,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries attempts', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toMatchObject({
      status: 503,
    });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/llm/retry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/llm/retry.ts
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']);

export function isRetryable(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  if (typeof err !== 'object') return false;
  const e = err as { status?: number; code?: string };
  if (typeof e.status === 'number') return RETRYABLE_STATUSES.has(e.status);
  if (typeof e.code === 'string') return RETRYABLE_CODES.has(e.code);
  return false;
}

export interface RetryOpts {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (err: unknown, attempt: number) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxRetries) throw err;
      opts.onRetry?.(err, attempt + 1);
      const delay = baseDelay * 2 ** attempt + Math.random() * baseDelay;
      await sleep(delay);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/llm/retry.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/llm/retry.ts packages/shared/test/llm/retry.test.ts
git commit -m "feat(shared): add withRetry with exp backoff"
```

---

### Task 15: Define `GeminiClient` Interface and Stub Implementation (TDD)

**Files:**
- Create: `packages/shared/src/llm/types.ts`
- Create: `packages/shared/src/llm/stub.ts`
- Create: `packages/shared/test/llm/stub.test.ts`

The interface decouples pipeline/query code from the real SDK so tests can swap a stub in. Stub matches input prompts (by stable hash) to canned responses — used by golden tree tests in plan #2.

- [ ] **Step 1: Write `packages/shared/src/llm/types.ts`**

```ts
// packages/shared/src/llm/types.ts
export interface GenerateOpts {
  model?: string;
  systemInstruction?: string;
  responseSchema?: object;        // for structured JSON output
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
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
```

- [ ] **Step 2: Write the failing test for stub**

```ts
// packages/shared/test/llm/stub.test.ts
import { describe, expect, it } from 'vitest';
import { createStubGemini, hashPrompt } from '../../src/llm/stub.js';

describe('stub gemini', () => {
  it('hashPrompt is stable for same input', () => {
    expect(hashPrompt(['hello', 'world'])).toBe(hashPrompt(['hello', 'world']));
    expect(hashPrompt(['hello'])).not.toBe(hashPrompt(['hello', 'world']));
  });

  it('returns canned response for matching prompt', async () => {
    const stub = createStubGemini({
      responses: new Map([[hashPrompt(['ping']), { text: 'pong' }]]),
    });
    const result = await stub.generate(['ping']);
    expect(result.text).toBe('pong');
  });

  it('throws on missing prompt', async () => {
    const stub = createStubGemini({ responses: new Map() });
    await expect(stub.generate(['unknown'])).rejects.toThrow(/no stub response/i);
  });

  it('records calls for inspection', async () => {
    const stub = createStubGemini({
      responses: new Map([[hashPrompt(['x']), { text: 'y' }]]),
    });
    await stub.generate(['x']);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.parts).toEqual(['x']);
  });

  it('streams chunks of canned text', async () => {
    const stub = createStubGemini({
      responses: new Map([[hashPrompt(['stream me']), { text: 'hello world' }]]),
    });
    const chunks: string[] = [];
    for await (const c of stub.generateStream(['stream me'])) {
      chunks.push(c.delta);
    }
    expect(chunks.join('')).toBe('hello world');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/llm/stub.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement stub**

```ts
// packages/shared/src/llm/stub.ts
import { createHash } from 'node:crypto';
import type {
  ContentPart,
  GeminiClient,
  GenerateOpts,
  GenerateResult,
  GenerateStreamChunk,
} from './types.js';

export function hashPrompt(parts: ContentPart[]): string {
  const h = createHash('sha256');
  for (const p of parts) {
    if (typeof p === 'string') h.update(`s:${p} `);
    else h.update(`i:${p.inlineData.mimeType}:${p.inlineData.data.length} `);
  }
  return h.digest('hex');
}

export interface StubCall {
  parts: ContentPart[];
  opts: GenerateOpts | undefined;
}

export interface StubGemini extends GeminiClient {
  calls: StubCall[];
}

interface StubOpts {
  responses: Map<string, GenerateResult>;
  chunkSize?: number;
}

export function createStubGemini(opts: StubOpts): StubGemini {
  const calls: StubCall[] = [];
  const chunkSize = opts.chunkSize ?? 4;

  const generate = async (
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): Promise<GenerateResult> => {
    calls.push({ parts, opts: callOpts });
    const key = hashPrompt(parts);
    const r = opts.responses.get(key);
    if (!r) throw new Error(`stub gemini: no stub response for prompt hash ${key.slice(0, 12)}`);
    return r;
  };

  async function* generateStream(
    parts: ContentPart[],
    callOpts?: GenerateOpts,
  ): AsyncIterable<GenerateStreamChunk> {
    const full = await generate(parts, callOpts);
    for (let i = 0; i < full.text.length; i += chunkSize) {
      yield { delta: full.text.slice(i, i + chunkSize) };
    }
  }

  return { generate, generateStream, calls };
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/llm/stub.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/llm/types.ts packages/shared/src/llm/stub.ts packages/shared/test/llm/stub.test.ts
git commit -m "feat(shared): add GeminiClient interface + stub for tests"
```

---

### Task 16: Implement Real Gemini Client (`llm/gemini.ts`)

**Files:**
- Create: `packages/shared/src/llm/gemini.ts`

Adapter from `GeminiClient` interface to `@google/generative-ai`. No automated tests here (would require network or full SDK mock — defer integration tests to plan #2 with stubbed pipeline). Verify via typecheck + smoke import.

- [ ] **Step 1: Implement**

```ts
// packages/shared/src/llm/gemini.ts
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
}

function toSdkParts(parts: ContentPart[]): Part[] {
  return parts.map((p) =>
    typeof p === 'string'
      ? { text: p }
      : { inlineData: { data: p.inlineData.data, mimeType: p.inlineData.mimeType } },
  );
}

export function createRealGemini(opts: RealGeminiOpts): GeminiClient {
  const sdk = new GoogleGenerativeAI(opts.apiKey);

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
    if (
      callOpts?.temperature !== undefined ||
      callOpts?.maxOutputTokens !== undefined
    ) {
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
    const r = await model.generateContent({ contents: [{ role: 'user', parts: toSdkParts(parts) }] });
    const text = r.response.text();
    const usage = r.response.usageMetadata;
    return {
      text,
      ...(usage?.promptTokenCount !== undefined ? { promptTokens: usage.promptTokenCount } : {}),
      ...(usage?.candidatesTokenCount !== undefined
        ? { outputTokens: usage.candidatesTokenCount }
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
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Export LLM module from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './llm/gemini.js';
export * from './llm/pool.js';
export * from './llm/retry.js';
export * from './llm/stub.js';
export * from './llm/types.js';
export * from './logger.js';
export * from './paths.js';
export * from './schemas/api.js';
export * from './schemas/tree.js';
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/llm/gemini.ts packages/shared/src/index.ts
git commit -m "feat(shared): add real Gemini client adapter"
```

---

### Task 17: Implement `llm/cache.ts` (Best-Effort Context Cache)

**Files:**
- Create: `packages/shared/src/llm/cache.ts`

Best-effort wrapper around Gemini `cachedContent` API. Returns `null` on unsupported model (per spec Section 5.5 caveat). No automated tests — adapter only.

- [ ] **Step 1: Implement**

```ts
// packages/shared/src/llm/cache.ts
import { GoogleAICacheManager } from '@google/generative-ai/server';

export interface CreateCacheOpts {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[];
  ttlSeconds: number;
}

export interface CachedHandle {
  name: string; // cachedContents/...
  expireTime: string;
}

export async function tryCreateContextCache(
  opts: CreateCacheOpts,
): Promise<CachedHandle | null> {
  try {
    const mgr = new GoogleAICacheManager(opts.apiKey);
    const created = await mgr.create({
      model: `models/${opts.model}`,
      ...(opts.systemInstruction ? { systemInstruction: { role: 'system', parts: [{ text: opts.systemInstruction }] } } : {}),
      contents: opts.contents,
      ttlSeconds: opts.ttlSeconds,
    } as never);
    return {
      name: created.name ?? '',
      expireTime: created.expireTime ?? '',
    };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    // 400 = model doesn't support caching; 404 = not available; treat as unsupported.
    if (e.status === 400 || e.status === 404) return null;
    throw err;
  }
}

export async function deleteContextCache(apiKey: string, name: string): Promise<void> {
  try {
    const mgr = new GoogleAICacheManager(apiKey);
    await mgr.delete(name);
  } catch {
    // best-effort cleanup
  }
}
```

> Note: The `@google/generative-ai/server` import path and `GoogleAICacheManager` API are part of the official SDK as of 0.21+. If the import fails in your installed version, run `pnpm --filter @buddy/shared add @google/generative-ai@latest` and re-check. The fallback to `null` keeps query layer working even if the cache API changes.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes. If `GoogleAICacheManager` is not exported, comment out the implementation body and have both functions return `null` / `undefined` — query layer treats cache as best-effort. Document this in a code comment and proceed.

- [ ] **Step 3: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './llm/cache.js';
export * from './llm/gemini.js';
export * from './llm/pool.js';
export * from './llm/retry.js';
export * from './llm/stub.js';
export * from './llm/types.js';
export * from './logger.js';
export * from './paths.js';
export * from './schemas/api.js';
export * from './schemas/tree.js';
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/llm/cache.ts packages/shared/src/index.ts
git commit -m "feat(shared): add best-effort gemini context cache wrapper"
```

---

### Task 18: Implement `pdf.ts` mupdf Wrapper (TDD with Generated Fixture)

**Files:**
- Create: `packages/shared/test/fixtures/make-sample-pdf.ts`
- Create: `packages/shared/test/pdf.test.ts`
- Create: `packages/shared/src/pdf.ts`

`pdf.ts` exposes typed wrappers around `mupdf` (the npm package, MuPDF WASM). API: `openPdf(buffer) → PdfDoc`, `getPageText(doc, pageIndex)`, `getPageImage(doc, pageIndex, scale) → Buffer (PNG)`, `getPageCount(doc)`, `extractEmbeddedImages(doc, pageIndex) → {bbox, bytes, mime}[]`. We need a sample PDF for tests — generate one in-memory via `pdf-lib` so no binary fixture is committed.

- [ ] **Step 1: Add `pdf-lib` as a devDependency of @buddy/shared**

Run: `pnpm --filter @buddy/shared add -D pdf-lib@^1.17.1`
Expected: lockfile updated.

- [ ] **Step 2: Write fixture generator**

```ts
// packages/shared/test/fixtures/make-sample-pdf.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function makeSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < 3; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`Page ${i + 1}: Hello buddy ${i + 1}`, {
      x: 50,
      y: 550,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText('Sample body text used by mupdf tests.', {
      x: 50,
      y: 500,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return doc.save();
}
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/shared/test/pdf.test.ts
import { describe, expect, it } from 'vitest';
import { getPageCount, getPageImage, getPageText, openPdf } from '../src/pdf.js';
import { makeSamplePdf } from './fixtures/make-sample-pdf.js';

describe('pdf wrapper', () => {
  it('opens a PDF buffer and reports page count', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    expect(getPageCount(doc)).toBe(3);
  });

  it('extracts text containing expected page marker', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    const text = getPageText(doc, 0);
    expect(text).toContain('Page 1');
    expect(text).toContain('Hello buddy 1');
  });

  it('returns text per page independently', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    expect(getPageText(doc, 1)).toContain('Page 2');
    expect(getPageText(doc, 2)).toContain('Page 3');
  });

  it('renders a page to PNG bytes', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    const png = getPageImage(doc, 0, 1.0);
    // PNG magic header: 89 50 4E 47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
    expect(png.length).toBeGreaterThan(100);
  });

  it('throws on out-of-range page index', async () => {
    const bytes = await makeSamplePdf();
    const doc = openPdf(Buffer.from(bytes));
    expect(() => getPageText(doc, 99)).toThrow();
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

Run: `pnpm vitest run packages/shared/test/pdf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement**

```ts
// packages/shared/src/pdf.ts
import * as mupdf from 'mupdf';

export interface PdfDoc {
  readonly _doc: mupdf.PDFDocument;
}

export function openPdf(buffer: Buffer | Uint8Array): PdfDoc {
  const bytes = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf') as mupdf.PDFDocument;
  return { _doc: doc };
}

export function getPageCount(doc: PdfDoc): number {
  return doc._doc.countPages();
}

function assertPageIndex(doc: PdfDoc, pageIndex: number): void {
  const count = getPageCount(doc);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= count) {
    throw new RangeError(`pageIndex ${pageIndex} out of range [0, ${count - 1}]`);
  }
}

export function getPageText(doc: PdfDoc, pageIndex: number): string {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  try {
    const json = page.toStructuredText('preserve-whitespace').asJSON();
    const data = JSON.parse(json) as { blocks?: { lines?: { text?: string }[] }[] };
    const lines: string[] = [];
    for (const block of data.blocks ?? []) {
      for (const line of block.lines ?? []) {
        if (line.text) lines.push(line.text);
      }
    }
    return lines.join('\n');
  } finally {
    page.destroy();
  }
}

export function getPageImage(doc: PdfDoc, pageIndex: number, scale = 1.0): Buffer {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  try {
    const matrix = mupdf.Matrix.scale(scale, scale);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    try {
      const png = pixmap.asPNG();
      return Buffer.from(png);
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

export interface EmbeddedImage {
  bbox: { x: number; y: number; w: number; h: number };
  bytes: Buffer;
  mime: string;
}

/**
 * Returns embedded image objects on the page using MuPDF StructuredText.
 * Used by the image-solution pipeline (plan #3). Returns [] when none.
 */
export function extractEmbeddedImages(doc: PdfDoc, pageIndex: number): EmbeddedImage[] {
  assertPageIndex(doc, pageIndex);
  const page = doc._doc.loadPage(pageIndex);
  try {
    const json = page.toStructuredText('preserve-images').asJSON();
    const data = JSON.parse(json) as {
      blocks?: {
        type?: string;
        bbox?: [number, number, number, number];
        image?: { data?: string; mimeType?: string };
      }[];
    };
    const out: EmbeddedImage[] = [];
    for (const b of data.blocks ?? []) {
      if (b.type === 'image' && b.bbox && b.image?.data && b.image.mimeType) {
        const [x0, y0, x1, y1] = b.bbox;
        out.push({
          bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
          bytes: Buffer.from(b.image.data, 'base64'),
          mime: b.image.mimeType,
        });
      }
    }
    return out;
  } finally {
    page.destroy();
  }
}
```

> **mupdf API note:** The `mupdf` npm package (≥1.3) exposes `Document.openDocument`, `PDFDocument.loadPage`, `Page.toStructuredText`, `Page.toPixmap`, `Pixmap.asPNG`. If the installed minor version differs (e.g., method names like `getPixmap`), adjust call sites here — the tests pin the public contract. The conditional `embedded images` block depends on MuPDF emitting image blocks in `preserve-images` mode; if it returns empty for our sample PDF (which has no embedded images), tests for `extractEmbeddedImages` are intentionally absent in this plan and will be added in plan #3.

- [ ] **Step 6: Run test, verify it passes**

Run: `pnpm vitest run packages/shared/test/pdf.test.ts`
Expected: PASS (5 tests). The PNG-header assertion validates pixmap rendering works.

- [ ] **Step 7: Export from barrel**

Edit `packages/shared/src/index.ts`:

```ts
export * from './config.js';
export * from './ids.js';
export * from './llm/cache.js';
export * from './llm/gemini.js';
export * from './llm/pool.js';
export * from './llm/retry.js';
export * from './llm/stub.js';
export * from './llm/types.js';
export * from './logger.js';
export * from './paths.js';
export * from './pdf.js';
export * from './schemas/api.js';
export * from './schemas/tree.js';
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/pdf.ts packages/shared/src/index.ts packages/shared/test/pdf.test.ts packages/shared/test/fixtures/make-sample-pdf.ts packages/shared/package.json pnpm-lock.yaml
git commit -m "feat(shared): add mupdf wrapper for text + pixmap + embedded images"
```

---

### Task 19: Build, Lint, and Final Verification

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: passes across all packages.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All shared-package tests pass. Total count should match the sum from each task: 6 (ids) + 7 (paths) + 5 (config) + 5 (tree) + 2 (pool) + 10 (retry) + 5 (stub) + 5 (pdf) = **45 tests**.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: `packages/shared/dist/index.js`, `index.d.ts`, sourcemaps generated. No errors.

- [ ] **Step 4: Verify barrel re-exports**

Run inline check:

```bash
node --input-type=module --eval "import('@buddy/shared').then(m => console.log(Object.keys(m).sort().join('\\n')))" --experimental-vm-modules
```

You may need a different invocation depending on workspace linking. Alternative — read `packages/shared/dist/index.d.ts` and confirm it re-exports: `convId`, `docId`, `msgId`, `nodeId`, `runId`, `loadConfig`, `configSchema`, `createLogger`, `createLlmPool`, `withRetry`, `isRetryable`, `createStubGemini`, `createRealGemini`, `hashPrompt`, `tryCreateContextCache`, `deleteContextCache`, `openPdf`, `getPageCount`, `getPageText`, `getPageImage`, `extractEmbeddedImages`, `treeNodeSchema`, `docOutputSchema`, `topicSummarySchema`, `messageSchema`, `chatStreamReqSchema`, plus all resolve-path helpers and types.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: no errors. Warnings on `no-explicit-any` are OK (some SDK shims use `as never`).

- [ ] **Step 6: Final commit**

```bash
git add -A
git status   # confirm nothing unexpected
git commit --allow-empty -m "chore: foundation plan complete — @buddy/shared ready"
```

- [ ] **Step 7: Update memory note (for next session resume)**

Append to `C:\Users\pthai\.claude\projects\E--dev-space-AI-buddy-v2\memory\buddy-v2-project.md` under a new section:

```markdown
## Status (auto-updated)

- 2026-05-21: Plan 1 (`foundation`) complete. `@buddy/shared` shipped with config, logger, ids, paths, llm/{gemini, stub, retry, pool, cache, types}, pdf, schemas/{tree, api}. 45 tests passing.
```

(Or simply tell the user: "Foundation plan complete — when you return, ask for plan #2: `pipeline-text`.")

---

## Self-Review

### Spec coverage

| Spec section | Covered by tasks |
|--------------|------------------|
| 3.1 Repo layout | Tasks 1–6 |
| 3.3 Single source of truth (zod tree schema) | Task 11 |
| 8 `@buddy/shared` module layout | Tasks 6–18 |
| 9 Config + `.env` | Tasks 6 (deps), 9 (loader), `.env.example` |
| 10 Error handling — `withRetry` | Task 14 |
| 11 Testing — LLM stub | Task 15 |
| 12 Tooling — TS strict, ESM, tsx, tsup, biome, vitest | Tasks 2–5 |

Schemas for pipeline step IO (`schemas/pipeline.ts`) — **deferred to plan #2 (`pipeline-text`)** because each step's IO is best defined alongside its implementation. This is documented intent, not a gap.

### Placeholder scan
- No TBDs, no "implement later", no vague "handle errors".
- `llm/cache.ts` has a documented fallback path if SDK version mismatches (return null). This is a known-best-effort feature per spec Section 5.5, not a placeholder.
- `pdf.ts` `extractEmbeddedImages` has no automated test in this plan — explicitly deferred to plan #3 where real image fixtures arrive. Documented in note.

### Type consistency
- `Config` field names match consumers (`geminiApiKey`, `dataDir`, `maxConcurrentLlm`, etc.).
- `TreeNode` shape matches `invest-page-index/docs/README.md` output format.
- `GeminiClient` interface used identically by `stub.ts` and `gemini.ts`.

---

## Next Plan

After this plan ships, request `plan #2: pipeline-text` (Steps 1-10 of PageIndex + fallbacks + hierarchical agents + `apps/build-index` CLI).
