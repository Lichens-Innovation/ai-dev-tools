/* The project is driven from MCP and HTTP: values reach it unchecked at runtime whatever their types say, so the
   guards below look redundant to the type checker. */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { createHash, randomBytes } from 'node:crypto'
import { watch as chokidarWatch } from 'chokidar'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  stat,
  unlink,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { conflict, invalid, notFound } from './errors'
import { nativeImport } from './native-import.mjs'
import { assertLoadsOnlyAssets, rebaseForScreenProposal } from './page-html'
import {
  compactWireframe,
  emptyScene,
  liveIds,
  parseScene,
  sceneJson,
} from './wireframe'
import type { CompactWireframe } from './wireframe'

export type PageKind = 'component' | 'screen'
export interface PageRef {
  kind: PageKind
  name: string
}
export type PageVariant = 'reference' | 'proposal'

/**
 * A proposal's version: `a` is the proposal itself (`<name>.html`, what design-loop implements), `b`..`z` are
 * alternates (`<name>.<v>.html`, next to it) made from wireframes, until one is promoted.
 */
export const VERSION = /^[a-z]$/
export const PROPOSAL = 'a'

export interface PageSummary extends PageRef {
  /** False for a blank page: one made from nothing, with no captured reference. */
  hasReference: boolean
  hasProposal: boolean
  referenceHash: string | null
  proposalHash: string | null
  /** The alternate versions (`b`, `c`…), in order. */
  alternates: string[]
  /** The page's wireframes, by name. */
  wireframes: string[]
  /** The width the page is laid out at: a screen's manifest viewport, else a default. */
  width: number
}

export type RequestStatus = 'pending' | 'sent' | 'done' | 'failed'

/**
 * A "Make real" request: ids and file references only, never free text taken from the page. The wireframe's text is
 * read by Claude through MCP (`get_sketch_request`), as the user's design notes.
 */
export interface SketchRequest {
  id: string
  page: PageRef
  /** The wireframe it was made from. Absent on requests from the old sketch layer. */
  wireframe?: string
  /** The selected shapes; empty: the whole wireframe. */
  shapeIds: string[]
  /** The PNG of the selection, in design/requests/. */
  png: string
  status: RequestStatus
  createdAt: string
  updatedAt: string
  /** What Claude said when it resolved the request: a summary (done) or a reason (failed). */
  resolution?: string
  /** The proposal version Claude wrote for it (`b`…, or `a` when the page had no proposal). */
  version?: string
}

export interface SketchRequestDetail {
  request: SketchRequest
  /** The wireframe (or the selected shapes of it) as it is now; null when it is gone. */
  wireframe: CompactWireframe | null
}

const DEFAULT_WIDTH = { component: 720, screen: 1280 } as const

export type PaletteInputs = Record<string, { lm: string; dm: string }>
export interface PaletteDraft {
  inputs: PaletteInputs
  tokens: Record<string, string>
  overrides: Record<string, string>
}
export interface PaletteCheck {
  m: string
  kind: string
  fg: string
  bg: string
  need: number
  val: number
  pass: boolean
  level: 'fail' | 'warn'
}
/** What the browser needs to theme a page and draw the palette cards for a draft, computed by the project's palette.ts. */
export interface Refs {
  light: Record<string, string>
  dark: Record<string, string>
}

export interface PalettePreview {
  /** The theme, its browser scheme block and the hand-authored tokens: inject it to re-theme a page. */
  css: string
  /** Every generated token, resolved per mode. */
  tokens: { name: string; light: string; dark: string }[]
  /** What each semantic token references per mode (`link` -> `primary-text`); tokens holding a value are absent. */
  refs: Refs
  /** The same without the overrides: what "auto" means for each semantic token. */
  autoRefs: Refs
  /** The intents: brand slots in order, then the status colors. */
  brand: string[]
  status: string[]
  audit: PaletteCheck[]
  /** Semantic tokens that can be re-pointed. */
  overridable: string[]
  /** Why the overrides were refused (they are ignored in `css` and `tokens`). */
  overrideErrors: string[]
  namespace: string | null
  /** Tailwind class names by role: [class name after the role prefix, token]. Null without a namespace. */
  classes: Record<'text' | 'bg' | 'border', [string, string][]> | null
  /** The card's other exports (its web export is `css`): mobile Tailwind and the inputs JSON. */
  exports: { mobile: string; inputs: string }
}

export interface PaletteState extends PaletteDraft {
  namespace: string | null
  audit: PaletteCheck[]
  hash: string
}

/** File events; `hash` is null when the file was deleted. */
export type DesignEvent =
  | {
      kind: 'page'
      name: string
      pageKind: PageKind
      variant: PageVariant
      /** The proposal version (`a`…); null for a reference. */
      version: string | null
      hash: string | null
    }
  | { kind: 'palette'; hash: string }
  | {
      kind: 'wireframe'
      name: string
      pageKind: PageKind
      wireframe: string
      hash: string | null
    }
  | { kind: 'request'; request: SketchRequest }

export interface DesignProject {
  root: string
  pages: {
    /** Every page with a reference, a proposal or a wireframe. */
    list: () => Promise<PageSummary[]>
    read: (
      ref: PageRef,
      variant: PageVariant,
      version?: string,
    ) => Promise<{ html: string; hash: string }>
    createProposal: (ref: PageRef) => Promise<{ hash: string }>
    /** A new page with no reference: an empty wireframe `main` to draw it on. */
    createBlank: (ref: PageRef) => Promise<{ wireframe: string; hash: string }>
    saveProposal: (
      ref: PageRef,
      html: string,
      baseHash: string,
      version?: string,
    ) => Promise<{ hash: string }>
    /** A new alternate (the next free letter); the proposal itself when the page has none yet. */
    createAlternate: (
      ref: PageRef,
      html: string,
    ) => Promise<{ version: string; hash: string }>
    /** The alternate becomes the proposal, and the proposal takes its letter. */
    promote: (ref: PageRef, version: string) => Promise<{ hash: string }>
    /** Deletes an alternate (never the proposal). */
    discard: (ref: PageRef, version: string) => Promise<void>
  }
  /** Wireframes: Excalidraw files in `design/wireframes/<components|screens>/<page>/<name>.excalidraw`. */
  wireframes: {
    list: (ref: PageRef) => Promise<string[]>
    read: (
      ref: PageRef,
      name: string,
    ) => Promise<{ json: string; hash: string }>
    /** `baseHash` null creates it (`Conflict` if it exists). */
    save: (
      ref: PageRef,
      name: string,
      json: string,
      baseHash: string | null,
    ) => Promise<{ hash: string }>
    remove: (ref: PageRef, name: string) => Promise<void>
  }
  /** "Make real" requests, kept in design/requests/ (git-ignored). */
  requests: {
    create: (input: {
      page: PageRef
      wireframe: string
      /** Empty: the whole wireframe. */
      shapeIds: string[]
      /** The PNG, base64. */
      png: string
    }) => Promise<SketchRequest>
    list: (filter?: {
      status?: RequestStatus
      page?: PageRef
    }) => Promise<SketchRequest[]>
    get: (id: string) => Promise<SketchRequestDetail>
    png: (id: string) => Promise<Buffer>
    /** The channel delivered it (pending -> sent). Later states are left alone. */
    markSent: (id: string) => Promise<SketchRequest>
    /** The wireframe stays; `version` records the proposal version written for it. */
    resolve: (
      id: string,
      outcome: { status: 'done' | 'failed'; note: string; version?: string },
    ) => Promise<SketchRequest>
  }
  palette: {
    read: () => Promise<PaletteState>
    save: (
      draft: PaletteDraft,
      baseHash: string,
    ) => Promise<{ audit: PaletteCheck[]; written: string[] }>
    /** Runs the palette engine on a draft without writing anything. */
    preview: (draft: PaletteDraft) => Promise<PalettePreview>
  }
  watch: (listener: (event: DesignEvent) => void) => () => void
  /** Resolves once the file watcher started by watch() is live: changes made after it are seen. */
  watching: () => Promise<void>
  close: () => Promise<void>
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const TOKEN_NAME = /^[a-z][a-z0-9-]*$/
const BRAND = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary']

const importPalette = (url: string): Promise<PaletteModule> => nativeImport(url)

interface PaletteModule {
  readThemeInputs: (css: string) => Partial<PaletteInputs>
  readExtras: (css: string) => [string, string][]
  fromInputs: (
    o: Partial<PaletteInputs>,
    overrides?: Record<string, string>,
  ) => any
  overridable: (p: any) => string[]
  overrideErrors: (p: any, o: Record<string, string>) => string[]
  splitExtras: (
    semantic: string[],
    decls: [string, string][],
  ) => {
    extras: [string, string][]
    overrides: Record<string, string>
    errors: string[]
  }
  runAudit: (p: any) => PaletteCheck[]
  withInputs: (css: string, o: PaletteInputs) => string
  withTokens: (css: string, extras: [string, string][]) => string
  withOverrides: (
    css: string,
    o: Record<string, string>,
    semantic: string[],
  ) => string
  buildWebCss: (p: any, extras?: [string, string][], from?: string) => string
  buildSchemeCss: (p: any) => string
  buildTailwindCss: (p: any, ns: string, themeCss: string) => string
  buildJson: (p: any) => string
  buildSass: (p: any, extras: [string, string][], from: string) => string
  namespacedNames: (
    p: any,
    ns: string,
  ) => { out: Record<'text' | 'bg' | 'border', [string, string][]> }
}

interface Manifest {
  palette?: {
    localPath: string
    outputs?: {
      web?: string | null
      scheme?: string | null
      mobile?: string | null
      json?: string | null
      sass?: string | null
    }
    script?: string | null
    namespace?: string | null
  }
  screens?: {
    mockupPath?: unknown
    proposalPath?: unknown
    viewport?: unknown
  }[]
}

export const hashOf = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex')

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeAtomic(
  file: string,
  content: string | Buffer,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(tmp, content)
    await rename(tmp, file)
  } catch (error) {
    await unlink(tmp).catch(() => undefined)
    throw error
  }
}

export function openProject(rootDir: string): DesignProject {
  const root = path.resolve(rootDir)
  const designDir = path.join(root, 'design')

  // --- pages -------------------------------------------------------------

  function assertRef(ref: PageRef): void {
    if (ref?.kind !== 'component' && ref?.kind !== 'screen')
      throw invalid(`Unknown page kind "${String(ref?.kind)}"`)
    if (typeof ref.name !== 'string' || !KEBAB.test(ref.name)) {
      throw invalid(
        `Page name "${String(ref.name)}" must be kebab-case (letters, digits, dashes), never a path`,
      )
    }
  }

  function assertVersion(version: string): void {
    if (typeof version !== 'string' || !VERSION.test(version))
      throw invalid(
        `Version "${String(version)}" must be one letter (a is the proposal)`,
      )
  }

  const proposalDir = (kind: PageKind) =>
    kind === 'component' ? 'proposals' : 'proposals/screens'

  /** Path of a page, relative to design/ (posix). The only place names turn into paths. */
  const relPath = (
    ref: PageRef,
    variant: PageVariant,
    version = PROPOSAL,
  ): string => {
    if (variant === 'reference')
      return `${ref.kind === 'component' ? 'components' : 'screens'}/${ref.name}.html`
    const suffix = version === PROPOSAL ? '' : `.${version}`
    return `${proposalDir(ref.kind)}/${ref.name}${suffix}.html`
  }
  const absPath = (ref: PageRef, variant: PageVariant, version = PROPOSAL) =>
    path.join(designDir, ...relPath(ref, variant, version).split('/'))

  async function readPage(
    ref: PageRef,
    variant: PageVariant,
    version = PROPOSAL,
  ) {
    assertRef(ref)
    if (variant !== 'reference' && variant !== 'proposal')
      throw invalid(`Unknown variant "${String(variant)}"`)
    if (variant === 'proposal') assertVersion(version)
    const html = await readIfExists(absPath(ref, variant, version))
    if (html === null)
      throw notFound(
        variant === 'proposal' && version !== PROPOSAL
          ? `No version ${version} of ${ref.kind} "${ref.name}"`
          : `No ${variant} for ${ref.kind} "${ref.name}"`,
      )
    return { html, hash: hashOf(html) }
  }

  async function filesIn(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(path.join(designDir, dir), {
        withFileTypes: true,
      })
      return entries.filter((e) => e.isFile()).map((e) => e.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  const namesIn = async (dir: string) =>
    (await filesIn(dir))
      .filter((n) => n.endsWith('.html'))
      .map((n) => n.slice(0, -'.html'.length))
      .filter((n) => KEBAB.test(n))

  /** The alternates of every page in a proposals folder: name -> versions, sorted. */
  async function alternatesIn(dir: string): Promise<Map<string, string[]>> {
    const found = new Map<string, string[]>()
    for (const file of (await filesIn(dir)).sort()) {
      const m = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.([b-z])\.html$/.exec(file)
      if (m) found.set(m[1], [...(found.get(m[1]) ?? []), m[2]])
    }
    return found
  }

  /** The screens' widths from the manifest viewports (`"1440x900"`), by page name. */
  async function screenWidths(): Promise<Map<string, number>> {
    const widths = new Map<string, number>()
    try {
      const manifest = JSON.parse(
        (await readIfExists(path.join(root, 'design.manifest.json'))) ?? '{}',
      ) as Manifest
      for (const row of manifest.screens ?? []) {
        const width = /^(\d{3,4})x\d+$/.exec(String(row.viewport ?? ''))?.[1]
        if (!width) continue
        for (const p of [row.mockupPath, row.proposalPath])
          if (typeof p === 'string')
            widths.set(path.posix.basename(p, '.html'), Number(width))
      }
    } catch {
      // A bad manifest only costs the widths.
    }
    return widths
  }

  async function writeVersion(ref: PageRef, version: string, html: string) {
    if (typeof html !== 'string') throw invalid('html must be a string')
    assertLoadsOnlyAssets(html, proposalDir(ref.kind))
    await writeAtomic(absPath(ref, 'proposal', version), html)
    return { hash: hashOf(html) }
  }

  const pages: DesignProject['pages'] = {
    async list() {
      const kinds: PageKind[] = ['component', 'screen']
      const widths = await screenWidths()
      const lists = await Promise.all(
        kinds.map(async (kind) => {
          const [references, proposals, alternates, drawn] = await Promise.all([
            namesIn(kind === 'component' ? 'components' : 'screens'),
            namesIn(proposalDir(kind)),
            alternatesIn(proposalDir(kind)),
            wireframePages(kind),
          ])
          // A page with no reference is a blank page: drawn from nothing.
          const names = [
            ...new Set([
              ...references,
              ...proposals,
              ...alternates.keys(),
              ...drawn,
            ]),
          ].sort()
          return Promise.all(
            names.map(async (name): Promise<PageSummary> => {
              const ref = { kind, name }
              const reference = await readPage(ref, 'reference').catch(
                () => null,
              )
              const proposal = await readPage(ref, 'proposal').catch(() => null)
              return {
                kind,
                name,
                hasReference: reference !== null,
                hasProposal: proposal !== null,
                referenceHash: reference?.hash ?? null,
                proposalHash: proposal?.hash ?? null,
                alternates: alternates.get(name) ?? [],
                wireframes: await wireframes.list(ref),
                width:
                  (kind === 'screen' ? widths.get(name) : undefined) ??
                  DEFAULT_WIDTH[kind],
              }
            }),
          )
        }),
      )
      return lists.flat()
    },

    read: readPage,

    async createProposal(ref) {
      const reference = await readPage(ref, 'reference')
      if (existsSync(absPath(ref, 'proposal')))
        throw conflict(
          `A proposal for ${ref.kind} "${ref.name}" already exists`,
        )
      const html =
        ref.kind === 'screen'
          ? rebaseForScreenProposal(reference.html)
          : reference.html
      await writeAtomic(absPath(ref, 'proposal'), html)
      return { hash: hashOf(html) }
    },

    async createBlank(ref) {
      assertRef(ref)
      const taken =
        existsSync(absPath(ref, 'reference')) ||
        existsSync(absPath(ref, 'proposal')) ||
        (await wireframes.list(ref)).length > 0
      if (taken)
        throw conflict(
          `${ref.kind} "${ref.name}" already exists: open it instead`,
        )
      const width = DEFAULT_WIDTH[ref.kind]
      const { hash } = await wireframes.save(
        ref,
        'main',
        sceneJson(emptyScene({ width })),
        null,
      )
      return { wireframe: 'main', hash }
    },

    async saveProposal(ref, html, baseHash, version = PROPOSAL) {
      const current = await readPage(ref, 'proposal', version)
      if (current.hash !== baseHash) {
        throw conflict(
          `${ref.kind} "${ref.name}" changed since it was read (hash ${current.hash.slice(0, 8)}…)`,
        )
      }
      return writeVersion(ref, version, html)
    },

    async createAlternate(ref, html) {
      assertRef(ref)
      if (!existsSync(absPath(ref, 'proposal')))
        return {
          version: PROPOSAL,
          ...(await writeVersion(ref, PROPOSAL, html)),
        }
      const version = 'bcdefghijklmnopqrstuvwxyz'
        .split('')
        .find((v) => !existsSync(absPath(ref, 'proposal', v)))
      if (!version)
        throw conflict(
          `${ref.kind} "${ref.name}" has 25 alternates: discard some first`,
        )
      return { version, ...(await writeVersion(ref, version, html)) }
    },

    async promote(ref, version) {
      assertVersion(version)
      if (version === PROPOSAL) throw invalid('Version a is the proposal')
      const alternate = await readPage(ref, 'proposal', version)
      const proposal = await readPage(ref, 'proposal')
      await writeAtomic(absPath(ref, 'proposal'), alternate.html)
      await writeAtomic(absPath(ref, 'proposal', version), proposal.html)
      return { hash: alternate.hash }
    },

    async discard(ref, version) {
      assertVersion(version)
      if (version === PROPOSAL)
        throw invalid('The proposal itself cannot be discarded here')
      await readPage(ref, 'proposal', version)
      await unlink(absPath(ref, 'proposal', version))
    },
  }

  // --- wireframes --------------------------------------------------------

  const wireframeDir = (ref: PageRef) =>
    path.join(
      designDir,
      'wireframes',
      ref.kind === 'component' ? 'components' : 'screens',
      ref.name,
    )

  function wireframeFile(ref: PageRef, name: string) {
    assertRef(ref)
    if (typeof name !== 'string' || !KEBAB.test(name))
      throw invalid(
        `Wireframe name "${String(name)}" must be kebab-case (letters, digits, dashes)`,
      )
    return path.join(wireframeDir(ref), `${name}.excalidraw`)
  }

  /** The pages of a kind that have a wireframe folder. */
  async function wireframePages(kind: PageKind): Promise<string[]> {
    try {
      const dir = path.join(
        designDir,
        'wireframes',
        kind === 'component' ? 'components' : 'screens',
      )
      const entries = await readdir(dir, { withFileTypes: true })
      const pagesWithFiles = await Promise.all(
        entries
          .filter((e) => e.isDirectory() && KEBAB.test(e.name))
          .map(async (e) =>
            (await wireframes.list({ kind, name: e.name })).length
              ? e.name
              : null,
          ),
      )
      return pagesWithFiles.filter((n): n is string => n !== null)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async function readWireframe(ref: PageRef, name: string) {
    const json = await readIfExists(wireframeFile(ref, name))
    if (json === null)
      throw notFound(`No wireframe "${name}" for ${ref.kind} "${ref.name}"`)
    return { json, hash: hashOf(json) }
  }

  const wireframes: DesignProject['wireframes'] = {
    async list(ref) {
      assertRef(ref)
      try {
        const entries = await readdir(wireframeDir(ref), {
          withFileTypes: true,
        })
        return entries
          .filter((e) => e.isFile() && e.name.endsWith('.excalidraw'))
          .map((e) => e.name.slice(0, -'.excalidraw'.length))
          .filter((n) => KEBAB.test(n))
          .sort()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
    },

    read: readWireframe,

    async save(ref, name, json, baseHash) {
      const file = wireframeFile(ref, name)
      parseScene(json)
      const current = await readIfExists(file)
      if (baseHash === null) {
        if (current !== null)
          throw conflict(`Wireframe "${name}" already exists`)
      } else if (current === null) {
        throw notFound(`No wireframe "${name}" for ${ref.kind} "${ref.name}"`)
      } else if (hashOf(current) !== baseHash) {
        throw conflict(
          `Wireframe "${name}" changed since it was read (hash ${hashOf(current).slice(0, 8)}…)`,
        )
      }
      await writeAtomic(file, json)
      return { hash: hashOf(json) }
    },

    async remove(ref, name) {
      await readWireframe(ref, name)
      await unlink(wireframeFile(ref, name))
    },
  }

  // --- requests ----------------------------------------------------------

  const requestsDir = path.join(designDir, 'requests')
  const REQUEST_ID = /^rq-[0-9a-f]{8}$/
  const PNG_MAGIC = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  const MAX_PNG_BYTES = 12 * 1024 * 1024
  const SHAPE_ID = /^[A-Za-z0-9_-]{1,64}$/

  const requestFile = (id: string, ext: 'json' | 'png') => {
    if (typeof id !== 'string' || !REQUEST_ID.test(id))
      throw invalid(`Bad request id "${String(id)}"`)
    return path.join(requestsDir, `${id}.${ext}`)
  }

  async function readRequest(id: string): Promise<SketchRequest> {
    const text = await readIfExists(requestFile(id, 'json'))
    if (text === null) throw notFound(`No sketch request "${id}"`)
    return JSON.parse(text) as SketchRequest
  }

  // Updates of one request are read-modify-write: one at a time, so "sent" never overwrites "done".
  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn)
    chain = next.catch(() => undefined)
    return next
  }

  const emit = (event: DesignEvent) => {
    for (const listener of [...listeners]) listener(event)
  }

  async function writeRequest(request: SketchRequest) {
    await writeAtomic(
      requestFile(request.id, 'json'),
      JSON.stringify(request, null, 2) + '\n',
    )
    emit({ kind: 'request', request })
  }

  const requests: DesignProject['requests'] = {
    create: ({ page, wireframe, shapeIds, png }) =>
      serial(async () => {
        const scene = parseScene((await readWireframe(page, wireframe)).json)
        if (
          !Array.isArray(shapeIds) ||
          shapeIds.length > 5000 ||
          !shapeIds.every((id) => typeof id === 'string' && SHAPE_ID.test(id))
        )
          throw invalid('shapeIds must list at most 5000 shape ids')
        const known = liveIds(scene)
        if (known.size === 0) throw invalid('The wireframe is empty')
        const missing = shapeIds.filter((id) => !known.has(id))
        if (missing.length)
          throw invalid(
            `Shapes not in the saved wireframe (save it first): ${missing.slice(0, 5).join(', ')}`,
          )
        if (typeof png !== 'string') throw invalid('png must be base64')
        const bytes = Buffer.from(png, 'base64')
        if (bytes.length > MAX_PNG_BYTES) throw invalid('The PNG is too big')
        if (!bytes.subarray(0, 8).equals(PNG_MAGIC))
          throw invalid('png is not a PNG image')
        const id = `rq-${randomBytes(4).toString('hex')}`
        const now = new Date().toISOString()
        const request: SketchRequest = {
          id,
          page: { kind: page.kind, name: page.name },
          wireframe,
          shapeIds: [...new Set(shapeIds)],
          png: `${id}.png`,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        }
        await mkdir(requestsDir, { recursive: true })
        // The folder ignores itself: requests are working files, not part of the design.
        await writeFile(path.join(requestsDir, '.gitignore'), '*\n', {
          flag: 'wx',
        }).catch(() => undefined)
        await writeAtomic(requestFile(id, 'png'), bytes)
        await writeRequest(request)
        return request
      }),

    async list(filter = {}) {
      let names: string[]
      try {
        names = await readdir(requestsDir)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
      const all = await Promise.all(
        names
          .filter((n) => n.endsWith('.json'))
          .map((n) =>
            readRequest(n.slice(0, -'.json'.length)).catch(() => null),
          ),
      )
      return all
        .filter((r): r is SketchRequest => r !== null)
        .filter((r) => !filter.status || r.status === filter.status)
        .filter(
          (r) =>
            !filter.page ||
            (r.page.kind === filter.page.kind &&
              r.page.name === filter.page.name),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async get(id) {
      const request = await readRequest(id)
      if (!request.wireframe) return { request, wireframe: null }
      const current = await readWireframe(
        request.page,
        request.wireframe,
      ).catch(() => null)
      return {
        request,
        wireframe: current
          ? compactWireframe(parseScene(current.json), request.shapeIds)
          : null,
      }
    },

    async png(id) {
      const request = await readRequest(id)
      return readFile(requestFile(request.id, 'png'))
    },

    markSent: (id) =>
      serial(async () => {
        const request = await readRequest(id)
        if (request.status !== 'pending') return request
        const next = {
          ...request,
          status: 'sent' as const,
          updatedAt: new Date().toISOString(),
        }
        await writeRequest(next)
        return next
      }),

    resolve: (id, outcome) =>
      serial(async () => {
        const request = await readRequest(id)
        if (request.status === 'done' || request.status === 'failed')
          throw conflict(`Request ${id} is already ${request.status}`)
        if (outcome?.status !== 'done' && outcome?.status !== 'failed')
          throw invalid('status must be "done" or "failed"')
        const note = typeof outcome.note === 'string' ? outcome.note.trim() : ''
        if (!note)
          throw invalid(
            outcome.status === 'done'
              ? 'A done request needs a short summary'
              : 'A failed request needs a reason',
          )
        const version = outcome.version
        if (version !== undefined) {
          assertVersion(version)
          // The version must exist: it is what the studio opens from the request.
          await readPage(request.page, 'proposal', version)
        }
        const next: SketchRequest = {
          ...request,
          status: outcome.status,
          resolution: note.slice(0, 1000),
          ...(version !== undefined ? { version } : {}),
          updatedAt: new Date().toISOString(),
        }
        await writeRequest(next)
        return next
      }),
  }

  // --- palette -----------------------------------------------------------

  async function loadPaletteSetup() {
    const manifestText = await readIfExists(
      path.join(root, 'design.manifest.json'),
    )
    if (manifestText === null)
      throw notFound('design.manifest.json not found in the project')
    let manifest: Manifest
    try {
      manifest = JSON.parse(manifestText) as Manifest
    } catch {
      throw invalid('design.manifest.json is not valid JSON')
    }
    const pal = manifest.palette
    if (!pal?.localPath) throw notFound('The manifest has no palette')
    if (!pal.script)
      throw notFound('The manifest palette has no script (palette.script)')
    const inContext = (p: string) => {
      const abs = path.resolve(root, p)
      if (abs !== root && !abs.startsWith(root + path.sep))
        throw invalid(`Manifest path "${p}" is outside the project`)
      return abs
    }
    const inputsFile = inContext(pal.localPath)
    const scriptFile = inContext(pal.script)
    const st = await stat(scriptFile).catch(() => null)
    if (!st) throw notFound(`palette script not found: ${pal.script}`)
    const mod = await importPalette(
      `${pathToFileURL(scriptFile).href}?v=${st.mtimeMs}`,
    )
    const outputs = Object.fromEntries(
      Object.entries(pal.outputs ?? {})
        .filter(([, v]) => typeof v === 'string' && v !== '')
        .map(([k, v]) => [k, inContext(v as string)]),
    ) as {
      web?: string
      scheme?: string
      mobile?: string
      json?: string
      sass?: string
    }
    return { pal, mod, inputsFile, outputs, namespace: pal.namespace ?? null }
  }

  function analyse(mod: PaletteModule, css: string) {
    const inputs = mod.readThemeInputs(css)
    const missing = ['primary', 'secondary', 'font', 'background'].filter(
      (n) => !inputs[n],
    )
    if (missing.length)
      throw invalid(`Missing required palette inputs: ${missing.join(', ')}`)
    const decls = mod.readExtras(css)
    const semantic =
      inputs.font && inputs.background
        ? mod.overridable(mod.fromInputs(inputs))
        : []
    const { extras, overrides, errors } = mod.splitExtras(semantic, decls)
    if (errors.length) throw invalid(errors.join('\n'))
    return { inputs: inputs as PaletteInputs, extras, overrides }
  }

  /** The draft's inputs, checked and normalised. */
  function cleanInputs(draft: PaletteDraft): PaletteInputs {
    const inputs: PaletteInputs = {}
    for (const [name, value] of Object.entries(draft?.inputs ?? {})) {
      if (!TOKEN_NAME.test(name)) throw invalid(`Bad input name "${name}"`)
      for (const mode of ['lm', 'dm'] as const) {
        if (typeof value?.[mode] !== 'string' || !HEX.test(value[mode])) {
          throw invalid(
            `--${name}-${mode}: "${String(value?.[mode])}" is not a hex color (#rgb or #rrggbb)`,
          )
        }
      }
      inputs[name] = {
        lm: value.lm.toLowerCase(),
        dm: value.dm.toLowerCase(),
      }
    }
    const missing = ['primary', 'secondary', 'font', 'background'].filter(
      (n) => !inputs[n],
    )
    if (missing.length)
      throw invalid(`Missing required palette inputs: ${missing.join(', ')}`)
    return inputs
  }

  /** The inputs file's hand-authored tokens with the draft's values; a token the file lacks is refused. */
  function mergeTokens(
    current: [string, string][],
    draft: PaletteDraft,
  ): [string, string][] {
    const known = new Set(current.map(([n]) => n))
    for (const [name, value] of Object.entries(draft.tokens ?? {})) {
      if (!known.has(name))
        throw invalid(
          `--${name} is not a hand-authored token of the inputs file`,
        )
      if (typeof value !== 'string' || !value.trim() || /[;{}]/.test(value)) {
        throw invalid(
          `--${name}: token values cannot be empty or contain ; { }`,
        )
      }
    }
    return current.map(([n, v]): [string, string] => {
      const next = draft.tokens?.[n]
      return [n, next === undefined ? v : next.replace(/\s+/g, ' ').trim()]
    })
  }

  const palette: DesignProject['palette'] = {
    async read() {
      const { mod, inputsFile, namespace } = await loadPaletteSetup()
      const css = await readIfExists(inputsFile)
      if (css === null) throw notFound('The palette inputs file does not exist')
      const { inputs, extras, overrides } = analyse(mod, css)
      const audit = mod.runAudit(mod.fromInputs(inputs, overrides))
      return {
        inputs,
        tokens: Object.fromEntries(extras),
        overrides,
        namespace,
        audit,
        hash: hashOf(css),
      }
    },

    async save(draft, baseHash) {
      const { mod, inputsFile, outputs, namespace } = await loadPaletteSetup()
      const css = await readIfExists(inputsFile)
      if (css === null) throw notFound('The palette inputs file does not exist')
      if (hashOf(css) !== baseHash)
        throw conflict('The palette inputs changed since they were read')

      const current = analyse(mod, css)
      const inputs = cleanInputs(draft)
      const extras = mergeTokens(current.extras, draft)

      const overrides = { ...(draft.overrides ?? {}) }
      const p = mod.fromInputs(inputs, overrides)
      const overrideErrors = mod.overrideErrors(p, overrides)
      if (overrideErrors.length)
        throw invalid(`Invalid token overrides:\n${overrideErrors.join('\n')}`)
      if (outputs.mobile && !namespace)
        throw invalid(
          'The manifest palette needs a namespace for the mobile output',
        )

      const written: string[] = []
      const rel = (file: string) =>
        path.relative(root, file).split(path.sep).join('/')
      const write = async (file: string, content: string) => {
        await writeAtomic(file, content)
        written.push(rel(file))
      }

      await write(
        inputsFile,
        mod.withOverrides(
          mod.withTokens(mod.withInputs(css, inputs), extras),
          overrides,
          mod.overridable(p),
        ),
      )

      // Same outputs, in the same order, as `palette.ts <inputs> --theme/--web --scheme --mobile --json --sass`.
      const theme = outputs.web
      const scheme = outputs.scheme
      const mobile = outputs.mobile
      if (theme) {
        const themeCss =
          theme === inputsFile
            ? mod.buildWebCss(p, extras)
            : mod
                .buildWebCss(p, extras, rel(inputsFile))
                .replace(
                  /^\/\*[^]*?\*\//,
                  `/* Generated by design-palette/scripts/palette.ts from ${rel(inputsFile)}. Do not edit: change the inputs there and re-run.\n   Plain values and var() only, so web and React Native (NativeWind) can share this file. */`,
                )
        await write(
          theme,
          themeCss +
            (scheme === theme ? '\n\n' + mod.buildSchemeCss(p) : '') +
            '\n',
        )
      }
      if (scheme && scheme !== theme)
        await write(scheme, mod.buildSchemeCss(p) + '\n')
      if (mobile && namespace) {
        await write(
          mobile,
          mod.buildTailwindCss(
            p,
            namespace,
            mobile === inputsFile ? mod.buildWebCss(p, extras) : '',
          ) + '\n',
        )
      }
      if (outputs.json) await write(outputs.json, mod.buildJson(p) + '\n')
      if (outputs.sass)
        await write(
          outputs.sass,
          mod.buildSass(p, extras, rel(inputsFile)) + '\n',
        )

      return { audit: mod.runAudit(p), written }
    },

    async preview(draft) {
      const { mod, inputsFile, namespace } = await loadPaletteSetup()
      const css = await readIfExists(inputsFile)
      if (css === null) throw notFound('The palette inputs file does not exist')
      const current = analyse(mod, css)
      const inputs = cleanInputs(draft)
      const extras = mergeTokens(current.extras, draft)
      let overrides = { ...(draft.overrides ?? {}) }
      const errors = mod.overrideErrors(mod.fromInputs(inputs), overrides)
      const refused = errors.length > 0
      if (refused) overrides = {}
      const p = mod.fromInputs(inputs, overrides)

      const webCss = mod.buildWebCss(p, extras)
      const tokens = JSON.parse(mod.buildJson(p)) as Record<
        string,
        { light: string; dark: string }
      >
      // What a semantic token references is only in the generated stylesheet: `--link: var(--primary-text);`.
      const refsOf = (sheet: string): Refs => {
        const [lightPart = '', darkPart = ''] = sheet.split(
          '@media (prefers-color-scheme: dark)',
        )
        const refsIn = (block: string) =>
          Object.fromEntries(
            [
              ...block.matchAll(
                /^\s*--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\);$/gm,
              ),
            ]
              .filter(([, , target]) => !/-(?:lm|dm|light|dark)$/.test(target))
              .map(([, name, target]) => [name, target]),
          )
        const light = refsIn(lightPart)
        return { light, dark: { ...light, ...refsIn(darkPart) } }
      }
      const refs = refsOf(webCss)
      const autoRefs = Object.keys(overrides).length
        ? refsOf(mod.buildWebCss(mod.fromInputs(inputs), extras))
        : refs
      const base = ['font', 'font-inverted', 'background', 'border']
      const names = Object.keys(inputs)
      return {
        css: webCss + '\n\n' + mod.buildSchemeCss(p),
        tokens: Object.entries(tokens).map(([name, v]) => ({ name, ...v })),
        refs,
        autoRefs,
        brand: BRAND.filter((n) => names.includes(n)),
        status: names.filter((n) => !BRAND.includes(n) && !base.includes(n)),
        audit: mod.runAudit(p),
        overridable: mod.overridable(mod.fromInputs(inputs)),
        overrideErrors: refused ? errors : [],
        namespace,
        classes: namespace ? mod.namespacedNames(p, namespace).out : null,
        exports: {
          mobile: namespace
            ? mod.buildTailwindCss(p, namespace, webCss)
            : '/* No Tailwind namespace yet: set palette.namespace in design.manifest.json. */',
          inputs: JSON.stringify(inputs, null, 2),
        },
      }
    },
  }

  // --- watch -------------------------------------------------------------

  const listeners = new Set<(event: DesignEvent) => void>()
  let watcher: ReturnType<typeof chokidarWatch> | null = null
  const lastHash = new Map<string, string>()

  async function paletteInputsPath(): Promise<string | null> {
    try {
      return (await loadPaletteSetup()).inputsFile
    } catch {
      return null
    }
  }

  function wireframeOf(
    file: string,
  ): Omit<Extract<DesignEvent, { kind: 'wireframe' }>, 'hash'> | null {
    const rel = path.relative(designDir, file).split(path.sep).join('/')
    const m = rel.match(
      /^wireframes\/(components|screens)\/([a-z0-9-]+)\/([a-z0-9-]+)\.excalidraw$/,
    )
    if (!m) return null
    return {
      kind: 'wireframe',
      name: m[2],
      pageKind: m[1] === 'components' ? 'component' : 'screen',
      wireframe: m[3],
    }
  }

  function pageOf(
    file: string,
  ): Omit<Extract<DesignEvent, { kind: 'page' }>, 'hash'> | null {
    const rel = path.relative(designDir, file).split(path.sep).join('/')
    const m = rel.match(
      /^(components|screens|proposals|proposals\/screens)\/([a-z0-9-]+?)(?:\.([b-z]))?\.html$/,
    )
    if (!m) return null
    const variant: PageVariant = m[1].startsWith('proposals')
      ? 'proposal'
      : 'reference'
    if (variant === 'reference' && m[3]) return null
    const pageKind: PageKind =
      m[1] === 'components' || m[1] === 'proposals' ? 'component' : 'screen'
    return {
      kind: 'page',
      name: m[2],
      pageKind,
      variant,
      version: variant === 'proposal' ? (m[3] ?? PROPOSAL) : null,
    }
  }

  async function onChange(file: string, inputsFile: string | null) {
    let content: string | null
    try {
      content = await readFile(file, 'utf8')
    } catch {
      content = null
    }
    const hash = content === null ? null : hashOf(content)
    if (lastHash.get(file) === hash) return
    if (hash === null) lastHash.delete(file)
    else lastHash.set(file, hash)
    const page = pageOf(file)
    const wf = wireframeOf(file)
    const event: DesignEvent | null =
      file === inputsFile
        ? hash === null
          ? null
          : { kind: 'palette', hash }
        : page
          ? { ...page, hash }
          : wf
            ? { ...wf, hash }
            : null
    if (event) emit(event)
  }

  async function startWatching() {
    const inputsFile = await paletteInputsPath()
    const targets = [designDir, ...(inputsFile ? [inputsFile] : [])]
    const w = chokidarWatch(targets, {
      ignoreInitial: true,
      ignored: (p) => p.endsWith('.tmp'),
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
    })
    const handler = (file: string) =>
      void onChange(path.resolve(file), inputsFile)
    w.on('add', handler).on('change', handler).on('unlink', handler)
    watcher = w
    await new Promise<void>((resolve) => w.once('ready', () => resolve()))
  }

  let starting: Promise<void> | null = null

  return {
    root,
    pages,
    wireframes,
    requests,
    palette,
    watching: () => starting ?? Promise.resolve(),
    watch(listener) {
      listeners.add(listener)
      starting ??= startWatching()
      return () => {
        listeners.delete(listener)
      }
    },
    async close() {
      await starting?.catch(() => undefined)
      await watcher?.close()
      watcher = null
      starting = null
      listeners.clear()
    },
  }
}
