const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const RESERVED_NAMES = new Set([
  'anthropic-marketplace',
  'claude-code-plugins',
  'agent-skills',
]);

async function main() {
  console.log('\n--- New Marketplace Info ---');

  let name = '';
  while (!name) {
    name = (await ask('Marketplace name (kebab-case, unique): ')).trim();
    if (RESERVED_NAMES.has(name)) {
      console.log(`"${name}" is reserved by Anthropic. Pick another.`);
      name = '';
    }
  }

  const description = await ask('Description (what the marketplace catalogs): ');
  const ownerName = await ask('Owner name: ');
  const ownerEmail = await ask('Owner email: ');
  const homepage = await ask('Homepage URL (optional, blank to skip): ');
  const targetDir = await ask('Target directory (e.g. ./my-marketplace, blank = current dir): ');
  const privateRepo = await ask('Private repo? (y/N): ');

  rl.close();

  console.log(JSON.stringify({
    name,
    description: description.trim(),
    owner: { name: ownerName.trim(), email: ownerEmail.trim() },
    homepage: homepage.trim() || null,
    targetDir: targetDir.trim() || '.',
    privateRepo: /^y(es)?$/i.test(privateRepo.trim()),
  }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
