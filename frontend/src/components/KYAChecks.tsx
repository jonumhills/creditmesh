/**
 * KYAChecks — renders verification badge pills like the AgentWall check style.
 * Shows: KYA Status | Score Tier | Role | Active | X Layer
 */

interface Props {
  kycPassed: boolean;
  trustScore: number;
  role: string;
  active: boolean;
  compact?: boolean;
}

export function KYAChecks({ kycPassed, trustScore, role, active, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-1">
        <CheckBadge ok={kycPassed} label={kycPassed ? "KYA ✓" : "KYA ✗"} />
        <ScoreBadge score={trustScore} />
        <CheckBadge ok={active} label={active ? "Active" : "Inactive"} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <CheckBadge ok={kycPassed} label={kycPassed ? "KYA ✓" : "KYA pending"} />
      <ScoreBadge score={trustScore} />
      <RoleBadge role={role} />
      <CheckBadge ok={active} label={active ? "Active" : "Inactive"} />
      <CheckBadge ok={true} label="X Layer" variant="neutral" />
    </div>
  );
}

function CheckBadge({
  ok,
  label,
  variant,
}: {
  ok: boolean;
  label: string;
  variant?: "neutral";
}) {
  if (variant === "neutral") {
    return <span className="tag-gray">{label}</span>;
  }
  return ok
    ? <span className="tag-green">{label}</span>
    : <span className="tag-red">{label}</span>;
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 81) return <span className="tag-green">Score {score} ★</span>;
  if (score >= 61) return <span className="tag-blue">Score {score}</span>;
  if (score >= 41) return <span className="tag-yellow">Score {score}</span>;
  if (score > 0)   return <span className="tag-red">Score {score}</span>;
  return <span className="tag-gray">No score</span>;
}

function RoleBadge({ role }: { role: string }) {
  if (role === "LENDER")   return <span className="tag-blue">Lender</span>;
  if (role === "BORROWER") return <span className="tag-orange">Borrower</span>;
  return <span className="tag-gray">{role}</span>;
}

