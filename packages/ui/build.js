import { build } from 'esbuild';
import { execSync } from 'child_process';

// First, run TypeScript to generate type definitions
console.log('Generating TypeScript definitions...');
execSync('tsc --emitDeclarationOnly', { stdio: 'inherit' });

// Build ESM version
console.log('Building ESM version...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.mjs',
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  external: ['react', 'react-dom', '@vibetree/core', '@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-serialize', '@xterm/addon-unicode11', '@xterm/addon-web-links', 'clsx'],
  sourcemap: true,
});

// Build CJS version
console.log('Building CommonJS version...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs',
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  external: ['react', 'react-dom', '@vibetree/core', '@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search', '@xterm/addon-serialize', '@xterm/addon-unicode11', '@xterm/addon-web-links', 'clsx'],
  sourcemap: true,
});

console.log('Build complete!');