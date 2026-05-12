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

function getPlugins(marketplacePath) {
  const marketplaceJson = path.join(marketplacePath, '.claude-plugin', 'marketplace.json');
  const data = JSON.parse(fs.readFileSync(marketplaceJson, 'utf8'));
  return (data.plugins || []).map((p) => p.name);
}

async function pickFromList(prompt, items) {
  items.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  const answer = await ask(`${prompt} (number): `);
  const index = parseInt(answer.trim(), 10) - 1;
  if (index < 0 || index >= items.length) throw new Error('Invalid selection');
  return items[index];
}

async function main() {
  console.log('\n--- New Skill Info ---');
  const name = await ask('Skill name (kebab-case, e.g. my-skill): ');
  const description = await ask('Description (what it does): ');
  const triggers = await ask('When to trigger (e.g. "user asks to review code"): ');

  const marketplaces = getLocalMarketplaces();
  if (marketplaces.length === 0) throw new Error('No local directory marketplaces found in ~/.claude/settings.json');

  console.log('\nAvailable marketplaces:');
  const marketplace = await pickFromList('Target marketplace', marketplaces.map((m) => m.name));
  const marketplacePath = marketplaces.find((m) => m.name === marketplace).path;

  const plugins = getPlugins(marketplacePath);
  console.log('\nAvailable plugins:');
  const plugin = await pickFromList('Target plugin', plugins);

  rl.close();

  console.log(JSON.stringify({
    name: name.trim(),
    description: description.trim(),
    triggers: triggers.trim(),
    marketplacePath,
    plugin,
  }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
