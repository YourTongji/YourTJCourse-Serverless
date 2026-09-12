import type { ButtonHTMLAttributes } from 'react'
import { cn } from './utils'

type ButtonVariant = 'primary' | 'ghost'
type ButtonSize = 'default' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/*
 * Button grammar borrowed from shadcn/ui: one component, variant and size props,
 * class strings composed from semantic tokens so no `dark:` override is needed.
 * The focus ring comes from the global `:focus-visible` rule in index.css.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Brand green with near-black text (7.9:1), white only on the pressed, darker fill.
  primary: 'bg-action font-semibold text-on-action hover:bg-action-hover active:bg-action-pressed active:text-white',
  ghost: 'font-medium text-tertiary hover:bg-surface/80 hover:text-primary active:bg-surface',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: 'h-11 gap-2 px-5 text-[15px]',
  sm: 'h-9 gap-1.5 px-3 text-[13px]',
}

export function Button({
  className,
  variant = 'primary',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  )
}
