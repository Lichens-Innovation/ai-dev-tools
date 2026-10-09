// Node's own dynamic import, out of the bundler's reach: a project's palette.ts must run exactly as its `palette`
// script runs it (Node strips the types), and Vite's transform cannot parse it. Vitest loads this file as an
// external module (vitest.config.ts) so the call below really is Node's.
export const nativeImport = new Function('url', 'return import(url)')
