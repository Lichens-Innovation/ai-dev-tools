import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

/* Pages are static snapshots, yet served from the studio's own origin, where a script could call /mcp. The studio
   drives the iframes from the parent page, which this policy does not limit. */
const PAGE_POLICY = "script-src 'none'; object-src 'none'; form-action 'none'"

/** Serves a raw file of the project's design/ folder (a page or an asset), for iframes and Playwright. */
export async function renderFile(
  designDir: string,
  splat: string,
): Promise<Response> {
  const notFound = () => new Response('Not found', { status: 404 })
  let rel: string
  try {
    rel = decodeURIComponent(splat)
  } catch {
    return notFound()
  }
  const parts = rel.split('/').filter(Boolean)
  if (
    parts.length === 0 ||
    parts.some(
      (p) =>
        p === '..' || p.startsWith('.') || p.includes('\0') || p.includes('\\'),
    )
  ) {
    return notFound()
  }
  const type = TYPES[path.extname(rel).toLowerCase()]
  if (!type) return notFound()
  try {
    const base = await realpath(designDir)
    const file = await realpath(path.join(base, ...parts))
    if (!file.startsWith(base + path.sep)) return notFound()
    const body = await readFile(file)
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Content-Security-Policy': PAGE_POLICY,
      },
    })
  } catch {
    return notFound()
  }
}
