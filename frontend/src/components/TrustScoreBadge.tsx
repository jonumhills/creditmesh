interface Props {
  score: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

const tierColor = (score: number) => {
  if (score >= 81) return "text-green-400 border-green-400";
  if (score >= 61) return "text-blue-400 border-blue-400";
  if (score >= 41) return "text-yellow-400 border-yellow-400";
  return "text-red-400 border-red-400";
};

const tierLabel = (score: number) => {
  if (score >= 81) return "FULL ACCESS";
  if (score >= 61) return "MEDIUM";
  if (score >= 41) return "SMALL ONLY";
  return "NO ACCESS";
};

export function TrustScoreBadge({ score, showLabel = true, size = "md" }: Props) {
  const sizeClass = size === "lg" ? "text-2xl px-4 py-2" : size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";
  return (
    <span className={`inline-flex items-center gap-2 border rounded font-mono font-bold ${sizeClass} ${tierColor(score)}`}>
      <span>{score}</span>
      {showLabel && <span className="text-xs opacity-70">{tierLabel(score)}</span>}
    </span>
  );
}
