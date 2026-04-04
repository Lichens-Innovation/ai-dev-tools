const argv = process.argv.slice(2);

function main(): void {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`code-crawler — CLI Node (Vite + TypeScript)

Usage:
  code-crawler [options]

Options:
  -h, --help    Show this message
`);
    return;
  }

  console.log('code-crawler — prêt. Ajoutez votre logique dans src/.');
}

main();
