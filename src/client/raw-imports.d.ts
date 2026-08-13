/**
 * Ambient typing for Vite's `?raw` query imports (vitest provides the string
 * at runtime). TypeScript 6 does not auto-include @types/* in this project,
 * and a wildcard module declaration cannot live inside a module file, so it
 * sits here as a global script declaration.
 */
declare module '*?raw' {
  const src: string
  export default src
}
