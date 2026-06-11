import type { ReactNode } from "react";
import { Card } from "~/components/ui/card";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  hover?: boolean;
}

export default function GlassCard({ children, className = "", style, onClick, hover = true }: GlassCardProps) {
  return (
    <Card
      onClick={onClick}
      style={style}
      className={`glass-card ${hover ? "transition-all duration-300 cursor-pointer active:scale-[0.98] md:hover:scale-[1.02]" : ""} ${className}`}
    >
      {children}
    </Card>
  );
}
