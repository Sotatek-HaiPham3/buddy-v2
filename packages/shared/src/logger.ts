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
