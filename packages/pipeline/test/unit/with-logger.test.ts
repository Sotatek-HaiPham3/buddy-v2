import { describe, expect, it, vi } from 'vitest';
import { withLogger } from '../../src/wrappers/with-logger.js';

describe('withLogger', () => {
  it('logs start + end, returns result', async () => {
    const info = vi.fn();
    const logger = { info, child: () => ({ info } as never) } as never;
    const r = await withLogger({ logger, step: 'step01' }, async () => 42);
    expect(r).toBe(42);
    expect(info).toHaveBeenCalledTimes(2);
    expect(info.mock.calls[0]?.[0]).toMatchObject({ step: 'step01', phase: 'start' });
    expect(info.mock.calls[1]?.[0]).toMatchObject({ step: 'step01', phase: 'end' });
  });

  it('logs error + rethrows', async () => {
    const error = vi.fn();
    const logger = { info: vi.fn(), error, child: () => ({} as never) } as never;
    await expect(withLogger({ logger, step: 's' }, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(error).toHaveBeenCalled();
  });
});
