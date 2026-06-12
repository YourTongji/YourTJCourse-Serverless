import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

interface StarRatingProps {
  rating: number;
  size?: number;
  showValue?: boolean;
  className?: string;
}

export default function StarRating({
  rating,
  size = 14,
  showValue = false,
  className = "",
}: StarRatingProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}
        />
      ))}
      {showValue && (
        <span className="ml-1 text-sm font-bold text-amber-600">
          {rating.toFixed(1)}
        </span>
      )}
    </span>
  );
}
