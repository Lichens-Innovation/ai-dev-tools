import { useState } from 'react'
import { isHex, normHex, validToken } from '#/palette/draft'

/** A hex field: what is typed stays in the field until it is a valid color, then it joins the draft. */
export function HexField({
  id,
  label,
  value,
  onValid,
  className,
}: {
  id?: string
  label: string
  value: string
  onValid: (hex: string) => void
  className?: string
}) {
  const [typing, setTyping] = useState<string | null>(null)
  return (
    <input
      id={id}
      type="text"
      spellCheck={false}
      maxLength={7}
      aria-label={label}
      aria-invalid={typing !== null && !isHex(typing)}
      value={typing ?? value}
      onChange={(e) => {
        setTyping(e.target.value)
        if (isHex(e.target.value)) onValid(normHex(e.target.value))
      }}
      onBlur={() => setTyping(null)}
      className={className}
    />
  )
}

/** A token value field: an invalid value (empty, or with ; { }) stays in the field and is not drafted. */
export function TokenField({
  id,
  label,
  value,
  disabled,
  title,
  onValid,
  className,
  style,
}: {
  id?: string
  label: string
  value: string
  disabled?: boolean
  title?: string
  onValid: (next: string) => void
  className?: string
  style?: React.CSSProperties
}) {
  const [typing, setTyping] = useState<string | null>(null)
  return (
    <input
      id={id}
      type="text"
      spellCheck={false}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-invalid={typing !== null && !validToken(typing)}
      value={typing ?? value}
      onChange={(e) => {
        setTyping(e.target.value)
        if (validToken(e.target.value)) onValid(e.target.value.trim())
      }}
      onBlur={() => setTyping(null)}
      className={className}
      style={style}
    />
  )
}
