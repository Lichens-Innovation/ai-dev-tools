// Shared navigation for the cards of a Claude Design project: a fixed navbar (sidebar toggle, palette link, page title,
// section shortcuts, light/dark switch) and a sidebar: the palette link (Palette.dc.html), the Pages
// (the screen mockups listed in screens/index.json, written by design-screens), then every other card from the
// _ds_manifest.json Claude Design compiles at the project root. Upload it to the project root as design-nav.js. The palette card loads it directly; synced cards
// and proposals load it through the design provider. Framework free, styled with the palette's semantic tokens.
//
// Mode: sets data-theme and color-scheme on <html>, remembers the choice for the project, exposes
// window.designNav = { mode, setMode } and dispatches a 'design-nav:mode' event ({ detail: { mode } }) on load and on
// each change.
// Sections: elements with data-nav-section="<label>", else the story cells of a synced card (.ds-cell > h4).
// Palette footer: tweaks the palette inputs live on any card. It reads the inputs and the palette engine from the
// project's Palette.dc.html, keeps the changes as a per-project draft and turns them into a request to paste in
// Claude Design's chat. window.designNav.palette is the drafted inputs; setPalette(inputs) replaces them and a
// 'design-nav:palette' event ({ detail: { inputs } }) follows each change. The palette card shares the draft.
(() => {
  if (window.designNav) return;
  const script = document.currentScript;
  const root = new URL('./', script ? script.src : location.href);
  const KEY = 'design-nav', DRAFT = 'design-nav:palette', PALETTE = 'Palette.dc.html', SCREENS = 'screens/index.json', BAR = 56, SIDE = 280, WIDE = 900;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = o => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...o })); } catch {} };
  const saved = load();
  const html = document.documentElement;
  const initialMode = saved.mode === 'dark' || saved.mode === 'light' ? saved.mode : (html.dataset.theme === 'dark' || html.style.colorScheme === 'dark' ? 'dark' : 'light');
  const state = { mode: initialMode, open: saved.open !== false, sections: [], active: null };
  const here = decodeURIComponent(location.pathname).slice(decodeURIComponent(root.pathname).length);
  const labelOf = path => path.split('/').pop().replace(/\.html$/, '').replace(/\.dc$/, '');
  const hrefOf = path => new URL(path.split('/').map(encodeURIComponent).join('/'), root).pathname + location.search;

  const applyMode = () => { html.dataset.theme = state.mode; html.style.colorScheme = state.mode; };
  applyMode();
  window.designNav = {
    get mode() { return state.mode; },
    setMode(mode) {
      if (mode !== 'light' && mode !== 'dark') return;
      state.mode = mode; save({ mode }); applyMode(); render();
      window.dispatchEvent(new CustomEvent('design-nav:mode', { detail: { mode } }));
      updateFoot();
    },
    get palette() { return P.base ? merged() : null; },
    setPalette(inputs) { if (P.base && inputs) setDraft(diff(inputs)); }
  };
  window.dispatchEvent(new CustomEvent('design-nav:mode', { detail: { mode: state.mode } }));

  const css = `
html[data-design-nav] body{background:var(--bg,#fff);color:var(--text,#111)}
html[data-design-nav] .ds-cell{border-color:var(--border,#e5e7eb)}
html[data-design-nav] .ds-cell>h4{color:var(--text-muted,#6b7280)}
.dn-bar,.dn-side{font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--text,#111);box-sizing:border-box}
.dn-bar *,.dn-side *{box-sizing:border-box}
.dn-bar{position:fixed;top:0;left:0;right:0;z-index:2147483000;height:${BAR}px;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--bg-elevated,#fff);border-bottom:1px solid var(--border,#e5e7eb)}
.dn-burger{flex:none;width:36px;height:36px;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
.dn-burger:hover{background:var(--bg-hover,#f3f4f6)}
.dn-burger span{display:block;width:20px;height:2px;margin:4px auto;background:currentColor;transition:transform .3s,opacity .3s}
.dn-open .dn-burger span:nth-child(1){transform:translateY(6px) rotate(45deg)}
.dn-open .dn-burger span:nth-child(2){opacity:0}
.dn-open .dn-burger span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
.dn-palette{flex:none;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;color:inherit}
.dn-palette:hover{background:var(--bg-hover,#f3f4f6)}
.dn-palette[aria-current]{color:var(--link,#4f46e5)}
.dn-palette svg,.dn-side a svg{flex:none;width:20px;height:20px}
.dn-side a.dn-side-palette{gap:10px;margin-bottom:4px;font-weight:600}
.dn-title{flex:none;max-width:30vw;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dn-sections{flex:1 1 0;min-width:0;display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}
.dn-sections::-webkit-scrollbar{display:none}
.dn-sections button{flex:none;height:32px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer;white-space:nowrap}
.dn-sections button:hover{background:var(--bg-hover,#f3f4f6)}
.dn-sections button[aria-current]{background:var(--primary-bg,#eef2ff);color:var(--primary-text,#3730a3);font-weight:600}
.dn-switch{flex:none;display:flex;align-items:center;gap:8px;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer}
.dn-switch small{font-size:13px;color:var(--text-muted,#6b7280)}
.dn-track{position:relative;width:40px;height:22px;border-radius:999px;background:var(--border-strong,#9ca3af);box-shadow:inset 0 0 0 1px var(--border,#e5e7eb);transition:background .15s}
.dn-track i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}
.dn-dark .dn-track{background:var(--primary,#4f46e5)}
.dn-dark .dn-track i{left:21px}
.dn-side{position:fixed;top:${BAR}px;left:0;bottom:0;z-index:2147482999;width:0;overflow:hidden;transition:width .2s}
.dn-open .dn-side{width:${SIDE}px;border-right:1px solid var(--border,#e5e7eb);box-shadow:2px 0 8px rgba(0,0,0,.15)}
.dn-side nav{width:${SIDE}px;height:100%;overflow-y:auto;padding:12px 0;background:var(--bg-elevated,#fff)}
.dn-group{padding:12px 16px 4px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted,#6b7280)}
.dn-side a{position:relative;display:flex;align-items:center;height:40px;padding:0 16px 0 12px;color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dn-side a:hover{background:var(--bg-hover,#f3f4f6);color:var(--text-strong,inherit)}
.dn-side a::before{content:'';position:absolute;top:20%;left:0;height:60%;width:3px;border-radius:0 2px 2px 0;background:transparent}
.dn-side a[aria-current]{font-weight:600;color:var(--text-strong,inherit)}
.dn-side a[aria-current]::before{background:var(--link,#4f46e5)}
.dn-note{padding:8px 16px;font-size:13px;color:var(--text-muted,#6b7280)}
@media (max-width:${WIDE - 1}px){.dn-open .dn-side{width:100%}.dn-side nav{width:100%}}
@media (max-width:480px){.dn-switch small{display:none}}
.dn-foot{position:fixed;left:0;right:0;bottom:0;z-index:2147482998;font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--text,#111);background:var(--bg-elevated,#fff);border-top:1px solid var(--border,#e5e7eb);box-shadow:0 -2px 8px rgba(0,0,0,.08);transition:left .2s}
.dn-foot *{box-sizing:border-box}
@media (min-width:${WIDE}px){.dn-open .dn-foot{left:${SIDE}px}}
.dn-foot-head{height:48px;display:flex;align-items:center;gap:8px;padding:0 16px}
.dn-foot-toggle{flex:none;display:flex;align-items:center;gap:8px;height:32px;padding:0 10px 0 6px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.dn-foot-toggle:hover{background:var(--bg-hover,#f3f4f6)}
.dn-foot-toggle svg{transition:transform .2s}
.dn-foot-open .dn-foot-toggle svg{transform:rotate(180deg)}
.dn-foot-status{flex:1 1 0;min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;font-size:13px;color:var(--text-muted,#6b7280)}
.dn-badge{padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--primary-bg,#eef2ff);color:var(--primary-text,#3730a3)}
.dn-badge.dn-fail{background:var(--danger-bg,#fef2f2);color:var(--danger-text,#991b1b)}
.dn-btn{flex:none;height:32px;padding:0 12px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer;white-space:nowrap}
.dn-btn:hover:not(:disabled){background:var(--bg-hover,#f3f4f6)}
.dn-btn:disabled{opacity:.5;cursor:default}
.dn-btn.dn-primary{border-color:transparent;background:var(--primary,#4f46e5);color:var(--text-on-primary,#fff)}
.dn-btn.dn-primary:hover:not(:disabled){background:var(--primary-hover,#4338ca)}
.dn-foot-body{display:none;max-height:min(45vh,420px);overflow-y:auto;padding:4px 16px 16px;border-top:1px solid var(--border,#e5e7eb)}
.dn-foot-open .dn-foot-body{display:block}
.dn-foot-note{margin:10px 0 0;font-size:13px;color:var(--text-muted,#6b7280)}
.dn-rows{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.dn-row{display:flex;align-items:center;gap:8px;height:40px;padding:0 6px 0 8px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:var(--bg,#fff)}
.dn-row[data-changed]{border-color:var(--primary,#4f46e5)}
.dn-row label{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}
.dn-row input[type=color]{flex:none;width:28px;height:28px;padding:0;border:1px solid var(--border,#e5e7eb);border-radius:6px;background:none;cursor:pointer}
.dn-row input[type=color]::-webkit-color-swatch-wrapper{padding:0}
.dn-row input[type=color]::-webkit-color-swatch{border:0;border-radius:5px}
.dn-row input[type=color]::-moz-color-swatch{border:0;border-radius:5px}
.dn-row input[type=text]{flex:none;width:80px;height:28px;padding:0 6px;border:1px solid var(--border-input,#9ca3af);border-radius:6px;background:var(--bg,#fff);color:inherit;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.dn-row button{flex:none;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--text-muted,#6b7280);font-size:16px;line-height:1;cursor:pointer;visibility:hidden}
.dn-row[data-changed] button{visibility:visible}
.dn-row button:hover{background:var(--bg-hover,#f3f4f6);color:inherit}
.dn-req{display:block;width:100%;margin-top:6px;padding:8px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:var(--bg-inset,#f9fafb);color:inherit;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
@media (max-width:640px){.dn-foot-status{display:none}.dn-foot-head{justify-content:flex-end}.dn-foot-toggle{margin-right:auto}}`;

  let bar, side, foot = null, pad = null, cards = null, screens = null;
  const wide = () => innerWidth >= WIDE;
  const el = (tag, props = {}, kids = []) => { const e = document.createElement(tag); Object.assign(e, props); kids.forEach(k => e.append(k)); return e; };
  const paletteIcon = () => { const s = el('span'); s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4.5 4H16a2 2 0 0 0-1.4 3.4A1.6 1.6 0 0 1 12 22z"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor"/><circle cx="10.5" cy="6.5" r="1" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1" fill="currentColor"/></svg>'; return s.firstChild; };
  const pageTitle = () => {
    if (here === PALETTE) return ''; // the palette icon beside it names the page
    const screen = (screens || []).find(s => s.path === here);
    return screen ? screen.name : labelOf(here) || document.title;
  };

  function layout() {
    const b = document.body; if (!b) return;
    if (!pad) { const cs = getComputedStyle(b); pad = { top: parseFloat(cs.paddingTop) || 0, left: parseFloat(cs.paddingLeft) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }; b.style.transition = 'padding-left .2s'; }
    b.style.paddingTop = pad.top + BAR + 'px';
    b.style.paddingBottom = pad.bottom + (foot ? foot.offsetHeight : 0) + 'px';
    b.style.paddingLeft = pad.left + (state.open && wide() ? SIDE : 0) + 'px';
  }
  function scanSections() {
    const marked = [...document.querySelectorAll('[data-nav-section]')].map(e => [e, e.dataset.navSection]);
    const found = marked.length ? marked : [...document.querySelectorAll('.ds-cell > h4')].map(h => [h.parentElement, h.textContent.trim()]);
    const next = found.filter(([, label]) => label);
    if (next.length !== state.sections.length || next.some(([e, l], i) => state.sections[i][0] !== e || state.sections[i][1] !== l)) { state.sections = next; render(); }
    spy();
  }
  // The last section whose top has scrolled under the navbar; the first one at the top of the page, the last at the end.
  function spy() {
    const secs = state.sections, end = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    const cur = scrollY < 1 ? secs[0] : end && scrollY > 0 ? secs[secs.length - 1] : secs.filter(([e]) => e.getBoundingClientRect().top <= BAR + 24).pop() || secs[0];
    const active = cur ? cur[1] : null;
    if (active !== state.active) { state.active = active; render(); }
  }
  function jump(e) { scrollTo({ top: e.getBoundingClientRect().top + scrollY - BAR - 16, behavior: 'smooth' }); }
  function toggleSide() { state.open = !state.open; if (wide()) save({ open: state.open }); layout(); render(); }

  // Palette footer. P.base: the inputs saved in Palette.dc.html ({ name: { lm, dm } }); P.draft: the changes to them
  // ({ name: { lm?, dm? } }, null for a removed input), kept per project in localStorage.
  const P = { eng: null, base: null, prefix: '', draft: {}, open: saved.palette === true, rows: new Map(), queued: false };
  const norm = h => { h = String(h || '').trim().toLowerCase(); if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map(c => c + c).join(''); return h; };
  const isHex = h => /^#[0-9a-f]{6}$/.test(norm(h));
  const mk = () => state.mode === 'dark' ? 'dm' : 'lm';
  function merged() {
    const o = {};
    Object.entries(P.base).forEach(([n, v]) => { if (P.draft[n] !== null) o[n] = { ...v, ...P.draft[n] }; });
    Object.entries(P.draft).forEach(([n, v]) => { if (v && !P.base[n]) o[n] = { lm: v.lm, dm: v.dm }; });
    return o;
  }
  function diff(inputs) {
    const d = {};
    Object.entries(P.base).forEach(([n, b]) => {
      const v = inputs[n];
      if (!v) { d[n] = null; return; }
      ['lm', 'dm'].forEach(m => { if (isHex(v[m]) && norm(v[m]) !== norm(b[m])) (d[n] = d[n] || {})[m] = norm(v[m]); });
    });
    Object.entries(inputs).forEach(([n, v]) => { if (!P.base[n] && v && isHex(v.lm) && isHex(v.dm)) d[n] = { lm: norm(v.lm), dm: norm(v.dm) }; });
    return d;
  }
  function setDraft(d) {
    if (JSON.stringify(d) === JSON.stringify(P.draft)) return;
    P.draft = d;
    try { Object.keys(d).length ? localStorage.setItem(DRAFT, JSON.stringify(d)) : localStorage.removeItem(DRAFT); } catch {}
    paletteChanged();
  }
  function setInput(n, m, hex) { const o = merged(); if (!o[n] || !isHex(hex)) return; o[n][m] = norm(hex); setDraft(diff(o)); }
  function paletteChanged() {
    if (P.queued) return;
    P.queued = true;
    requestAnimationFrame(() => {
      P.queued = false;
      applyPalette(); updateFoot();
      window.dispatchEvent(new CustomEvent('design-nav:palette', { detail: { inputs: merged() } }));
    });
  }
  // The palette card themes itself from the same draft; every other page gets the regenerated tokens here, after the
  // project's own stylesheets.
  function applyPalette() {
    let st = document.getElementById('design-nav-palette');
    const own = here !== PALETTE && Object.keys(P.draft).length > 0;
    if (!own) { if (st) st.textContent = ''; return; }
    if (!st) st = el('style', { id: 'design-nav-palette' });
    const p = P.eng.fromInputs(merged());
    st.textContent = P.eng.buildWebCss(p, P.prefix) + '\n' + P.eng.buildSchemeCss(p, P.prefix);
    document.head.append(st);
  }
  function changes() {
    const mode = m => m === 'lm' ? 'light' : 'dark';
    return Object.entries(P.draft).flatMap(([n, v]) => v === null ? ['- remove the ' + n + ' input']
      : !P.base[n] ? ['- add a ' + n + ' input: light ' + v.lm + ', dark ' + v.dm]
      : Object.entries(v).map(([m, hex]) => '- ' + n + ', ' + mode(m) + ' mode: ' + P.base[n][m] + ' → ' + hex));
  }
  const request = () => ['Update the palette in Palette.dc.html: change these values in the default of its `inputs` prop (data-props) and leave the rest of the file as is.', ...changes()].join('\n');
  function copyRequest(btn) {
    const text = request(), req = foot.querySelector('.dn-req');
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy request'; }, 2000); };
    const manual = () => {
      req.select();
      if (document.execCommand && document.execCommand('copy')) return done();
      if (!P.open) togglePalette();
      req.focus(); req.select();
      btn.textContent = 'Copy it below';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, manual); else manual();
  }
  function togglePalette() { P.open = !P.open; save({ palette: P.open }); html.classList.toggle('dn-foot-open', P.open); layout(); }
  function buildRows() {
    const o = merged(), names = Object.keys(o), base = ['font', 'font-inverted', 'background', 'border'];
    const label = { font: 'font (--text)', 'font-inverted': 'font-inverted', background: 'background (--bg)', border: 'border (--bg-strong)' };
    const groups = [['Brand', names.filter(n => !base.includes(n) && P.eng.BRAND.includes(n))], ['Base', names.filter(n => base.includes(n))], ['Status', names.filter(n => !base.includes(n) && !P.eng.BRAND.includes(n))]];
    P.rows = new Map();
    const body = foot.querySelector('.dn-foot-rows');
    body.replaceChildren(...groups.filter(([, list]) => list.length).flatMap(([title, list]) => [el('div', { className: 'dn-group', textContent: title, style: 'padding:12px 0 6px' }), el('div', { className: 'dn-rows' }, list.map(n => {
      const id = 'dn-in-' + n;
      const color = el('input', { type: 'color', title: '--' + n, oninput: e => setInput(n, mk(), e.target.value) });
      const text = el('input', { type: 'text', id, spellcheck: false, maxLength: 7, ariaLabel: n + ' hex',
        oninput: e => { if (isHex(e.target.value)) setInput(n, mk(), e.target.value); }, onblur: () => updateFoot() });
      const reset = el('button', { type: 'button', textContent: '×', title: 'Back to the saved value', ariaLabel: 'Reset ' + n, onclick: () => setInput(n, mk(), P.base[n] ? P.base[n][mk()] : o[n][mk()]) });
      const row = el('div', { className: 'dn-row' }, [color, el('label', { htmlFor: id, textContent: label[n] || n, title: '--' + n + '-' + mk() }), text, reset]);
      P.rows.set(n, { row, color, text });
      return row;
    }))]));
  }
  function updateFoot() {
    if (!foot) return;
    const o = merged(), m = mk(), n = changes().length;
    if (Object.keys(o).join() !== [...P.rows.keys()].join()) buildRows();
    P.rows.forEach((r, name) => {
      const v = norm(o[name][m]);
      if (document.activeElement !== r.text) r.text.value = v;
      if (document.activeElement !== r.color) r.color.value = v;
      r.row.toggleAttribute('data-changed', !!(P.draft[name] && P.draft[name][m]) || !P.base[name]);
    });
    const fails = P.eng.runAudit(P.eng.fromInputs(o)).filter(c => !c.pass && c.level === 'fail');
    const status = foot.querySelector('.dn-foot-status');
    status.replaceChildren(...(n ? [el('span', { className: 'dn-badge', textContent: n + (n > 1 ? ' changes' : ' change') })] : [el('span', { textContent: 'Tweak the palette live on every card' })]),
      ...(fails.length ? [el('span', { className: 'dn-badge dn-fail', textContent: fails.length + ' contrast ' + (fails.length > 1 ? 'fails' : 'fail'), title: fails.map(c => c.m + ': --' + c.fg + ' on --' + c.bg + ' ' + c.val.toFixed(2) + ':1 (' + c.need + ':1)').join('\n') })] : []));
    foot.querySelectorAll('[data-needs-changes]').forEach(b => { b.disabled = !n; });
    const req = foot.querySelector('.dn-req');
    req.hidden = !n; req.value = n ? request() : '';
    foot.querySelector('.dn-foot-mode').textContent = state.mode;
  }
  function mountFoot() {
    if (foot || !bar || !P.base) return;
    const chevron = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const toggle = el('button', { className: 'dn-foot-toggle', type: 'button', innerHTML: chevron + '<span>Palette</span>', onclick: () => { togglePalette(); toggle.setAttribute('aria-expanded', String(P.open)); } });
    toggle.setAttribute('aria-expanded', String(P.open));
    const copy = el('button', { className: 'dn-btn dn-primary', type: 'button', textContent: 'Copy request', title: 'Copy a request to paste in Claude Design\'s chat', onclick: () => copyRequest(copy) });
    copy.dataset.needsChanges = '';
    const resetAll = el('button', { className: 'dn-btn', type: 'button', textContent: 'Reset', title: 'Back to the colors saved in Palette.dc.html', onclick: () => setDraft({}) });
    resetAll.dataset.needsChanges = '';
    const note = el('p', { className: 'dn-foot-note' });
    note.innerHTML = 'Editing the <b class="dn-foot-mode"></b> mode value of each input; the navbar switch picks the mode. Changes stay in this browser until Palette.dc.html is updated: copy the request, paste it in Claude Design\'s chat, then run <code>design-loop</code> in the repo.';
    foot = el('section', { className: 'dn-foot', ariaLabel: 'Palette' }, [
      el('div', { className: 'dn-foot-head' }, [toggle, el('div', { className: 'dn-foot-status' }), resetAll, copy]),
      el('div', { className: 'dn-foot-body' }, [el('div', { className: 'dn-foot-rows' }), note, el('textarea', { className: 'dn-req', readOnly: true, rows: 3, ariaLabel: 'Request for Claude Design' })])
    ]);
    html.classList.toggle('dn-foot-open', P.open);
    document.body.append(foot);
    updateFoot();
    new ResizeObserver(layout).observe(foot);
  }
  // Palette.dc.html holds the saved inputs (data-props) and the engine that turns them into tokens (its script, up to
  // the component class), the same one palette.mjs mirrors.
  function loadPalette() {
    fetch(new URL(PALETTE, root)).then(r => r.ok ? r.text() : Promise.reject(new Error(r.status))).then(src => {
      const tag = new DOMParser().parseFromString(src, 'text/html').querySelector('script[data-dc-script]');
      const code = tag.textContent, end = code.indexOf('\nclass Component');
      const props = JSON.parse(tag.dataset.props || '{}'), inputs = props.inputs && props.inputs.default;
      if (end < 0) return;
      const eng = new Function(code.slice(0, end) + '\nreturn { BRAND, fromInputs, buildWebCss, buildSchemeCss, runAudit, hasInputs };')();
      if (!eng.hasInputs(inputs)) return;
      P.eng = eng; P.base = inputs; P.prefix = (props.prefix && props.prefix.default) || '';
      try { const d = JSON.parse(localStorage.getItem(DRAFT)); if (d && typeof d === 'object' && !Array.isArray(d)) P.draft = d; } catch {}
      P.draft = diff(merged()); // drops the changes Palette.dc.html already has
      mountFoot(); paletteChanged();
    }).catch(() => {});
  }

  function render() {
    if (!bar) return;
    html.classList.toggle('dn-open', state.open);
    html.classList.toggle('dn-dark', state.mode === 'dark');
    bar.querySelector('.dn-burger').setAttribute('aria-expanded', String(state.open));
    const secs = bar.querySelector('.dn-sections');
    secs.replaceChildren(...state.sections.map(([e, label]) => {
      const btn = el('button', { type: 'button', textContent: label, onclick: () => jump(e) });
      if (label === state.active) btn.setAttribute('aria-current', 'true');
      return btn;
    }));
    const sw = bar.querySelector('.dn-switch');
    sw.setAttribute('aria-checked', String(state.mode === 'dark'));
    sw.querySelector('small').textContent = state.mode === 'dark' ? 'Dark' : 'Light';
    bar.querySelector('.dn-title').textContent = pageTitle();
    const nav = side.querySelector('nav');
    const link = (path, label, kids = []) => {
      const a = el('a', { href: hrefOf(path), title: path }, [...kids, label]);
      if (path === here) a.setAttribute('aria-current', 'page');
      a.addEventListener('click', () => { if (!wide()) { state.open = false; render(); } });
      return a;
    };
    const paletteLink = link(PALETTE, '', [paletteIcon()]);
    paletteLink.className = 'dn-side-palette';
    paletteLink.title = 'Palette';
    paletteLink.ariaLabel = 'Palette';
    if (cards === null || screens === null) { nav.replaceChildren(paletteLink, el('div', { className: 'dn-note', textContent: 'Loading cards…' })); return; }
    const others = cards.filter(c => c.path !== PALETTE);
    if (!others.length && !screens.length) { nav.replaceChildren(paletteLink, el('div', { className: 'dn-note', textContent: 'No card list: open this page inside its Claude Design project.' })); return; }
    const groups = new Map(screens.length ? [['Pages', screens.map(s => ({ path: s.path, label: s.name }))]] : []);
    others.forEach(c => { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push({ path: c.path, label: labelOf(c.path) }); });
    nav.replaceChildren(paletteLink, ...[...groups].flatMap(([group, list]) => [el('div', { className: 'dn-group', textContent: group }), ...list.map(c => link(c.path, c.label))]));
  }

  function mount() {
    html.setAttribute('data-design-nav', '');
    document.head.append(el('style', { textContent: css }));
    const paletteLink = el('a', { className: 'dn-palette', href: hrefOf(PALETTE), title: 'Palette', ariaLabel: 'Palette' }, [paletteIcon()]);
    if (here === PALETTE) paletteLink.setAttribute('aria-current', 'page');
    bar = el('header', { className: 'dn-bar' }, [
      el('button', { className: 'dn-burger', type: 'button', title: 'Cards', ariaLabel: 'Toggle the card list', onclick: toggleSide }, [el('span'), el('span'), el('span')]),
      paletteLink,
      el('div', { className: 'dn-title', textContent: pageTitle() }),
      el('div', { className: 'dn-sections' }),
      el('button', { className: 'dn-switch', type: 'button', role: 'switch', ariaLabel: 'Dark mode', onclick: () => window.designNav.setMode(state.mode === 'dark' ? 'light' : 'dark') }, [el('small'), el('span', { className: 'dn-track' }, [el('i')])])
    ]);
    side = el('aside', { className: 'dn-side' }, [el('nav', { ariaLabel: 'Cards' })]);
    if (!wide()) state.open = false;
    document.body.append(bar, side);
    layout(); scanSections(); render(); mountFoot();
    let queued = false;
    new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scanSections(); }); })
      .observe(document.body, { childList: true, subtree: true });
    addEventListener('scroll', spy, { passive: true });
    addEventListener('resize', () => { layout(); render(); });
  }

  fetch(new URL('_ds_manifest.json', root)).then(r => r.ok ? r.json() : null).then(j => {
    cards = (Array.isArray(j && j.cards) ? j.cards : []).filter(c => c && typeof c.path === 'string').map(c => ({ path: c.path, group: c.group || 'Other' }));
    render();
  }, () => { cards = []; render(); });
  fetch(new URL(SCREENS, root)).then(r => r.ok ? r.json() : null).then(j => {
    screens = (Array.isArray(j && j.screens) ? j.screens : [])
      .filter(s => s && typeof s.path === 'string' && /^screens\//.test(s.path))
      .map(s => ({ path: s.path, name: typeof s.name === 'string' && s.name ? s.name : labelOf(s.path) }));
    render();
  }, () => { screens = []; render(); });
  loadPalette();
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
