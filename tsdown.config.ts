/**
 * Standalone tsdown config for dsh-milestone, replicating the harness's
 * `clientBundle` preset essentials (packages/client/tsdown.client.ts) without
 * depending on the monorepo. Emits:
 *   - lib/index.js  — node half (ESM, empty apply)
 *   - lib/client.js — browser half (CJS closure registered through
 *                     `window.__ModuleLoader__.load({ id, factory })`)
 *
 * Externals mirror CLIENT_EXTERNALS = PLATFORM_MODULES + the runtime/client
 * exemption; they resolve from the web loader's module table at runtime.
 */
import { defineConfig } from 'tsdown'

const ID = 'dsh-milestone'

/** Platform modules the web loader provides (packages/client/web/src/platform.ts). */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** Externals answered by the loader module table. */
const CLIENT_EXTERNALS = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

export default defineConfig(() => [
  // Node half: the host cordis loader imports this row's module.
  {
    name: ID,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    // Keep the .js extension so package.json main/exports ("lib/index.js")
    // match the emitted artifact (harness preset sets this; it was missing).
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  // Browser half: closure bundle pinned to lib/client.js.
  {
    name: `${ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    external: CLIENT_EXTERNALS,
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
