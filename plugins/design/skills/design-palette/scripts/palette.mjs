#!/usr/bin/env node
// design-palette generator: reads the canonical --name-lm / --name-dm inputs, writes the web and/or Tailwind theme,
// syncs inputs with the Claude Design palette card, and prints a contrast audit. Zero dependencies. Node 20+.

const BRAND = ['primary','secondary','tertiary','quaternary','quinary'];
const FALLBACK = { tertiary:'primary', quaternary:'secondary', quinary:'primary' };
const PRESETS = {
  plum:    { brand:[['#401f3e','#8a5585'],['#3f2e56','#705e9b'],['#453f78','#7d76c9'],['#759aab','#8fb3c3'],['#faf2a1','#f3ea94']], font:['#1f1a24','#eee8f0'], background:['#fbfaf8','#17131a'] },
  triad:   { brand:[['#1d3557','#486c9b'],['#d92b3c','#ef5d68'],['#a8dadc','#a8dadc']], font:['#16202b','#e8eef3'], background:['#f9fafb','#10161d'] },
  twoTone: { brand:[['#0f5c4d','#2f9c84'],['#e8a33d','#eeb356']], font:['#17211f','#e9efec'], background:['#fafaf7','#0f1513'] }
};
const STATUS = { info:['#2f6fde','#5b93f0'], danger:['#d33a3a','#ef6461'], success:['#237a4b','#4cb47a'], warning:['#d99a17','#e8b53c'] };
const STEPS = ['faint','soft','','strong','intense'];
const rgb = h => { h = h.replace('#',''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const lum = h => { const [r,g,b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
const onColor = h => ratio(h,'#ffffff') >= ratio(h,'#14111a') ? '#ffffff' : '#14111a';
const cap = s => s[0].toUpperCase() + s.slice(1);
const pair = ([light, dark]) => ({ light, dark });
const mapObj = (o, fn) => Object.fromEntries(Object.entries(o).map(([k,v]) => [k, fn(v)]));
const fromPreset = key => { const p = PRESETS[key] || PRESETS.plum; return { brand:p.brand.map(pair), font:pair(p.font), fontInverted:pair(p.background), background:pair(p.background), border:{ light: mixHex(p.font[0],14,p.background[0]), dark: mixHex(p.font[1],14,p.background[1]) }, status:mapObj(STATUS, pair) }; };

const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const fromLin = v => { v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
function hexToLab(h) {
  const [r,g,b] = rgb(h).map(toLin);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b), m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b), s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.7936177850*m - 0.0040720468*s, 1.9779984951*l - 2.4285922050*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.8086757660*s];
}
function labToHex([L,a,b]) {
  const l = (L + 0.3963377774*a + 0.2158037573*b) ** 3, m = (L - 0.1055613458*a - 0.0638541728*b) ** 3, s = (L - 0.0894841775*a - 1.2914855480*b) ** 3;
  return '#' + [4.0767416621*l - 3.3077115913*m + 0.2309699292*s, -1.2684380046*l + 2.6097574011*m - 0.3413193965*s, -0.0041960863*l - 0.7034186147*m + 1.7076147010*s].map(fromLin).map(v => v.toString(16).padStart(2,'0')).join('');
}
const SCALE = ['faint','soft','strong','intense'];
const STEPS_LM = {
  faint:   [l => 0.97, 0.3, '0.97', 'calc(c * 0.3)'],
  soft:    [l => 0.91, 0.55, '0.91', 'calc(c * 0.55)'],
  strong:  [l => Math.min(0.5, l * 0.8), 1, 'min(0.5, calc(l * 0.8))', 'c'],
  intense: [l => Math.min(0.35, l * 0.6), 0.9, 'min(0.35, calc(l * 0.6))', 'calc(c * 0.9)']
};
const STEPS_DM = {
  strong:  [l => Math.max(0.75, l + (1 - l) * 0.35), 0.9, 'max(0.75, calc(l + (1 - l) * 0.35))', 'calc(c * 0.9)'],
  intense: [l => Math.max(0.88, l + (1 - l) * 0.6), 0.6, 'max(0.88, calc(l + (1 - l) * 0.6))', 'calc(c * 0.6)']
};
const DM_MIX = { faint:16, soft:30 };
const relHex = (hex, d) => { const [L,a,b] = hexToLab(hex); return labToHex([d[0](L), a * d[1], b * d[1]]); };
const mixHex = (x, pct, y) => { const A = hexToLab(x), B = hexToLab(y), t = pct / 100; return labToHex(A.map((v,i) => v * t + B[i] * (1 - t))); };
function srcOf(p, n) { const i = BRAND.indexOf(n); if (i < 0) return n; return p.brand[i] ? n : srcOf(p, FALLBACK[n]); }
function baseHex(p, n, m) {
  if (BRAND.includes(n)) return p.brand[BRAND.indexOf(srcOf(p, n))][m];
  if (n === 'font' || n === 'background' || n === 'border') return p[n][m];
  if (n === 'font-inverted') return p.fontInverted[m];
  return p.status[n][m];
}
function scaleHex(p, n, m, st) {
  const x = baseHex(p, n, m);
  if (m === 'light') return relHex(x, STEPS_LM[st]);
  return DM_MIX[st] ? mixHex(x, DM_MIX[st], p.background.dark) : relHex(x, STEPS_DM[st]);
}
const onRef = (p, n, m) => { const x = baseHex(p,n,m); return ratio(x, p.font[m]) >= ratio(x, p.fontInverted[m]) ? 'text' : 'text-inverted'; };
const families = p => [...BRAND, ...Object.keys(p.status)];
const hoverMix = (hex, st, active) => ({ sign: hexToLab(hex)[0] > 0.78 ? -1 : 1, d: active ? 0.12 : 0.07 });
function resolver(p, m) { const T = Object.fromEntries(tokensFor(p, m)); return k => { let v = T[k], g = 0; while (v && v.startsWith('var(--color-') && g++ < 10) v = T[v.slice(12, -1)]; return v; }; }
function runAudit(p) {
  const out = [];
  ['light','dark'].forEach(m => {
    const r = resolver(p, m);
    const ints = intentsOf(p).filter(k => !BRAND.includes(k) || p.brand[BRAND.indexOf(k)]);
    const add = (kind, fg, bg, need, level = 'fail') => {
      const a = r(fg), b = r(bg); if (!a || !b) return;
      const val = kind === 'state' ? Math.abs(hexToLab(a)[0] - hexToLab(b)[0]) : ratio(a, b);
      out.push({ m, kind, fg, bg, a, b, need, val, pass: val >= need, level });
    };
    ints.forEach(k => { const lx = hexToLab(r(k))[0]; if (lx > 0.9) out.push({ m, kind:'input', fg:k, bg:'bg', a:r(k), b:r('bg'), need:0.9, val:lx, pass:false, level:'warn' }); });
    const hueOf = x => { const [, a, b2] = hexToLab(x); return { h: (Math.atan2(b2, a) * 180 / Math.PI + 360) % 360, c: Math.hypot(a, b2), l: hexToLab(x)[0] }; };
    ints.filter(k => BRAND.includes(k)).forEach(k => Object.keys(p.status).forEach(st => {
      const A = hueOf(r(k)), B = hueOf(r(st)); if (A.c < 0.04 || B.c < 0.04) return;
      const dh = Math.min(Math.abs(A.h - B.h), 360 - Math.abs(A.h - B.h)), dl = Math.abs(A.l - B.l);
      if (dh < 25 && dl < 0.2) out.push({ m, kind:'hue', fg:k, bg:st, a:r(k), b:r(st), need:25, val:dh, pass:false, level:'warn' });
    }));
    ints.forEach(k => { add('text', k + '-text', k + '-bg', 4.5); add('text', 'text-on-' + k, k, 4.5); add('state', k + '-hover', k, 0.04); add('state', k + '-bg-hover', k + '-bg', 0.04); add('brand', k, 'bg', 3, 'warn'); });
    ['bg','bg-elevated','bg-inset'].forEach(bg => { add('text', 'text', bg, 4.5); add('text', 'text-muted', bg, 4.5); });
    ['bg','bg-elevated'].forEach(bg => { add('text', 'link', bg, 4.5); add('line', 'border-input', bg, 3); add('line', 'focus-ring', bg, 3); });
    add('state', 'bg-hover', 'bg', 0.04, 'warn'); add('state', 'bg-hover', 'bg-elevated', 0.04, 'warn');
  });
  return out;
}
const famOf = t => { if (t.startsWith('text-on-')) return t.slice(8); if (t === 'link' || t === 'focus-ring') return 'primary'; if (t === 'border-input') return 'text'; if (t.startsWith('text-inverted')) return 'text-inverted'; return t.split('-')[0]; };
const intentsOf = families;

const BASE_INPUTS = ['font', 'font-inverted', 'background', 'border'];
function fromInputs(o) {
  const g = n => o[n] ? { light: o[n].lm ?? o[n].dm, dark: o[n].dm ?? o[n].lm } : null;
  const brand = []; BRAND.forEach((n, i) => { const v = g(n); if (v) brand[i] = v; });
  const font = g('font'), background = g('background'), status = {};
  Object.keys(o).filter(n => !BRAND.includes(n) && !BASE_INPUTS.includes(n)).forEach(n => { status[n] = g(n); });
  return { brand: brand.filter(Boolean), font, background, status: Object.keys(status).length ? status : mapObj(STATUS, pair),
    fontInverted: g('font-inverted') ?? { ...background },
    border: g('border') ?? { light: mixHex(font.light, 14, background.light), dark: mixHex(font.dark, 14, background.dark) } };
}
function toInputs(p) {
  const o = {};
  [...p.brand.map((_, i) => BRAND[i]), ...BASE_INPUTS, ...Object.keys(p.status)].forEach(n => { o[n] = { lm: baseHex(p, n, 'light'), dm: baseHex(p, n, 'dark') }; });
  return o;
}
const hasInputs = o => !!(o && typeof o === 'object' && o.primary && o.secondary && o.font && o.background);

function buildWebCss(p, prefix) {
  const pre = prefix ? '--' + prefix + '-' : '--';
  const inp = (n, m) => 'var(' + pre + n + (m === 'light' ? '-lm' : '-dm') + ')';
  const ld = (x, y) => 'light-dark(' + x + ', ' + y + ')';
  const mx = (x, n, y) => 'color-mix(in oklab, ' + x + ' ' + n + '%, ' + y + ')';
  const oc = (src, l, c) => 'oklch(from ' + src + ' ' + l + ' ' + c + ' h)';
  const FL = inp('font','light'), FD = inp('font','dark'), BL = inp('background','light'), BD = inp('background','dark'), RL = inp('border','light'), RD = inp('border','dark');
  const status = Object.keys(p.status);
  const inputs = [...p.brand.map((_,i) => BRAND[i]), 'font', 'font-inverted', 'background', 'border', ...status];
  const L = ['/* Generated by design-palette/scripts/palette.mjs. Edit only the Inputs block, then re-run the script.', '   Everything below the inputs, including --text-on-*, is regenerated. */', ':root {', '  color-scheme: light; /* set to light | dark to switch modes */', '', '  /* 1. Inputs: -lm light mode, -dm dark mode. Primary + secondary required */'];
  inputs.forEach(n => L.push('  ' + pre + n + '-lm: ' + baseHex(p,n,'light') + ';', '  ' + pre + n + '-dm: ' + baseHex(p,n,'dark') + ';'));
  L.push('', '  /* 2. Scales: faint > soft > base > strong > intense, ordered by contrast against the background.', '     Same names in both modes; only the values differ. Unset brand slots fall back. */');
  families(p).forEach(n => {
    const s = srcOf(p,n);
    if (s !== n) { L.push('  --' + n + ': var(--' + s + ');'); SCALE.forEach(st => L.push('  --' + n + '-' + st + ': var(--' + s + '-' + st + ');')); return; }
    L.push('  --' + n + ': ' + ld(inp(n,'light'), inp(n,'dark')) + ';');
    SCALE.forEach(st => L.push('  --' + n + '-' + st + ': ' + ld(oc(inp(n,'light'), STEPS_LM[st][2], STEPS_LM[st][3]), DM_MIX[st] ? mx(inp(n,'dark'), DM_MIX[st], BD) : oc(inp(n,'dark'), STEPS_DM[st][2], STEPS_DM[st][3])) + ';'));
  });
  L.push('', '  /* Neutral scales: same names, smaller relative shifts. Subtler than brand steps:', '     --bg-intense is not as strong as --primary-intense */',
    '  --bg: ' + ld(BL, BD) + ';',
    '  --bg-faint: ' + ld(mx(FL,6,BL), mx(FD,11,BD)) + ';',
    '  --bg-soft: ' + ld(mx(FL,10,BL), mx(FD,15,BD)) + ';',
    '  --bg-strong: ' + ld(RL, RD) + '; /* border input */',
    '  --bg-intense: ' + ld(mx(RL,80,FL), mx(RD,80,FD)) + ';',
    '  --bg-elevated: ' + ld(mx(BL,30,'white'), mx(FD,5,BD)) + '; /* literal: lighter in both modes */',
    '  --bg-inset: ' + ld(mx(FL,3,BL), mx(BD,80,'black')) + '; /* literal: darker in both modes */',
    '  --text: ' + ld(FL, FD) + ';',
    '  --text-inverted: ' + ld(inp('font-inverted','light'), inp('font-inverted','dark')) + ';',
    '  --text-faint: ' + ld(mx(FL,45,BL), mx(FD,45,BD)) + ';',
    '  --text-soft: ' + ld(mx(FL,68,BL), mx(FD,68,BD)) + ';',
    '  --text-strong: ' + ld(mx(FL,85,'black'), mx(FD,85,'white')) + ';',
    '  --text-intense: ' + ld(mx(FL,70,'black'), mx(FD,70,'white')) + ';');
  L.push('', '  /* 3. Semantic: references only, identical in both modes */',
    '  --bg-hover: var(--bg-faint);', '  --bg-active: var(--bg-soft);', '  --border: var(--bg-strong);', '  --border-strong: var(--bg-intense);',
    '  --border-input: var(--text-faint); /* 3:1 against bg for form controls (WCAG 1.4.11) */',
    '  --text-muted: var(--text-soft);', '  --text-disabled: var(--text-faint);', '  --bg-disabled: var(--bg-soft);',
    '  --focus-ring: var(--primary-strong);', '  --link: var(--primary-text);', '  --link-hover: var(--primary-strong);');
  intentsOf(p).forEach(n => L.push('  --' + n + '-bg: var(--' + n + '-faint);', '  --' + n + '-bg-hover: var(--' + n + '-soft);', '  --' + n + '-border: var(--' + n + '-soft);', '  --' + n + '-text: var(--' + n + '-intense);'));
  L.push('', '  /* Text on solid fills: --text or --text-inverted, picked per mode for contrast */');
  intentsOf(p).forEach(n => { const x = onRef(p,n,'light'), y = onRef(p,n,'dark'); L.push('  --text-on-' + n + ': ' + (x === y ? 'var(--' + x + ')' : ld('var(--' + x + ')', 'var(--' + y + ')')) + ';'); });
  L.push('', '  /* 4. Interaction + effects: not derivable from the scales */');
  const hov = (n, st, active) => { const e = m => { const x = hoverMix(baseHex(p,n,m), st, active); return oc(inp(srcOf(p,n), m), 'calc(l ' + (x.sign > 0 ? '+ ' : '- ') + x.d + ')', 'c'); }; return ld(e('light'), e('dark')); };
  L.push('  /* Hover/active: fixed lightness shift (0.07 / 0.12), lighter unless the color is already light (L > 0.78) */');
  BRAND.forEach(n => L.push('  --' + n + '-hover: ' + hov(n, false, false) + ';', '  --' + n + '-active: ' + hov(n, false, true) + ';'));
  status.forEach(n => L.push('  --' + n + '-hover: ' + hov(n, true, false) + ';', '  --' + n + '-active: ' + hov(n, true, true) + ';'));
  L.push('  --overlay: ' + ld(mx('black',45,'transparent'), mx('black',65,'transparent')) + ';', '  --shadow: ' + ld(mx(FL,18,'transparent'), mx('black',55,'transparent')) + ';', '}');
  return L.join('\n');
}

function buildThumbnail(p, title) {
  const bg = baseHex(p, 'primary', 'light'), fg = baseHex(p, onRef(p, 'primary', 'light') === 'text' ? 'font' : 'font-inverted', 'light');
  const t = String(title || 'Palette').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const strip = Object.keys(p.status).map(k => '<div style="flex:1;background:' + baseHex(p, k, 'light') + '"></div>').join('');
  return '<!doctype html>\n<!-- Generated by design-palette/scripts/palette.mjs from the palette inputs. Do not edit. -->\n<html><head><meta charset="utf-8"><title>' + t + '</title>' +
    '<style>html,body{margin:0;height:100%}body{display:flex;background:' + bg + ';color:' + fg + ';font:700 clamp(32px,12vw,160px)/1 system-ui,sans-serif;letter-spacing:-0.03em}</style></head>' +
    '<body><div style="flex:1;display:grid;place-items:center;padding:0 6vw;text-align:center">' + t + '</div><div style="width:4vw;display:flex;flex-direction:column">' + strip + '</div></body></html>\n';
}

function tokensFor(p, m) {
  const T = [], lm = m === 'light', f = p.font[m], b = p.background[m], r = p.border[m], W = '#ffffff', K = '#000000';
  families(p).forEach(n => { T.push([n, baseHex(p,n,m)]); SCALE.forEach(st => T.push([n + '-' + st, scaleHex(p,n,m,st)])); });
  T.push(['bg', b], ['bg-faint', mixHex(f, lm ? 6 : 11, b)], ['bg-soft', mixHex(f, lm ? 10 : 15, b)], ['bg-strong', r], ['bg-intense', mixHex(r,80,f)],
    ['bg-elevated', lm ? mixHex(b,30,W) : mixHex(f,5,b)], ['bg-inset', lm ? mixHex(f,3,b) : mixHex(b,80,K)],
    ['text', f], ['text-inverted', p.fontInverted[m]], ['text-faint', mixHex(f,45,b)], ['text-soft', mixHex(f,68,b)], ['text-strong', mixHex(f,85, lm ? K : W)], ['text-intense', mixHex(f,70, lm ? K : W)]);
  const ref = k => 'var(--color-' + k + ')';
  T.push(['bg-hover', ref('bg-faint')], ['bg-active', ref('bg-soft')], ['border', ref('bg-strong')], ['border-strong', ref('bg-intense')], ['border-input', ref('text-faint')], ['text-muted', ref('text-soft')], ['text-disabled', ref('text-faint')], ['bg-disabled', ref('bg-soft')], ['focus-ring', ref('primary-strong')], ['link', ref('primary-text')], ['link-hover', ref('primary-strong')]);
  intentsOf(p).forEach(n => T.push([n + '-bg', ref(n + '-faint')], [n + '-bg-hover', ref(n + '-soft')], [n + '-border', ref(n + '-soft')], [n + '-text', ref(n + '-intense')], ['text-on-' + n, ref(onRef(p,n,m))]));
  const sh = (x, o) => { const [l,a,b2] = hexToLab(x); return labToHex([l + o.sign * o.d, a, b2]); };
  families(p).forEach(n => { const x = baseHex(p,n,m); T.push([n + '-hover', sh(x, hoverMix(x, false, false))], [n + '-active', sh(x, hoverMix(x, false, true))]); });
  T.push(['overlay', lm ? '#00000073' : '#000000a6'], ['shadow', lm ? f + '2e' : '#0000008c']);
  return T;
}
function buildMobileCss(p, inputsBlock) {
  const lt = tokensFor(p,'light'), dk = tokensFor(p,'dark'), lmap = Object.fromEntries(lt);
  const head = inputsBlock ? 'Edit only the inputs block below, then re-run the script.' : 'Do not edit: re-run the script.';
  const L = ['/* Generated by design-palette/scripts/palette.mjs from the canonical theme inputs. ' + head + ' */', '@import "tailwindcss";', '', ...(inputsBlock ? [inputsBlock, ''] : []), '/* Light values + semantic references. Utilities: bg-primary, bg-primary-bg, text-primary-text, border-border… */', '@theme {'];
  lt.forEach(([k,v]) => L.push('  --color-' + k + ': ' + v + ';'));
  L.push('}', '', '/* Dark mode: only values that change. Appearance.setColorScheme(mode) drives this query */', '@media (prefers-color-scheme: dark) {', '  :root {');
  dk.filter(([k,v]) => lmap[k] !== v).forEach(([k,v]) => L.push('    --color-' + k + ': ' + v + ';'));
  L.push('  }', '}');
  return L.join('\n');
}


// ---------------------------------------------------------------------------
// Inputs I/O: canonical CSS <-> inputs object <-> Claude Design palette card
// ---------------------------------------------------------------------------
const INPUT_RE = /--([a-z][a-z0-9-]*)-(lm|dm)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
const normHex = h => { h = h.toLowerCase(); return h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h; };

function readThemeInputs(css) {
  const o = {};
  for (const [, name, mode, hex] of css.matchAll(INPUT_RE)) (o[name] ??= {})[mode] = normHex(hex);
  return o;
}
function requireInputs(o, where) {
  const missing = ['primary', 'secondary', 'font', 'background'].filter(n => !o[n]);
  if (missing.length) throw new Error('Missing required inputs in ' + where + ': ' + missing.join(', '));
}
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function readCardProps(html) {
  const m = html.match(/data-dc-script[^>]*data-props="([^"]*)"/) || html.match(/data-props="([^"]*)"/);
  if (!m) throw new Error('No data-props found on the palette card');
  return JSON.parse(unesc(m[1]));
}
function writeCardProps(html, props) { return html.replace(/data-props="[^"]*"/, 'data-props="' + esc(JSON.stringify(props)) + '"'); }
function cardInputs(html) { return readCardProps(html).inputs?.default ?? null; }
function withCardInputs(html, inputs, title) {
  const props = readCardProps(html);
  if (title) props.title = { editor: 'text', default: title, tsType: 'string' };
  props.inputs = { editor: null, default: inputs, tsType: 'Record<string, { lm: string; dm: string }> | null' };
  if (props.preset) props.preset.default = 'project';
  return writeCardProps(html, props);
}
function diffInputs(from, to) {
  const out = [];
  new Set([...Object.keys(from), ...Object.keys(to)]).forEach(n => {
    const a = from[n], b = to[n];
    if (!a) out.push('+ ' + n + '  lm ' + b.lm + '  dm ' + b.dm);
    else if (!b) out.push('- ' + n);
    else ['lm', 'dm'].forEach(m => { if ((a[m] || '').toLowerCase() !== (b[m] || '').toLowerCase()) out.push('~ ' + n + '  ' + m + ' ' + a[m] + ' -> ' + b[m]); });
  });
  return out;
}
function inputsOnly(p) {
  const L = ['/* design-palette inputs (canonical). -lm light mode, -dm dark mode. Edit these, then re-run palette.mjs. */', ':root {'];
  Object.entries(toInputs(p)).forEach(([n, v]) => L.push('  --' + n + '-lm: ' + v.lm + ';', '  --' + n + '-dm: ' + v.dm + ';'));
  L.push('}');
  return L.join('\n');
}
function report(p) {
  const res = runAudit(p), bad = res.filter(c => !c.pass);
  const fmt = c => (c.level === 'fail' ? 'FAIL' : 'WARN') + '  ' + c.m.padEnd(5) + '  ' +
    (c.kind === 'hue' ? '--' + c.fg + ' looks like --' + c.bg + ' (hue ' + c.val.toFixed(0) + '° apart): brand may read as a status'
      : c.kind === 'input' ? '--' + c.fg + ' is very light (L ' + c.val.toFixed(2) + '): weak tints and hover'
      : '--' + c.fg + ' on --' + c.bg + '  ' + (c.kind === 'state' ? 'dL ' + c.val.toFixed(3) + ' (need ' + c.need + ')' : c.val.toFixed(2) + ':1 (need ' + c.need + ':1)'));
  const fails = bad.filter(c => c.level === 'fail').length;
  return { text: ['Contrast audit: ' + res.length + ' checks, ' + fails + ' fail, ' + (bad.length - fails) + ' warn', ...bad.map(fmt)].join('\n'), fails };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const USAGE = [
  'Usage: node palette.mjs <theme.css> [options]',
  '  <theme.css>           canonical file holding the --name-lm / --name-dm inputs',
  '  --web                 regenerate <theme.css> as the full web theme (light-dark tokens)',
  '  --mobile <file>       write the Tailwind v4 theme (may equal <theme.css> for mobile-only projects)',
  '  --to-card <card>      write the inputs into the Claude Design palette card (data-props "inputs")',
  '  --from-card <card>    take the inputs from the palette card (prints the diff), then generate',
  '  --diff-card <card>    print the input diff between <theme.css> and the card, write nothing',
  '  --thumbnail <file>    write the Claude Design project thumbnail (primary + status strip)',
  '  --title <name>        project name for --to-card and --thumbnail (default: the --from-card card\'s title)',
  '  --audit-only          print the contrast audit, write nothing',
  '  --strict              exit 1 when the audit has failures (default: report only)'
].join('\n');

const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  const fs = await import('node:fs');
  const args = process.argv.slice(2);
  const valued = ['--mobile', '--to-card', '--from-card', '--diff-card', '--thumbnail', '--title'];
  const flags = ['--web', '--audit-only', '--strict', '--help'];
  const fail = msg => { console.error('palette.mjs: ' + msg); process.exit(1); };
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const has = k => args.includes(k);
  if (has('--help')) { console.log(USAGE); process.exit(0); }
  const unknown = args.filter((a, i) => a.startsWith('--') && !valued.includes(a) && !flags.includes(a) && !valued.includes(args[i - 1]));
  if (unknown.length) fail('unknown option ' + unknown.join(', ') + '\n' + USAGE);
  valued.forEach(k => { if (has(k) && (!opt(k) || opt(k).startsWith('--'))) fail(k + (k === '--title' ? ' needs a name' : ' needs a file path')); });
  const input = args.find((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1]));
  if (!input) fail('missing <theme.css>\n' + USAGE);
  const mobile = opt('--mobile'), diffCard = opt('--diff-card'), fromCard = opt('--from-card'), toCard = opt('--to-card');
  if (has('--web') && mobile === input) fail('--web and --mobile cannot write the same file: the Tailwind output would drop the inputs');
  const read = f => { if (!fs.existsSync(f)) fail('file not found: ' + f); return fs.readFileSync(f, 'utf8'); };

  try {
    let inputs = readThemeInputs(read(input));
    if (diffCard) {
      const ci = cardInputs(read(diffCard));
      if (!ci) { console.log('card has no inputs yet'); process.exit(0); }
      const d = diffInputs(inputs, ci);
      console.log(d.length ? 'theme -> card differences:\n' + d.join('\n') : 'theme and card inputs match');
      process.exit(0);
    }
    let title = opt('--title');
    if (fromCard) {
      const html = read(fromCard), ci = cardInputs(html);
      title ??= readCardProps(html).title?.default;
      if (!ci) fail('the palette card has no inputs: ' + fromCard);
      const d = diffInputs(inputs, ci);
      console.log(d.length ? 'applying card inputs:\n' + d.join('\n') : 'card inputs already match the theme');
      inputs = mapObj(ci, v => ({ lm: v.lm && normHex(v.lm), dm: v.dm && normHex(v.dm) }));
    }
    requireInputs(inputs, fromCard ? fromCard : input);
    const p = fromInputs(inputs);

    if (!has('--audit-only')) {
      if (has('--web')) { fs.writeFileSync(input, buildWebCss(p, '') + '\n'); console.log('wrote ' + input + ' (web)'); }
      if (mobile) { fs.writeFileSync(mobile, buildMobileCss(p, mobile === input ? inputsOnly(p) : '') + '\n'); console.log('wrote ' + mobile + ' (tailwind)'); }
      if (toCard) { fs.writeFileSync(toCard, withCardInputs(read(toCard), toInputs(p), title)); console.log('wrote inputs into ' + toCard); }
      const thumb = opt('--thumbnail');
      if (thumb) { fs.writeFileSync(thumb, buildThumbnail(p, title)); console.log('wrote ' + thumb + ' (thumbnail)'); }
      if (!has('--web') && !mobile && !toCard && !thumb) console.log('nothing written: pass --web, --mobile <file>, --to-card <card> or --thumbnail <file>');
    }
    const r = report(p);
    console.log(r.text);
    if (has('--strict') && r.fails) process.exit(1);
  } catch (e) { fail(e.message); }
}

export { buildThumbnail, readThemeInputs, fromInputs, toInputs, buildWebCss, buildMobileCss, runAudit, diffInputs, withCardInputs, cardInputs };
