interface LogoProps {
  size?: number
  animate?: boolean
  className?: string
}

export default function Logo({ size = 48, animate = false, className = '' }: LogoProps) {
  if (animate) {
    return (
      <img
        src="/favicon.svg"
        width={size}
        height={size}
        alt="Logo"
        className={`${className} yourtj-logo-spin`}
      />
    )
  }

  return <img src="/favicon.svg" width={size} height={size} alt="Logo" className={className} />
}
