import { createServerFn } from '@tanstack/react-start'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DOCS_DIR } from './helpers'

export interface ClaudeCommand {
  command: string
  description: string
}

export const getClaudeCodeCommands = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ClaudeCommand[]> => {
    try {
      const content = await readFile(
        path.join(DOCS_DIR, 'claude-code.md'),
        'utf-8',
      )
      const commands: ClaudeCommand[] = []
      const rows = content.match(/^\|\s*`[^`]+`[^|]*\|[^|]+\|/gm) ?? []
      for (const row of rows) {
        const cells = row
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
        if (cells.length < 2) continue
        const cmd = cells[0].replace(/`/g, '').trim()
        const desc = cells[1].trim()
        if (cmd && desc && !cmd.startsWith('-')) {
          commands.push({ command: cmd, description: desc })
        }
      }
      return commands
    } catch {
      return []
    }
  },
)
