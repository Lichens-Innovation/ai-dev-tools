import { createFileRoute } from '@tanstack/react-router'
import { TailwindPage } from '#/components/tailwind/tailwind-page'

export const Route = createFileRoute('/tailwind')({
  component: TailwindPage,
})
