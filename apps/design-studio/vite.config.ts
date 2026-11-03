import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const port = Number(process.env.STUDIO_PORT ?? 3009)

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
  server: {
    port,
    strictPort: true,
    host: true,
    // The mounted project is not part of the app: never reload the app because a design file changed.
    watch: { ignored: ['**/project/**'] },
  },
})
