import { GoogleAICacheManager } from '@google/generative-ai/server';

export interface CreateCacheOpts {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[];
  ttlSeconds: number;
}

export interface CachedHandle {
  name: string;
  expireTime: string;
}

export async function tryCreateContextCache(opts: CreateCacheOpts): Promise<CachedHandle | null> {
  try {
    const mgr = new GoogleAICacheManager(opts.apiKey);
    const created = await mgr.create({
      model: `models/${opts.model}`,
      ...(opts.systemInstruction
        ? { systemInstruction: { role: 'system', parts: [{ text: opts.systemInstruction }] } }
        : {}),
      contents: opts.contents,
      ttlSeconds: opts.ttlSeconds,
    } as never);
    return {
      name: created.name ?? '',
      expireTime: created.expireTime ?? '',
    };
  } catch (err) {
    const e = err as { status?: number; message?: string };
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
