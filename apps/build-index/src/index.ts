import { buildCli } from './cli.js';
buildCli().parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});
