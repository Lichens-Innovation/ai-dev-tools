import type { ReactNode } from 'react'

interface SuccessStateProps {
  icon: ReactNode
  title: string
  description: ReactNode
}

export default function SuccessState({ icon, title, description }: SuccessStateProps) {
  return (
    <div className="py-[120px] flex flex-col items-center text-center [animation:csFadeIn_.3s]">
      <div className="w-14 h-14 rounded-full bg-(--primary-dim) text-(--primary) flex items-center justify-center mb-[22px] [animation:csPop_.4s_cubic-bezier(.2,.9,.3,1.4)]">
        {icon}
      </div>
      <h1 className="m-0 text-[26px] font-bold text-(--ink) tracking-[-0.5px]">{title}</h1>
      <p className="mt-3 mb-0 text-sm text-(--ink-3) max-w-[460px] leading-relaxed">{description}</p>
    </div>
  )
}
