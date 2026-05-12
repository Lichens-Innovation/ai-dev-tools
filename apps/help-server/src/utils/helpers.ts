import { readFile } from 'node:fs/promises'
import path from 'node:path'

const HOME = process.env.HOME || ''
export const CLAUDE_DIR = path.join(HOME, '.claude')
const PROJECT_ROOT = path.resolve(process.cwd(), '../..')
export const PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins')
export const RULES_DIR = path.join(PROJECT_ROOT, 'rules')
export const MARKETPLACE_JSON = path.join(
  PROJECT_ROOT,
  '.claude-plugin',
  'marketplace.json',
)
export const DOCS_DIR = path.join(PROJECT_ROOT, 'docs')

export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    value = value.replace(/^["']|["']$/g, '')
    result[key] = value
  }
  return result
}

export async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}
