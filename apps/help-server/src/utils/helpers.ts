import path from 'node:path'

// Re-exported from the shared package so existing `./helpers` imports keep working.
export { parseFrontmatter } from '@repo/claude-fs'

const PROJECT_ROOT = path.resolve(process.cwd(), '../..')
export const PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins')
export const RULES_DIR = path.join(PROJECT_ROOT, 'rules')
export const MARKETPLACE_JSON = path.join(PROJECT_ROOT, '.claude-plugin', 'marketplace.json')
export const DOCS_DIR = path.join(PROJECT_ROOT, 'docs')
