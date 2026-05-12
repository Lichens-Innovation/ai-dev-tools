import { createServerFn } from '@tanstack/react-start'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { RULES_DIR, parseFrontmatter } from './helpers'

export interface RuleInfo {
  filename: string
  name: string
  paths: string[]
  description: string
}

export const getRules = createServerFn({ method: 'GET' }).handler(
  async (): Promise<RuleInfo[]> => {
    try {
      const files = await readdir(RULES_DIR)
      const mdFiles = files.filter((f) => f.endsWith('.md'))
      const rules: RuleInfo[] = []
      for (const file of mdFiles) {
        const content = await readFile(path.join(RULES_DIR, file), 'utf-8')
        const fm = parseFrontmatter(content)
        const firstHeading =
          content.match(/^#\s+(.+)/m)?.[1]?.trim() ?? file.replace('.md', '')
        const pathsRaw = fm.paths
        const paths = pathsRaw
          ? pathsRaw
              .replace(/^\[|\]$/g, '')
              .split(',')
              .map((p) => p.trim().replace(/^["']|["']$/g, ''))
              .filter(Boolean)
          : []
        rules.push({
          filename: file,
          name: firstHeading,
          paths,
          description: fm.description,
        })
      }
      return rules
    } catch {
      return []
    }
  },
)
