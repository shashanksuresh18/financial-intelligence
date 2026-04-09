import {
  placeholderConfidence,
  type ConfidenceScore,
} from "@/lib/types";

interface ConfidenceBadgeProps {
  confidence?: ConfidenceScore;
}

export function ConfidenceBadge({
  confidence = placeholderConfidence,
}: ConfidenceBadgeProps) {
  return (
    <span className="inline-flex rounded-full border px-3 py-1 text-sm font-medium">
      {confidence.level} confidence ({confidence.score})
    </span>
  );
}

export default ConfidenceBadge;
