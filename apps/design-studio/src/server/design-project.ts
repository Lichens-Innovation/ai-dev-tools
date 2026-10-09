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

export type PageKind = 'component' | 'screen'
export interface PageRef {
  kind: PageKind
  name: string
}
export type PageVariant = 'reference' | 'proposal'

export interface PageSummary extends PageRef {
  hasProposal: boolean
  referenceHash: string
  proposalHash: string | null
}

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
export interface PaletteState extends PaletteDraft {
  namespace: string | null
  audit: PaletteCheck[]
  hash: string
}

export type DesignEvent =
  | {
      kind: 'page'
      name: string
      pageKind: PageKind
      variant: PageVariant
      hash: string
    }
  | { kind: 'palette'; hash: string }

export interface DesignProject {
  root: string
  pages: {
    list: () => Promise<PageSummary[]>
    read: (
      ref: PageRef,
      variant: PageVariant,
    ) => Promise<{ html: string; hash: string }>
    createProposal: (ref: PageRef) => Promise<{ hash: string }>
    saveProposal: (
      ref: PageRef,
      html: string,
      baseHash: string,
    ) => Promise<{ hash: string }>
  }
  palette: {
    read: () => Promise<PaletteState>
    save: (
      draft: PaletteDraft,
      baseHash: string,
    ) => Promise<{ audit: PaletteCheck[]; written: string[] }>
  }
  watch: (listener: (event: DesignEvent) => void) => () => void
  /** Resolves once the file watcher started by watch() is live: changes made after it are seen. */
  watching: () => Promise<void>
  close: () => Promise<void>
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const TOKEN_NAME = /^[a-z][a-z0-9-]*$/

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

async function writeAtomic(file: string, content: string): Promise<void> {
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

  /** Path of a page, relative to design/ (posix). The only place names turn into paths. */
  const relPath = (ref: PageRef, variant: PageVariant): string => {
    if (variant === 'reference')
      return `${ref.kind === 'component' ? 'components' : 'screens'}/${ref.name}.html`
    return `${ref.kind === 'component' ? 'proposals' : 'proposals/screens'}/${ref.name}.html`
  }
  const absPath = (ref: PageRef, variant: PageVariant) =>
    path.join(designDir, ...relPath(ref, variant).split('/'))

  async function readPage(ref: PageRef, variant: PageVariant) {
    assertRef(ref)
    const html = await readIfExists(absPath(ref, variant))
    if (html === null)
      throw notFound(`No ${variant} for ${ref.kind} "${ref.name}"`)
    return { html, hash: hashOf(html) }
  }

  async function namesIn(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(path.join(designDir, dir), {
        withFileTypes: true,
      })
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.html'))
        .map((e) => e.name.slice(0, -'.html'.length))
        .filter((n) => KEBAB.test(n))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  const pages: DesignProject['pages'] = {
    async list() {
      const kinds: PageKind[] = ['component', 'screen']
      const lists = await Promise.all(
        kinds.map(async (kind) => {
          const names = (
            await namesIn(kind === 'component' ? 'components' : 'screens')
          ).sort()
          return Promise.all(
            names.map(async (name): Promise<PageSummary> => {
              const ref = { kind, name }
              const reference = await readPage(ref, 'reference')
              const proposal = await readPage(ref, 'proposal').catch(() => null)
              return {
                kind,
                name,
                hasProposal: proposal !== null,
                referenceHash: reference.hash,
                proposalHash: proposal?.hash ?? null,
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

    async saveProposal(ref, html, baseHash) {
      const current = await readPage(ref, 'proposal')
      if (typeof html !== 'string') throw invalid('html must be a string')
      const pageDir = path.posix.dirname(relPath(ref, 'proposal'))
      assertLoadsOnlyAssets(html, pageDir)
      if (current.hash !== baseHash) {
        throw conflict(
          `${ref.kind} "${ref.name}" changed since it was read (hash ${current.hash.slice(0, 8)}…)`,
        )
      }
      await writeAtomic(absPath(ref, 'proposal'), html)
      return { hash: hashOf(html) }
    },
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

      const knownTokens = new Set(current.extras.map(([n]) => n))
      const tokenEntries = Object.entries(draft.tokens ?? {})
      for (const [name, value] of tokenEntries) {
        if (!knownTokens.has(name))
          throw invalid(
            `--${name} is not a hand-authored token of the inputs file`,
          )
        if (typeof value !== 'string' || !value.trim() || /[;{}]/.test(value)) {
          throw invalid(
            `--${name}: token values cannot be empty or contain ; { }`,
          )
        }
      }
      const extras = current.extras.map(([n, v]): [string, string] => {
        const next = draft.tokens?.[n]
        return [n, next === undefined ? v : next.replace(/\s+/g, ' ').trim()]
      })

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

  function pageOf(
    file: string,
  ): Omit<Extract<DesignEvent, { kind: 'page' }>, 'hash'> | null {
    const rel = path.relative(designDir, file).split(path.sep).join('/')
    const m = rel.match(
      /^(components|screens|proposals|proposals\/screens)\/([a-z0-9-]+)\.html$/,
    )
    if (!m) return null
    const variant: PageVariant = m[1].startsWith('proposals')
      ? 'proposal'
      : 'reference'
    const pageKind: PageKind =
      m[1] === 'components' || m[1] === 'proposals' ? 'component' : 'screen'
    return { kind: 'page', name: m[2], pageKind, variant }
  }

  async function onChange(file: string, inputsFile: string | null) {
    let content: string
    try {
      content = await readFile(file, 'utf8')
    } catch {
      return
    }
    const hash = hashOf(content)
    if (lastHash.get(file) === hash) return
    lastHash.set(file, hash)
    const page = pageOf(file)
    const event: DesignEvent | null =
      file === inputsFile
        ? { kind: 'palette', hash }
        : page
          ? { ...page, hash }
          : null
    if (event) for (const listener of [...listeners]) listener(event)
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
    w.on('add', handler).on('change', handler)
    watcher = w
    await new Promise<void>((resolve) => w.once('ready', () => resolve()))
  }

  let starting: Promise<void> | null = null

  return {
    root,
    pages,
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
