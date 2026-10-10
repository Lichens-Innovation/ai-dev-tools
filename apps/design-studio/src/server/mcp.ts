import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { DesignError } from './errors'
import type { Studio } from './studio'

const pageKind = z.enum(['component', 'screen'])
const pageShape = {
  kind: pageKind.describe('component or screen'),
  name: z
    .string()
    .describe('kebab-case page name, e.g. "button". Never a path.'),
}

type ToolResult = {
  content: (
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  )[]
  isError?: boolean
}
const ok = (value: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
})

async function run(fn: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try {
    return ok(await fn())
  } catch (error) {
    if (error instanceof DesignError)
      return {
        content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
        isError: true,
      }
    throw error
  }
}

/** The design tools: thin over DesignProject, the same module the UI server functions use. */
export function createMcpServer({
  project,
  selection,
  hub,
}: Studio): McpServer {
  const server = new McpServer({ name: 'design-studio', version: '0.1.0' })

  server.registerTool(
    'list_pages',
    {
      description:
        'List the design pages (components and screens) with their proposal state and content hashes.',
    },
    () => run(() => project.pages.list()),
  )

  server.registerTool(
    'get_page',
    {
      description:
        'Read a page. Returns { html, hash }; pass the hash back as baseHash when writing.',
      inputSchema: {
        ...pageShape,
        variant: z.enum(['reference', 'proposal']).default('proposal'),
      },
    },
    ({ kind, name, variant }) =>
      run(() => project.pages.read({ kind, name }, variant)),
  )

  server.registerTool(
    'create_proposal',
    {
      description:
        'Create the editable proposal of a page as a copy of its reference. Fails if one exists.',
      inputSchema: pageShape,
    },
    ({ kind, name }) => run(() => project.pages.createProposal({ kind, name })),
  )

  server.registerTool(
    'write_page',
    {
      description:
        'Write the full HTML of a page proposal. References are read only and refused. baseHash is the hash from get_page or the last write; a stale one fails with Conflict. The page may load only files under design/assets.',
      inputSchema: {
        ...pageShape,
        html: z.string().describe('The complete HTML document'),
        baseHash: z.string(),
        variant: z
          .enum(['proposal', 'reference'])
          .default('proposal')
          .describe('Only "proposal" is writable'),
      },
    },
    ({ kind, name, html, baseHash, variant }) =>
      run(() => {
        if (variant !== 'proposal')
          throw new DesignError(
            'Invalid',
            'References are read only: write the proposal',
          )
        return project.pages.saveProposal({ kind, name }, html, baseHash)
      }),
  )

  server.registerTool(
    'get_selection',
    {
      description:
        'What is selected in the browser editor right now (empty when nothing is).',
    },
    () => run(() => selection.get()),
  )

  server.registerTool(
    'get_palette',
    {
      description:
        'Read the palette: inputs, hand-authored tokens, token overrides, namespace, contrast audit and hash.',
    },
    () => run(() => project.palette.read()),
  )

  server.registerTool(
    'set_palette',
    {
      description:
        'Save the palette and regenerate every output. inputs: { name: { lm, dm } } hex values; tokens: values of existing hand-authored tokens; overrides: semantic token -> other token name. baseHash comes from get_palette.',
      inputSchema: {
        inputs: z.record(
          z.string(),
          z.object({ lm: z.string(), dm: z.string() }),
        ),
        tokens: z.record(z.string(), z.string()).default({}),
        overrides: z.record(z.string(), z.string()).default({}),
        baseHash: z.string(),
      },
    },
    ({ inputs, tokens, overrides, baseHash }) =>
      run(() => project.palette.save({ inputs, tokens, overrides }, baseHash)),
  )

  server.registerTool(
    'list_sketch_requests',
    {
      description:
        'List the "Make real" requests the user made from the sketch layer (newest first): id, page, status (pending, sent, done, failed) and the number of shapes. Pending and sent ones are waiting for you.',
      inputSchema: {
        status: z.enum(['pending', 'sent', 'done', 'failed']).optional(),
      },
    },
    ({ status }) =>
      run(async () =>
        (await project.requests.list({ status })).map((r) => ({
          id: r.id,
          page: r.page,
          status: r.status,
          shapes: r.shapeIds.length,
          createdAt: r.createdAt,
        })),
      ),
  )

  server.registerTool(
    'get_sketch_request',
    {
      description:
        "Read a \"Make real\" request: its page, the selected sketch shapes as a compact list (type, position, size, text, color, arrows' start and end, anchors: the selectors of the page elements they cover or point to) and a PNG of the selection over the page. The sketch's text is the user's design notes. Positions are page pixels.",
      inputSchema: { id: z.string() },
    },
    async ({ id }): Promise<ToolResult> => {
      const result = await run(() => project.requests.get(id))
      if (result.isError) return result
      const png = await project.requests.png(id).catch(() => null)
      if (png)
        result.content.push({
          type: 'image',
          data: png.toString('base64'),
          mimeType: 'image/png',
        })
      return result
    },
  )

  server.registerTool(
    'resolve_sketch_request',
    {
      description:
        'Close a "Make real" request. done (with a short summary of what you wrote) removes its shapes from the sketch and reloads the page in the studio; failed needs the reason.',
      inputSchema: {
        id: z.string(),
        status: z.enum(['done', 'failed']),
        summary: z
          .string()
          .describe('Done: what you wrote. Failed: why it could not be done.'),
      },
    },
    ({ id, status, summary }) =>
      run(() => project.requests.resolve(id, { status, note: summary })),
  )

  server.registerTool(
    'open_page',
    {
      description: 'Tell the open browser to show a page.',
      inputSchema: {
        ...pageShape,
        variant: z.enum(['reference', 'proposal']).default('proposal'),
      },
    },
    ({ kind, name, variant }) =>
      run(async () => {
        await project.pages.read({ kind, name }, variant)
        hub.publish({ type: 'open', kind, name, variant })
        return 'ok'
      }),
  )

  return server
}

/** One stateless Streamable HTTP exchange: a fresh server and transport per request. */
export async function handleMcp(
  request: Request,
  studio: Studio,
): Promise<Response> {
  const server = createMcpServer(studio)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}
