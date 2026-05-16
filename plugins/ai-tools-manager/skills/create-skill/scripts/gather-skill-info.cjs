const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Marketplace / plugin helpers
// ---------------------------------------------------------------------------

function getLocalMarketplaces() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  return Object.entries(settings.extraKnownMarketplaces || {})
    .filter(([, v]) => v.source?.source === 'directory')
    .map(([name, v]) => ({ name, path: v.source.path }));
}

function getPlugins(marketplacePath) {
  const manifestPath = path.join(marketplacePath, '.claude-plugin', 'marketplace.json');
  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return (data.plugins || []).map((p) => p.name);
}

// ---------------------------------------------------------------------------
// Browser launcher (cross-platform)
// ---------------------------------------------------------------------------

function openBrowser(url) {
  const platform = os.platform();
  const cmd =
    platform === 'darwin' ? `open "${url}"` :
    platform === 'win32'  ? `start "" "${url}"` :
                            `xdg-open "${url}"`;
  exec(cmd);
}

// ---------------------------------------------------------------------------
// HTML form
// ---------------------------------------------------------------------------

function buildHTML(marketplaces) {
  const byMarketplace = Object.fromEntries(
    marketplaces.map((m) => [m.name, getPlugins(m.path)])
  );
  const data = JSON.stringify({ marketplaces: marketplaces.map((m) => m.name), byMarketplace });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Skill</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0d0d0d; color: #e8e8e8; display: flex;
         justify-content: center; align-items: flex-start;
         min-height: 100vh; padding: 24px 16px; overflow-y: auto; }
  .card { background: #1a1a1a; border: 1px solid #2e2e2e; border-radius: 12px;
          padding: 40px; width: 100%; max-width: 780px;
          min-height: calc(100vh - 48px); display: flex; flex-direction: column; }
  h1 { font-size: 1.125rem; font-weight: 600; margin-bottom: 6px;
       color: #fff; letter-spacing: -0.01em; }
  .subtitle { font-size: 0.82rem; color: #666; margin-bottom: 24px; }

  /* Mode cards */
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 28px; }
  .mode-card { border: 1px solid #2e2e2e; border-radius: 10px; padding: 16px;
               cursor: pointer; transition: border-color 0.15s, background 0.15s;
               user-select: none; }
  .mode-card:hover { border-color: #444; }
  .mode-card.active { border-color: #e8e8e8; background: #222; }
  .mode-card input[type=radio] { display: none; }
  .mode-title { font-size: 0.88rem; font-weight: 600; color: #e8e8e8; margin-bottom: 6px; }
  .mode-desc { font-size: 0.77rem; color: #777; line-height: 1.45; }
  .mode-card.active .mode-desc { color: #999; }

  /* Fields */
  .fields { display: none; }
  .fields.visible { display: block; }
  .field { margin-bottom: 18px; }
  .divider { border: none; border-top: 1px solid #2e2e2e; margin: 4px 0 22px; }
  label { display: block; font-size: 0.78rem; font-weight: 500;
          color: #999; margin-bottom: 6px; text-transform: uppercase;
          letter-spacing: 0.04em; }
  input, select, textarea { width: 100%; background: #111; border: 1px solid #2e2e2e;
                  border-radius: 8px; padding: 10px 12px; font-size: 0.9rem;
                  color: #e8e8e8; outline: none; appearance: none;
                  font-family: inherit; resize: vertical; }
  input::placeholder, textarea::placeholder { color: #555; }
  input:focus, select:focus, textarea:focus { border-color: #555; }
  select option { background: #1a1a1a; }
  .hint { font-size: 0.75rem; color: #555; margin-top: 4px; }

  #form { display: flex; flex-direction: column; flex: 1; }
  .form-body { flex: 1; }
  .form-footer { margin-top: auto; padding-top: 24px; }

  button[type=submit] { width: 100%; padding: 13px;
           background: #e8e8e8; color: #0d0d0d; border: none;
           border-radius: 8px; font-size: 0.95rem; font-weight: 600;
           cursor: pointer; }
  button[type=submit]:hover { background: #fff; }
  button[type=submit]:disabled { opacity: 0.4; cursor: not-allowed; }

  .success { display: none; text-align: center; flex: 1;
             justify-content: center; align-items: center; flex-direction: column; }
  .success h2 { font-size: 1rem; color: #fff; margin-bottom: 8px; }
  .success p { font-size: 0.85rem; color: #666; }
</style>
</head>
<body>
<div class="card">
  <h1>New Skill</h1>
  <p class="subtitle">Choose how you want to create the skill.</p>

  <form id="form">
    <input type="hidden" name="mode" id="modeInput" value="auto">

    <div class="form-body">
      <div class="modes">
        <label class="mode-card active" id="cardAuto">
          <input type="radio" name="_mode" value="auto" checked>
          <div class="mode-title">Auto</div>
          <div class="mode-desc">Describe your idea in plain language. Claude generates the skill name, formats the description, and writes the full skill content for you.</div>
        </label>
        <label class="mode-card" id="cardManual">
          <input type="radio" name="_mode" value="manual">
          <div class="mode-title">Manual</div>
          <div class="mode-desc">Provide the name, description, and trigger conditions yourself. Claude creates a structured template you fill in.</div>
        </label>
      </div>

      <hr class="divider">

      <!-- Auto fields -->
      <div class="fields visible" id="autoFields">
        <div class="field">
          <label>Skill name</label>
          <input name="name" placeholder="my-skill" pattern="[a-z][a-z0-9-]*"
                 autocomplete="off" spellcheck="false">
          <p class="hint">kebab-case — leave blank to let Claude derive one from your idea</p>
        </div>
        <div class="field">
          <label>Describe your skill idea</label>
          <textarea name="idea" rows="6"
            placeholder="e.g. A skill that reviews database migrations for safety issues — checks for missing rollbacks, destructive operations on large tables, and missing indexes on foreign keys."></textarea>
        </div>
      </div>

      <!-- Manual fields -->
      <div class="fields" id="manualFields">
        <div class="field">
          <label>Skill name</label>
          <input name="name" placeholder="my-skill" pattern="[a-z][a-z0-9-]*"
                 autocomplete="off" spellcheck="false">
          <p class="hint">kebab-case, e.g. code-review</p>
        </div>
        <div class="field">
          <label>Description</label>
          <input name="description" placeholder="What this skill does">
        </div>
        <div class="field">
          <label>When to trigger</label>
          <input name="triggers" placeholder='e.g. "user asks to review code"'>
        </div>
      </div>

      <hr class="divider">

      <div class="field">
        <label>Marketplace</label>
        <select name="marketplace" id="marketplace"></select>
      </div>
      <div class="field">
        <label>Plugin</label>
        <select name="plugin" id="plugin"></select>
      </div>
    </div>

    <div class="form-footer">
      <button type="submit">Create Skill</button>
    </div>
  </form>

  <div class="success" id="success">
    <h2>Done! You can close this tab.</h2>
    <p>Returning control to Claude…</p>
  </div>
</div>
<script>
  const { marketplaces, byMarketplace } = ${data};

  const mktSelect = document.getElementById('marketplace');
  const pluginSelect = document.getElementById('plugin');

  function populatePlugins(marketplace) {
    pluginSelect.innerHTML = '';
    (byMarketplace[marketplace] || []).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      pluginSelect.appendChild(opt);
    });
  }

  marketplaces.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    mktSelect.appendChild(opt);
  });
  if (marketplaces.length) populatePlugins(marketplaces[0]);
  mktSelect.addEventListener('change', () => populatePlugins(mktSelect.value));

  // Mode switching
  const cardAuto = document.getElementById('cardAuto');
  const cardManual = document.getElementById('cardManual');
  const autoFields = document.getElementById('autoFields');
  const manualFields = document.getElementById('manualFields');
  const modeInput = document.getElementById('modeInput');

  function setMode(mode) {
    modeInput.value = mode;
    if (mode === 'auto') {
      cardAuto.classList.add('active');
      cardManual.classList.remove('active');
      autoFields.classList.add('visible');
      manualFields.classList.remove('visible');
      manualFields.querySelectorAll('input,textarea').forEach(el => el.removeAttribute('required'));
      autoFields.querySelectorAll('textarea').forEach(el => el.setAttribute('required', ''));
    } else {
      cardManual.classList.add('active');
      cardAuto.classList.remove('active');
      manualFields.classList.add('visible');
      autoFields.classList.remove('visible');
      autoFields.querySelectorAll('textarea').forEach(el => el.removeAttribute('required'));
      manualFields.querySelectorAll('input').forEach(el => el.setAttribute('required', ''));
    }
  }

  cardAuto.addEventListener('click', () => setMode('auto'));
  cardManual.addEventListener('click', () => setMode('manual'));
  setMode('auto');

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd);
    delete payload._mode;
    await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    document.getElementById('form').style.display = 'none';
    document.getElementById('success').style.display = 'flex';
  });
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const targetDir = process.argv[2] || process.env.PWD || process.cwd();
  const marketplaces = getLocalMarketplaces();
  if (marketplaces.length === 0) throw new Error('No local directory marketplaces found in ~/.claude/settings.json');

  const result = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/submit') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
            server.close();
            resolve(data);
          } catch (err) {
            reject(err);
          }
        });
      } else {
        const html = buildHTML(marketplaces);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      console.error(`Opening form at http://127.0.0.1:${port}`);
      openBrowser(`http://127.0.0.1:${port}`);
    });

    server.on('error', reject);
  });

  const marketplacePath = marketplaces.find((m) => m.name === result.marketplace)?.path;
  if (!marketplacePath) throw new Error(`Marketplace not found: ${result.marketplace}`);

  const output = JSON.stringify({
    mode: result.mode,
    ...(result.mode === 'auto'
      ? { idea: result.idea?.trim() }
      : {
          name: result.name?.trim(),
          description: result.description?.trim(),
          triggers: result.triggers?.trim(),
        }),
    marketplacePath,
    plugin: result.plugin,
  });

  fs.writeFileSync(path.join(targetDir, 'skill-gather-info.json'), output, 'utf8');
  console.log(output);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
