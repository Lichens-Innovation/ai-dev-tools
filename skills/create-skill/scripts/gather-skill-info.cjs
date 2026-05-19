const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('\n--- New Skill Info ---');
  const name = await ask('Skill name (kebab-case, e.g. my-skill): ');
  const description = await ask('Description (what it does): ');
  const triggers = await ask('When to trigger (e.g. "user asks to review code"): ');

  const pluginsDir = require('fs').readdirSync(require('path').resolve(__dirname, '../../../plugins'));
  const pluginList = pluginsDir.join(', ');
  const plugin = await ask(`Target plugin (${pluginList}): `);

  rl.close();

  console.log(JSON.stringify({
    name: name.trim(),
    description: description.trim(),
    triggers: triggers.trim(),
    plugin: plugin.trim(),
  }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
