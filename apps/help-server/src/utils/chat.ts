import { createServerFn } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { isPluginInstalled } from '@repo/claude-fs'

// Resolves to monorepo root regardless of cwd (works locally and in Docker)
const PROJECT_ROOT = path.resolve(new URL(import.meta.url).pathname, '../../../../..')

const HISTORY_PATH = path.join(os.tmpdir(), 'claude-chat-history.md')

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

async function readHistory(): Promise<ChatHistoryEntry[]> {
  try {
    const content = await readFile(HISTORY_PATH, 'utf-8')
    if (!content.trim()) return []
    const entries: ChatHistoryEntry[] = []
    const blocks = content.split('\n---\n')
    for (const block of blocks) {
      const trimmed = block.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('User: ')) {
        entries.push({ role: 'user', content: trimmed.slice(6).trim() })
      } else if (trimmed.startsWith('Assistant: ')) {
        entries.push({ role: 'assistant', content: trimmed.slice(11).trim() })
      }
    }
    return entries
  } catch {
    return []
  }
}

async function appendToHistory(entry: ChatHistoryEntry) {
  const prefix = entry.role === 'user' ? 'User: ' : 'Assistant: '
  const block = prefix + entry.content + '\n---\n'
  try {
    await writeFile(HISTORY_PATH, block, { flag: 'a' })
  } catch {
    // Non-critical: history may be lost on container restart as designed
  }
}

async function clearHistoryFile() {
  try {
    await writeFile(HISTORY_PATH, '', { flag: 'w' })
  } catch {
    // Non-critical
  }
}

async function isSuperHelpAvailable(): Promise<boolean> {
  return isPluginInstalled('ai-tools-manager@lichens-ai-dev-tools')
}

function buildPrompt(message: string, history: ChatHistoryEntry[]): string {
  if (history.length === 0) {
    return `Use the /super-help skill to answer the user's question: ${message}`
  }

  const historyText = history
    .map((entry) => {
      const prefix = entry.role === 'user' ? 'User' : 'Assistant'
      return `${prefix}: ${entry.content}`
    })
    .join('\n\n')

  return `Use the /super-help skill to answer the user's question: ${message}. Before this question, the following exchange was captured in the history.md file:\n\n${historyText}`
}

export const checkSuperHelpAvailable = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => {
    return isSuperHelpAvailable()
  },
)

export interface ChatResponse {
  response: string
  error?: string
  skillAvailable: boolean
}

export const sendChatMessage = createServerFn({ method: 'POST' })
  .inputValidator((data: { message: string }) => data)
  .handler(async ({ data }): Promise<ChatResponse> => {
    const skillAvailable = await isSuperHelpAvailable()
    if (!skillAvailable) {
      return {
        response: '',
        error:
          'The /super-help skill is not available. Install it with: claude plugin install ai-tools-manager@lichens-ai-dev-tools',
        skillAvailable: false,
      }
    }

    const history = await readHistory()
    const prompt = buildPrompt(data.message, history)

    // Append user message to history before calling claude
    await appendToHistory({ role: 'user', content: data.message })

    try {
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          'claude',
          ['-p', prompt, '--add-dir', PROJECT_ROOT],
          { timeout: 120000, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) => {
            if (err) {
              const nodeErr = err as NodeJS.ErrnoException
              reject(Object.assign(new Error(stderr || err.message), { code: nodeErr.code }))
            } else {
              resolve(stdout)
            }
          },
        )
      })

      const response = output.trim()
      await appendToHistory({ role: 'assistant', content: response })

      return { response, skillAvailable: true }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { response: '', error: 'CLAUDE_NOT_FOUND', skillAvailable: true }
      }
      const errorMsg = e instanceof Error ? e.message : String(e)
      return {
        response: '',
        error: `Claude command failed: ${errorMsg}`,
        skillAvailable: true,
      }
    }
  })

export const getChatHistory = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ChatHistoryEntry[]> => {
    return readHistory()
  },
)

export const clearChatHistory = createServerFn({ method: 'POST' }).handler(
  async (): Promise<void> => {
    await clearHistoryFile()
  },
)
