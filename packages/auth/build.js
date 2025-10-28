import { build } from 'esbuild';
import { execSync } from 'child_process';

// First, run TypeScript to generate type definitions
console.log('Generating TypeScript definitions...');
execSync('tsc --emitDeclarationOnly', { stdio: 'inherit' });

// Build ESM version (for React applications)
console.log('Building ESM version...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.mjs',
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  external: ['react', 'react-dom', 'clsx'],
  sourcemap: true,
});

// Build CJS version (for compatibility)
console.log('Building CommonJS version...');
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs',
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  external: ['react', 'react-dom', 'clsx'],
  sourcemap: true,
});

console.log('Auth package build complete!');