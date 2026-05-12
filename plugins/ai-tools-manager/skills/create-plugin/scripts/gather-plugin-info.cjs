const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

function getLocalMarketplaces() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  return Object.entries(settings.extraKnownMarketplaces || {})
    .filter(([, v]) => v.source?.source === 'directory')
    .map(([name, v]) => ({ name, path: v.source.path }));
}

async function pickFromList(prompt, items) {
  items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  const answer = await ask(`${prompt} (number): `);
  const index = parseInt(answer.trim(), 10) - 1;
  if (index < 0 || index >= items.length) throw new Error('Invalid selection');
  return items[index];
}

async function main() {
  console.log('\n--- New Plugin Info ---');
  const name = await ask('Plugin name (kebab-case, e.g. my-plugin): ');
  const description = await ask('Description (what the plugin provides): ');
  const keywords = await ask('Keywords (comma-separated, e.g. react,frontend): ');

  const marketplaces = getLocalMarketplaces();
  if (marketplaces.length === 0) throw new Error('No local directory marketplaces found in ~/.claude/settings.json');

  console.log('\nAvailable marketplaces:');
  const marketplace = await pickFromList('Target marketplace', marketplaces.map((m) => m.name));
  const marketplacePath = marketplaces.find((m) => m.name === marketplace).path;

  rl.close();

  console.log(JSON.stringify({
    name: name.trim(),
    description: description.trim(),
    keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
    marketplacePath,
  }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
