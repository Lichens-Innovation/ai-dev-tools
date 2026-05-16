const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function openBrowser(url) {
  const platform = os.platform();
  const cmd =
    platform === 'darwin' ? `open "${url}"` :
    platform === 'win32'  ? `start "" "${url}"` :
                            `xdg-open "${url}"`;
  exec(cmd);
}

function buildHTML(defaultDir) {
  const escaped = defaultDir.replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Marketplace</title>
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
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .divider { border: none; border-top: 1px solid #2e2e2e; margin: 4px 0 22px; }
  label { display: block; font-size: 0.78rem; font-weight: 500;
          color: #999; margin-bottom: 6px; text-transform: uppercase;
          letter-spacing: 0.04em; }
  input[type=text], input[type=email], input[type=url] {
    width: 100%; background: #111; border: 1px solid #2e2e2e;
    border-radius: 8px; padding: 10px 12px; font-size: 0.9rem;
    color: #e8e8e8; outline: none; font-family: inherit; }
  input::placeholder { color: #555; }
  input:focus { border-color: #555; }
  .hint { font-size: 0.75rem; color: #555; margin-top: 4px; }
  .opt { font-size: 0.75rem; color: #555; text-transform: none; letter-spacing: 0; }
  .checkbox-row { display: flex; align-items: center; gap: 10px;
                  background: #111; border: 1px solid #2e2e2e;
                  border-radius: 8px; padding: 12px; cursor: pointer; }
  .checkbox-row input[type=checkbox] { width: 16px; height: 16px;
                  accent-color: #e8e8e8; cursor: pointer; flex-shrink: 0; }
  .checkbox-row span { font-size: 0.88rem; color: #ccc; }
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
  <h1>New Marketplace</h1>
  <p class="subtitle">Scaffold a new Claude Code plugin marketplace.</p>

  <form id="form">
    <div class="form-body">
      <div class="field">
        <label>Marketplace name</label>
        <input type="text" name="name" required pattern="[a-z][a-z0-9-]*"
               placeholder="my-marketplace" autocomplete="off" spellcheck="false">
        <p class="hint">kebab-case — <code>anthropic-marketplace</code>, <code>claude-code-plugins</code>, and <code>agent-skills</code> are reserved</p>
      </div>
      <div class="field">
        <label>Description</label>
        <input type="text" name="description" required placeholder="What this marketplace provides">
      </div>

      <hr class="divider">

      <div class="row">
        <div class="field">
          <label>Owner name</label>
          <input type="text" name="ownerName" required placeholder="Your Name">
        </div>
        <div class="field">
          <label>Owner email</label>
          <input type="email" name="ownerEmail" required placeholder="you@example.com">
        </div>
      </div>
      <div class="field">
        <label>Homepage <span class="opt">(optional)</span></label>
        <input type="url" name="homepage" placeholder="https://github.com/your-org/my-marketplace">
      </div>

      <hr class="divider">

      <div class="field">
        <label>Target directory</label>
        <input type="text" name="targetDir" required value="${escaped}">
        <p class="hint">Directory where the marketplace will be created</p>
      </div>
      <div class="field">
        <label>Repository access</label>
        <label class="checkbox-row">
          <input type="checkbox" name="privateRepo" id="privateRepo">
          <span>This marketplace will be hosted in a private repository</span>
        </label>
      </div>
    </div>

    <div class="form-footer">
      <button type="submit">Create Marketplace</button>
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
    const payload = Object.fromEntries(fd);
    payload.privateRepo = document.getElementById('privateRepo').checked;
    await fetch('/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
  const defaultDir = path.join(targetDir, 'my-marketplace');

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
        res.end(buildHTML(defaultDir));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      console.error(`Opening form at http://127.0.0.1:${port}`);
      openBrowser(`http://127.0.0.1:${port}`);
    });
    server.on('error', reject);
  });

  const output = JSON.stringify({
    name: result.name.trim(),
    description: result.description.trim(),
    ownerName: result.ownerName.trim(),
    ownerEmail: result.ownerEmail.trim(),
    homepage: result.homepage?.trim() || '',
    targetDir: result.targetDir.trim(),
    privateRepo: result.privateRepo === true || result.privateRepo === 'on',
  });

  fs.writeFileSync(path.join(targetDir, 'marketplace-gather-info.json'), output, 'utf8');
  console.log(output);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
