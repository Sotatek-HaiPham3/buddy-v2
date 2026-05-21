import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: './tsconfig.build.json' },
  clean: true,
  sourcemap: true,
  target: 'node20',
});
