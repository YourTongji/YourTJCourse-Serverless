import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

interface SegmentedControlProps {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function SegmentedControl({ options, value, onChange, className = "" }: SegmentedControlProps) {
  return (
    <ToggleGroup value={[value]} onValueChange={(v) => { const next = v?.[0]; if (next) onChange(next); }} className={className}>
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label} className="rounded-full px-4 gap-1.5">
          {opt.icon && <span className="w-4 h-4">{opt.icon}</span>}
          <span>{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
