import type { Logger } from '@buddy/shared';

export interface LoggerOpts { logger: Logger; step: string; }

export async function withLogger<T>(opts: LoggerOpts, fn: () => Promise<T>): Promise<T> {
  const { logger, step } = opts;
  const t0 = Date.now();
  logger.info({ step, phase: 'start' }, `[${step}] start`);
  try {
    const r = await fn();
    logger.info({ step, phase: 'end', ms: Date.now() - t0 }, `[${step}] end`);
    return r;
  } catch (err) {
    logger.error({ step, phase: 'error', err }, `[${step}] error`);
    throw err;
  }
}
