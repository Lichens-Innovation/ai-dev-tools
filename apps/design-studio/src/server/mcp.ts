import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { DesignError } from './errors'
import type { Studio } from './studio'
import { compactWireframe, parseScene } from './wireframe'

const version = z
  .string()
  .regex(/^[a-z]$/)
  .describe('Proposal version: a (the proposal) or an alternate letter b..z')
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
        'List the design pages (components and screens): reference and proposal state, content hashes, alternate versions (b, c…), wireframes, and the width the page is laid out at.',
    },
    () => run(() => project.pages.list()),
  )

  server.registerTool(
    'get_page',
    {
      description:
        'Read a page. Returns { html, hash }; pass the hash back as baseHash when writing. A proposal has versions: "a" is the proposal itself (what implement-design implements), "b".."z" are alternates.',
      inputSchema: {
        ...pageShape,
        variant: z.enum(['reference', 'proposal']).default('proposal'),
        version: version.optional(),
      },
    },
    ({ kind, name, variant, version: v }) =>
      run(() => project.pages.read({ kind, name }, variant, v)),
  )

  server.registerTool(
    'create_alternate',
    {
      description:
        'Write a new alternate version of a page proposal (the full HTML), next to it with the next free letter (b, c…). When the page has no proposal yet, this writes the proposal itself (version a). Returns { version, hash }. The page may load only files under design/assets; start from get_page so the head and asset links stay right.',
      inputSchema: {
        ...pageShape,
        html: z.string().describe('The complete HTML document'),
      },
    },
    ({ kind, name, html }) =>
      run(() => project.pages.createAlternate({ kind, name }, html)),
  )

  server.registerTool(
    'list_wireframes',
    {
      description: "List a page's wireframes (Excalidraw drawings) by name.",
      inputSchema: pageShape,
    },
    ({ kind, name }) => run(() => project.wireframes.list({ kind, name })),
  )

  server.registerTool(
    'get_wireframe',
    {
      description:
        'Read a wireframe compactly: the page version it was generated from (base), its shapes (type, position, size, text, color; a generated shape has the selector of its page element as source, where that element was as origin and what the user changed: moved, resized, retexted; parent is the container shape it was generated in) and removed: the selectors of generated elements the user deleted. Shapes without a source were drawn by the user. Positions are page pixels.',
      inputSchema: {
        ...pageShape,
        wireframe: z.string().describe('The wireframe name, kebab-case'),
      },
    },
    ({ kind, name, wireframe }) =>
      run(async () =>
        compactWireframe(
          parseScene(
            (await project.wireframes.read({ kind, name }, wireframe)).json,
          ),
        ),
      ),
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
        'Write the full HTML of an existing page proposal version (default a, the proposal). References are read only and refused. baseHash is the hash from get_page or the last write; a stale one fails with Conflict. The page may load only files under design/assets. For a new version use create_alternate.',
      inputSchema: {
        ...pageShape,
        html: z.string().describe('The complete HTML document'),
        baseHash: z.string(),
        variant: z
          .enum(['proposal', 'reference'])
          .default('proposal')
          .describe('Only "proposal" is writable'),
        version: version.optional(),
      },
    },
    ({ kind, name, html, baseHash, variant, version: v }) =>
      run(() => {
        if (variant !== 'proposal')
          throw new DesignError(
            'Invalid',
            'References are read only: write the proposal',
          )
        return project.pages.saveProposal({ kind, name }, html, baseHash, v)
      }),
  )

  server.registerTool(
    'get_selection',
    {
      description:
        'What the user is looking at in the browser right now: the page, its view (reference, proposal version or wireframe) and the element they picked with its token trace (empty when nothing is open).',
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
        'List the "Make real" requests the user made from a wireframe (newest first): id, page, wireframe, status (pending, sent, done, failed), the number of selected shapes (0: the whole wireframe) and the version written. Pending and sent ones are waiting for you.',
      inputSchema: {
        status: z.enum(['pending', 'sent', 'done', 'failed']).optional(),
      },
    },
    ({ status }) =>
      run(async () =>
        (await project.requests.list({ status })).map((r) => ({
          id: r.id,
          page: r.page,
          wireframe: r.wireframe ?? null,
          status: r.status,
          shapes: r.shapeIds.length,
          ...(r.version ? { version: r.version } : {}),
          createdAt: r.createdAt,
        })),
      ),
  )

  server.registerTool(
    'get_sketch_request',
    {
      description:
        'Read a "Make real" request: the request, its wireframe as get_wireframe returns it (only the selected shapes when partial is true; removed is listed for a whole-wireframe request only) and a PNG of the selection. The wireframe\'s text is the user\'s design notes. Positions are page pixels; translate them into layout, never coordinates.',
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
        'Close a "Make real" request. done needs a short summary of what you wrote and the version you wrote it as (from create_alternate); the studio offers to open it. failed needs the reason. The wireframe is kept either way.',
      inputSchema: {
        id: z.string(),
        status: z.enum(['done', 'failed']),
        summary: z
          .string()
          .describe('Done: what you wrote. Failed: why it could not be done.'),
        version: version
          .optional()
          .describe(
            'Done: the proposal version written (b, c…; a if it was the first proposal)',
          ),
      },
    },
    ({ id, status, summary, version: v }) =>
      run(() =>
        project.requests.resolve(id, { status, note: summary, version: v }),
      ),
  )

  server.registerTool(
    'open_page',
    {
      description:
        'Tell the open browser to show a page: its reference, a proposal version, or a wireframe.',
      inputSchema: {
        ...pageShape,
        variant: z
          .enum(['reference', 'proposal', 'wireframe'])
          .default('proposal'),
        version: version.optional().describe('For a proposal; default a'),
        wireframe: z.string().optional().describe('For a wireframe: its name'),
      },
    },
    ({ kind, name, variant, version: v, wireframe }) =>
      run(async () => {
        const ref = { kind, name }
        if (variant === 'wireframe') {
          if (!wireframe)
            throw new DesignError('Invalid', 'Name the wireframe to open')
          await project.wireframes.read(ref, wireframe)
          hub.publish({
            type: 'open',
            kind,
            name,
            target: { view: 'wireframe', wireframe },
          })
        } else if (variant === 'reference') {
          await project.pages.read(ref, 'reference')
          hub.publish({
            type: 'open',
            kind,
            name,
            target: { view: 'reference' },
          })
        } else {
          await project.pages.read(ref, 'proposal', v)
          hub.publish({
            type: 'open',
            kind,
            name,
            target: { view: 'proposal', version: v ?? 'a' },
          })
        }
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
