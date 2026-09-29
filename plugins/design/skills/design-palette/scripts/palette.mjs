#!/usr/bin/env node
// design-palette generator: reads the canonical --name-lm / --name-dm inputs, writes the theme, its browser scheme file,
// the Tailwind utilities and a resolved JSON, syncs inputs with the Claude Design palette card, and prints a contrast
// audit. Zero dependencies. Node 20+.

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

// [token, light, dark]: each side is a hex literal, an input (var(--X-lm)) or a token reference (var(--Y)).
function webTokens(p, pre) {
  const dk = Object.fromEntries(tokensFor(p, 'dark')), inp = (n, m) => 'var(' + pre + n + (m === 'light' ? '-lm' : '-dm') + ')';
  const input = { bg:'background', 'bg-strong':'border', text:'font', 'text-inverted':'font-inverted' }, alias = {};
  families(p).forEach(n => { const s = srcOf(p, n); if (s === n) { input[n] = n; return; } ['', ...SCALE.map(st => '-' + st), '-hover', '-active'].forEach(x => { alias[n + x] = 'var(--' + s + x + ')'; }); });
  const ref = v => v.startsWith('var(--color-') ? 'var(--' + v.slice(12) : v;
  return tokensFor(p, 'light').map(([k, v]) => alias[k] ? [k, alias[k], alias[k]] : input[k] ? [k, inp(input[k], 'light'), inp(input[k], 'dark')] : [k, ref(v), ref(dk[k])]);
}
const modeRef = (k, v, m) => v[0] === '#' ? 'var(--' + k + '-' + m + ')' : v;
function buildWebCss(p, prefix) {
  const pre = prefix ? '--' + prefix + '-' : '--', T = webTokens(p, pre);
  const inputs = [...p.brand.map((_,i) => BRAND[i]), 'font', 'font-inverted', 'background', 'border', ...Object.keys(p.status)];
  const L = ['/* Generated by design-palette/scripts/palette.mjs. Edit only the Inputs block, then re-run the script.', '   Plain values and var() only, so web and React Native (NativeWind) can share this file. */', ':root {', '  /* 1. Inputs: -lm light mode, -dm dark mode. Primary + secondary required */'];
  inputs.forEach(n => L.push('  ' + pre + n + '-lm: ' + baseHex(p,n,'light') + ';', '  ' + pre + n + '-dm: ' + baseHex(p,n,'dark') + ';'));
  L.push('', '  /* 2. Generated values per mode: faint > soft > base > strong > intense scales, neutrals, hover, effects */');
  T.forEach(([k,a,b]) => { if (a === b) return; if (a[0] === '#') L.push('  --' + k + '-light: ' + a + ';'); if (b[0] === '#') L.push('  --' + k + '-dark: ' + b + ';'); });
  L.push('', '  /* 3. Tokens: what components use. Light values here; the dark block below re-points the ones that change.', '     Semantic tokens only reference other tokens, so they follow the mode. */');
  T.forEach(([k,a,b]) => L.push('  --' + k + ': ' + (a === b ? a : modeRef(k, a, 'light')) + ';'));
  L.push('}', '', '/* Dark mode: prefers-color-scheme (Appearance.setColorScheme on React Native). To force a mode in a browser,', '   import the scheme file (palette.mjs --scheme) after this one and set color-scheme on <html>. */', '@media (prefers-color-scheme: dark) {', '  :root {');
  T.forEach(([k,a,b]) => { if (a !== b) L.push('    --' + k + ': ' + modeRef(k, b, 'dark') + ';'); });
  L.push('  }', '}');
  return L.join('\n');
}
function buildSchemeCss(p, prefix) {
  const T = webTokens(p, prefix ? '--' + prefix + '-' : '--');
  const L = ['/* Generated with the design palette. Browser only: never import it on React Native, where react-native-css', '   turns light-dark() into arrays. Import it after the theme; color-scheme on <html> then picks the mode. */', ':root {', '  color-scheme: light dark;'];
  T.forEach(([k,a,b]) => { if (a !== b) L.push('  --' + k + ': light-dark(' + modeRef(k, a, 'light') + ', ' + modeRef(k, b, 'dark') + ');'); });
  L.push('}');
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
function buildMobileCss(p, themeCss) {
  const head = themeCss ? 'Edit only the inputs block below, then re-run the script.' : 'Import the theme file (palette.mjs --web) too. Do not edit: re-run the script.';
  const L = ['/* Generated by design-palette/scripts/palette.mjs: Tailwind v4 utilities for the palette tokens. ' + head + ' */', '@import "tailwindcss";', '', ...(themeCss ? [themeCss, ''] : []), '/* Utilities: bg-primary, bg-primary-bg, text-primary-text, border-border… inline keeps them following the mode */', '@theme inline {'];
  tokensFor(p, 'light').forEach(([k]) => L.push('  --color-' + k + ': var(--' + k + ');'));
  L.push('}');
  return L.join('\n');
}
function buildJson(p) {
  const l = resolver(p, 'light'), d = resolver(p, 'dark');
  return '{\n' + tokensFor(p, 'light').map(([k]) => '  ' + JSON.stringify(k) + ': { "light": "' + l(k) + '", "dark": "' + d(k) + '" }').join(',\n') + '\n}';
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
// Rewrites the input values of an inputs file in place: keeps its comments and order, drops inputs the new set lacks
// and appends new ones before the closing brace.
function withInputs(css, o) {
  const seen = new Set();
  const out = css.replace(/^[ \t]*--([a-z][a-z0-9-]*)-(lm|dm)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;[^\n]*\n?/gm, (line, n, m, hex) => {
    if (!o[n]) return '';
    seen.add(n);
    return line.replace(hex, o[n][m]);
  });
  const add = Object.keys(o).filter(n => !seen.has(n)).flatMap(n => ['  --' + n + '-lm: ' + o[n].lm + ';', '  --' + n + '-dm: ' + o[n].dm + ';']);
  if (!add.length) return out;
  const i = out.lastIndexOf('}');
  return out.slice(0, i) + add.join('\n') + '\n' + out.slice(i);
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
  'Usage: node palette.mjs <inputs.css> [options]',
  '  <inputs.css>          canonical file holding the --name-lm / --name-dm inputs',
  '  --web                 regenerate <inputs.css> as the full theme (plain values + var(), shared by web and React Native)',
  '  --theme <file>        write the full theme to <file> instead, leaving <inputs.css> as the inputs only',
  '  --scheme <file>       write the browser-only light-dark() file that lets color-scheme force a mode',
  '                        (may equal the theme file for web-only projects)',
  '  --mobile <file>       write the Tailwind v4 utilities for the tokens (equals <inputs.css> for mobile-only projects:',
  '                        the file then also holds the full theme)',
  '  --json <file>         write every token resolved to a hex per mode, for code that cannot read CSS variables',
  '  --to-card <card>      write the inputs into the Claude Design palette card (data-props "inputs")',
  '  --from-card <card>    take the inputs from the palette card (prints the diff), write them into <inputs.css>, then generate',
  '  --diff-card <card>    print the input diff between <inputs.css> and the card, write nothing',
  '  --thumbnail <file>    write the Claude Design project thumbnail (primary + status strip)',
  '  --title <name>        project name for --to-card and --thumbnail (default: the --from-card card\'s title)',
  '  --audit-only          print the contrast audit, write nothing',
  '  --strict              exit 1 when the audit has failures (default: report only)'
].join('\n');

const isMain = typeof process !== 'undefined' && process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  const fs = await import('node:fs');
  const args = process.argv.slice(2);
  const valued = ['--theme', '--mobile', '--scheme', '--json', '--to-card', '--from-card', '--diff-card', '--thumbnail', '--title'];
  const flags = ['--web', '--audit-only', '--strict', '--help'];
  const fail = msg => { console.error('palette.mjs: ' + msg); process.exit(1); };
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const has = k => args.includes(k);
  if (has('--help')) { console.log(USAGE); process.exit(0); }
  const unknown = args.filter((a, i) => a.startsWith('--') && !valued.includes(a) && !flags.includes(a) && !valued.includes(args[i - 1]));
  if (unknown.length) fail('unknown option ' + unknown.join(', ') + '\n' + USAGE);
  valued.forEach(k => { if (has(k) && (!opt(k) || opt(k).startsWith('--'))) fail(k + (k === '--title' ? ' needs a name' : ' needs a file path')); });
  const input = args.find((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1]));
  if (!input) fail('missing <inputs.css>\n' + USAGE);
  const mobile = opt('--mobile'), scheme = opt('--scheme'), json = opt('--json'), diffCard = opt('--diff-card'), fromCard = opt('--from-card'), toCard = opt('--to-card');
  if (has('--web') && has('--theme')) fail('pass --web (theme in <inputs.css>) or --theme <file> (theme elsewhere), not both');
  const theme = opt('--theme') ?? (has('--web') ? input : undefined);
  if (theme && mobile === input) fail('--mobile <inputs.css> already writes the full theme: drop ' + (has('--web') ? '--web' : '--theme'));
  if (theme && theme === mobile) fail('--theme and --mobile cannot write the same file: pass --mobile <inputs.css> for a mobile-only file');
  if (scheme === input && theme !== input) fail('--scheme <inputs.css> needs --web: React Native cannot read light-dark(), and the inputs file must keep its inputs');
  if (scheme && scheme === mobile) fail('--scheme and --mobile cannot write the same file: React Native cannot read light-dark()');
  if (json === input) fail('--json cannot write <inputs.css>');
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
      if (fromCard && theme !== input && mobile !== input) { fs.writeFileSync(input, withInputs(read(input), toInputs(p))); console.log('wrote the card inputs into ' + input); }
      if (theme) {
        const css = theme === input ? buildWebCss(p, '') : buildWebCss(p, '').replace(/^\/\*[^]*?\*\//, '/* Generated by design-palette/scripts/palette.mjs from ' + input + '. Do not edit: change the inputs there and re-run.\n   Plain values and var() only, so web and React Native (NativeWind) can share this file. */');
        fs.writeFileSync(theme, css + (scheme === theme ? '\n\n' + buildSchemeCss(p, '') : '') + '\n'); console.log('wrote ' + theme + (scheme === theme ? ' (theme + scheme)' : ' (theme)'));
      }
      if (scheme && scheme !== theme) { fs.writeFileSync(scheme, buildSchemeCss(p, '') + '\n'); console.log('wrote ' + scheme + ' (scheme)'); }
      if (mobile) { fs.writeFileSync(mobile, buildMobileCss(p, mobile === input ? buildWebCss(p, '') : '') + '\n'); console.log('wrote ' + mobile + (mobile === input ? ' (theme + tailwind)' : ' (tailwind)')); }
      if (json) { fs.writeFileSync(json, buildJson(p) + '\n'); console.log('wrote ' + json + ' (json)'); }
      if (toCard) { fs.writeFileSync(toCard, withCardInputs(read(toCard), toInputs(p), title)); console.log('wrote inputs into ' + toCard); }
      const thumb = opt('--thumbnail');
      if (thumb) { fs.writeFileSync(thumb, buildThumbnail(p, title)); console.log('wrote ' + thumb + ' (thumbnail)'); }
      if (!theme && !scheme && !mobile && !json && !toCard && !thumb) console.log('nothing written: pass --web, --theme <file>, --scheme <file>, --mobile <file>, --json <file>, --to-card <card> or --thumbnail <file>');
    }
    const r = report(p);
    console.log(r.text);
    if (has('--strict') && r.fails) process.exit(1);
  } catch (e) { fail(e.message); }
}

export { buildThumbnail, readThemeInputs, withInputs, fromInputs, toInputs, buildWebCss, buildSchemeCss, buildMobileCss, buildJson, runAudit, diffInputs, withCardInputs, cardInputs };
