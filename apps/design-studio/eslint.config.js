//  @ts-check

import sharedConfig from '@repo/eslint-config'

export default [
  ...sharedConfig,
  // The fixture project is data (it ships a copy of the plugin's palette.ts, which must stay byte-identical).
  { ignores: ['test/fixtures/**', 'dist/**', 'src/routeTree.gen.ts'] },
]
