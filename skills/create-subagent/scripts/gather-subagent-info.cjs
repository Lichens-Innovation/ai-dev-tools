const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('\n--- New Subagent Info ---');
  const name = await ask('Subagent name (kebab-case, e.g. backend-agent): ');
  const description = await ask('Description (role and responsibilities): ');
  const triggers = await ask('When to use (e.g. "user asks to run backend tasks"): ');
  const tools = await ask('Tools/skills it uses (comma-separated, e.g. Read,Edit,Bash): ');

  const pluginsDir = fs.readdirSync(path.resolve(__dirname, '../../../plugins'));
  const plugin = await ask(`Target plugin (${pluginsDir.join(', ')}): `);

  rl.close();

  console.log(JSON.stringify({
    name: name.trim(),
    description: description.trim(),
    triggers: triggers.trim(),
    tools: tools.split(',').map((t) => t.trim()).filter(Boolean),
    plugin: plugin.trim(),
  }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
