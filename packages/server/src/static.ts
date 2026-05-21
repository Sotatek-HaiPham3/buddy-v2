import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

export function staticRoutes(opts: { webDistDir?: string }): Hono {
  const app = new Hono();
  if (!opts.webDistDir || !fs.existsSync(opts.webDistDir)) return app;
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), opts.webDistDir) }));
  app.get('/*', (c) => c.html(fs.readFileSync(path.join(opts.webDistDir!, 'index.html'), 'utf8')));
  return app;
}
