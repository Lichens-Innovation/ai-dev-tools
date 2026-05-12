import { createServerFn } from '@tanstack/react-start'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const DOCS_DIR = path.resolve(process.cwd(), '../docs')

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : fallback
}

export interface DocMeta {
  slug: string
  title: string
}

export interface DocSection {
  slug: string
  docTitle: string
  headingId: string
  headingText: string
  bodyText: string
}

export const listDocs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DocMeta[]> => {
    const files = await readdir(DOCS_DIR)
    const mdFiles = files.filter((f) => f.endsWith('.md'))
    const docs = await Promise.all(
      mdFiles.map(async (file) => {
        const slug = file.replace('.md', '')
        const content = await readFile(path.join(DOCS_DIR, file), 'utf-8')
        return { slug, title: extractTitle(content, slug) }
      }),
    )
    return docs.sort((a, b) => a.title.localeCompare(b.title))
  },
)

export const getDocContent = createServerFn({ method: 'GET' })
  .inputValidator((data: string) => data)
  .handler(async ({ data }): Promise<{ content: string; title: string }> => {
    const slug = data
    if (
      !slug ||
      typeof slug !== 'string' ||
      slug.includes('/') ||
      slug.includes('.')
    ) {
      throw new Error('Invalid slug')
    }
    const filePath = path.join(DOCS_DIR, `${slug}.md`)
    const content = await readFile(filePath, 'utf-8')
    return { content, title: extractTitle(content, slug) }
  },
)

export const getAllDocsForSearch = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DocSection[]> => {
    const files = await readdir(DOCS_DIR)
    const mdFiles = files.filter((f) => f.endsWith('.md'))
    const sections: DocSection[] = []

    for (const file of mdFiles) {
      const slug = file.replace('.md', '')
      const content = await readFile(path.join(DOCS_DIR, file), 'utf-8')
      const docTitle = extractTitle(content, slug)
      const lines = content.split('\n')

      let currentHeading = { id: '', text: docTitle }
      let bodyLines: string[] = []

      const flush = () => {
        if (bodyLines.length > 0) {
          sections.push({
            slug,
            docTitle,
            headingId: currentHeading.id,
            headingText: currentHeading.text,
            bodyText: bodyLines.join('\n').trim(),
          })
        }
        bodyLines = []
      }

      for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
        if (headingMatch) {
          flush()
          const text = headingMatch[2].trim()
          currentHeading = { id: slugify(text), text }
        } else {
          bodyLines.push(line)
        }
      }
      flush()
    }

    return sections
  },
)
