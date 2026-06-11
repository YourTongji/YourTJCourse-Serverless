interface SegmentedControlProps {
  options: { value: string; label: string; icon?: React.ReactNode }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function SegmentedControl({ options, value, onChange, className = '' }: SegmentedControlProps) {
  return (
    <div className={`inline-flex items-center gap-1 bg-slate-100/50 p-1 rounded-full ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
            value === option.value
              ? 'bg-white text-cyan-700 shadow-sm'
              : 'text-slate-600 hover:text-cyan-600 hover:bg-white/60'
          }`}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}
