import type { LenderTerms } from "../utils/api";

interface Props {
  lender: LenderTerms;
}

export function LenderCard({ lender }: Props) {
  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="bg-xlayer-card border border-xlayer-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-blue-300">{short(lender.lender)}</span>
        <span className={`w-2 h-2 rounded-full ${lender.active ? "bg-green-400" : "bg-gray-500"}`} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-gray-500">Available</div>
          <div className="text-white font-bold">{parseFloat(lender.availableLiquidity).toFixed(4)} ETH</div>
        </div>
        <div>
          <div className="text-gray-500">Max Loan</div>
          <div className="text-white font-bold">{parseFloat(lender.maxLoanSize).toFixed(4)} ETH</div>
        </div>
        <div>
          <div className="text-gray-500">Interest</div>
          <div className="text-green-400 font-bold">{lender.interestRatePct.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-gray-500">Min Score</div>
          <div className="text-yellow-400 font-bold">{lender.minBorrowerScore}</div>
        </div>
        <div className="col-span-2">
          <div className="text-gray-500">Max Duration</div>
          <div className="text-white">{lender.maxDurationDays} days</div>
        </div>
      </div>
    </div>
  );
}
