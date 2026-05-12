const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('\n--- New Plugin Info ---');
  const name = await ask('Plugin name (kebab-case, e.g. my-plugin): ');
  const description = await ask('Description (what the plugin provides): ');
  const keywords = await ask('Keywords (comma-separated, e.g. react,frontend): ');

  rl.close();

  console.log(JSON.stringify({
    name: name.trim(),
    description: description.trim(),
    keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
  }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
