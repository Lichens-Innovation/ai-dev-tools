import { createFileRoute } from '@tanstack/react-router'
import { PalettePage } from '#/components/palette/palette-page'

export const Route = createFileRoute('/palette')({
  component: PalettePage,
})
