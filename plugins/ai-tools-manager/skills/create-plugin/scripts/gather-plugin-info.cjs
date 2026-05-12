const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getLocalMarketplaces() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  return Object.entries(settings.extraKnownMarketplaces || {})
    .filter(([, v]) => v.source?.source === 'directory')
    .map(([name, v]) => ({ name, path: v.source.path }));
}

function openBrowser(url) {
  const platform = os.platform();
  const cmd =
    platform === 'darwin' ? `open "${url}"` :
    platform === 'win32'  ? `start "" "${url}"` :
                            `xdg-open "${url}"`;
  exec(cmd);
}

function buildHTML(marketplaces) {
  const mktOptions = marketplaces
    .map((m) => `<option value="${m.name}">${m.name}</option>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Plugin</title>
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
  .subtitle { font-size: 0.82rem; color: #666; margin-bottom: 28px; }
  #form { display: flex; flex-direction: column; flex: 1; }
  .form-body { flex: 1; }
  .form-footer { margin-top: auto; padding-top: 24px; }
  .field { margin-bottom: 18px; }
  .divider { border: none; border-top: 1px solid #2e2e2e; margin: 4px 0 22px; }
  label { display: block; font-size: 0.78rem; font-weight: 500;
          color: #999; margin-bottom: 6px; text-transform: uppercase;
          letter-spacing: 0.04em; }
  input, select { width: 100%; background: #111; border: 1px solid #2e2e2e;
                  border-radius: 8px; padding: 10px 12px; font-size: 0.9rem;
                  color: #e8e8e8; outline: none; appearance: none; font-family: inherit; }
  input::placeholder { color: #555; }
  input:focus, select:focus { border-color: #555; }
  select option { background: #1a1a1a; }
  .hint { font-size: 0.75rem; color: #555; margin-top: 4px; }
  button[type=submit] { width: 100%; padding: 13px;
           background: #e8e8e8; color: #0d0d0d; border: none;
           border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; }
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
  <h1>New Plugin</h1>
  <p class="subtitle">Scaffold a new plugin inside a marketplace.</p>

  <form id="form">
    <div class="form-body">
      <div class="field">
        <label>Plugin name</label>
        <input name="name" required pattern="[a-z][a-z0-9-]*"
               placeholder="my-plugin" autocomplete="off" spellcheck="false">
        <p class="hint">kebab-case, e.g. code-review</p>
      </div>
      <div class="field">
        <label>Description</label>
        <input name="description" required placeholder="What this plugin provides">
      </div>
      <div class="field">
        <label>Keywords</label>
        <input name="keywords" placeholder="review, testing, ci — comma-separated">
        <p class="hint">Used for discovery in the marketplace</p>
      </div>

      <hr class="divider">

      <div class="field">
        <label>Marketplace</label>
        <select name="marketplace">${mktOptions}</select>
      </div>
    </div>

    <div class="form-footer">
      <button type="submit">Create Plugin</button>
    </div>
  </form>

  <div class="success" id="success">
    <h2>Done! You can close this tab.</h2>
    <p>Returning control to Claude…</p>
  </div>
</div>
<script>
  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    const fd = new FormData(e.target);
    await fetch('/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(fd)),
    });
    document.getElementById('form').style.display = 'none';
    document.getElementById('success').style.display = 'flex';
  });
</script>
</body>
</html>`;
}

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
          } catch (err) { reject(err); }
        });
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildHTML(marketplaces));
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
    name: result.name.trim(),
    description: result.description.trim(),
    keywords: (result.keywords || '').split(',').map((k) => k.trim()).filter(Boolean),
    marketplacePath,
  });

  fs.writeFileSync(path.join(targetDir, 'plugin-gather-info.json'), output, 'utf8');
  console.log(output);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
