const MCP_URL = "https://creditmeshmcp-production.up.railway.app";
const BACKEND_URL = "https://creditmeshbackend-production.up.railway.app";

export function MCPSetupPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-8 pb-24 space-y-10">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Connect Your Agent</h2>
        <p className="text-okx-muted text-sm">
          CreditMesh exposes a live MCP server. Any Claude-based agent can connect
          and start lending or borrowing USDC in minutes on Arc.
        </p>
      </div>

      {/* Prerequisites */}
      <Section title="Prerequisites">
        <div className="space-y-3">
          <PrereqCard
            number="1"
            title="A Circle Developer Wallet"
            description="Your agent needs an onchain identity — a wallet address on Arc Testnet (chainId 5042002). Circle Developer-Controlled Wallets work out of the box. Any EVM-compatible wallet also works."
            tag="Required"
            tagColor="text-okx-red border-red-900 bg-red-950/30"
          />
          <PrereqCard
            number="2"
            title="Testnet USDC (optional for browsing)"
            description="Required only if your agent acts as a LENDER depositing liquidity. Borrowers don't need USDC upfront — the loan is disbursed to them via Circle Nanopayments. Get testnet USDC from faucet.circle.com."
            tag="Lenders only"
            tagColor="text-okx-orange border-orange-900 bg-orange-950/30"
          />
          <PrereqCard
            number="3"
            title="MCP client support"
            description="Your agent framework must support MCP (Model Context Protocol). Works with: Claude Desktop, Claude Code, or any SDK implementing MCP client."
            tag="Required"
            tagColor="text-okx-red border-red-900 bg-red-950/30"
          />
        </div>
      </Section>

      {/* MCP Server details */}
      <Section title="MCP Server">
        <div className="rounded-lg border border-okx-border bg-okx-card divide-y divide-okx-border">
          <EndpointRow label="SSE Connection" method="GET" path="/sse" url={`${MCP_URL}/sse`} description="Connect here to open your MCP session" />
          <EndpointRow label="Tool Calls" method="POST" path="/messages" url={`${MCP_URL}/messages`} description="Send JSON-RPC tool calls after connecting" />
          <EndpointRow label="Health" method="GET" path="/health" url={`${MCP_URL}/health`} description="Liveness check" />
        </div>
      </Section>

      {/* Claude Desktop setup */}
      <Section title="Step 1 — Register the MCP Server (Claude Desktop)">
        <div className="space-y-3">
          <p className="text-okx-muted text-sm">Add to your <span className="font-mono text-okx-orange text-xs">claude_desktop_config.json</span>:</p>
          <CodeBlock code={`{
  "mcpServers": {
    "creditmesh": {
      "url": "${MCP_URL}/sse"
    }
  }
}`} />
        </div>
      </Section>

      {/* Claude Code setup */}
      <Section title="Step 1 — Register the MCP Server (Claude Code)">
        <div className="space-y-3">
          <p className="text-okx-muted text-sm">Run this in your terminal:</p>
          <CodeBlock code={`claude mcp add creditmesh --transport sse ${MCP_URL}/sse`} />
          <CodeBlock code={`claude mcp list`} label="Verify it was added" />
        </div>
      </Section>

      {/* Borrower flow */}
      <Section title="Step 2 — Borrow as an Agent (5 commands)">
        <div className="space-y-2">
          <StepRow n={1} tool="creditmesh_register" args={`wallet="0x...", role="BORROWER"`} note="Writes identity to AgentRegistry onchain" />
          <StepRow n={2} tool="creditmesh_run_kya" args={`wallet="0x..."`} note="Computes trust score via KYA Engine. Must be ≥41 to borrow." />
          <StepRow n={3} tool="creditmesh_get_score" args={`wallet="0x..."`} note="Verify your tier: SMALL_ONLY / MEDIUM / FULL_ACCESS" />
          <StepRow n={4} tool="creditmesh_get_lenders" args="" note="Browse active lenders, rates, and min score requirements" />
          <StepRow n={5} tool="creditmesh_request_loan" args={`borrower, amountUsdc, durationHours, purpose`} note="Platform auto-matches best lender. Returns loanId." />
          <StepRow n={6} tool="creditmesh_repay_loan" args={`loanId`} note="Repay before due date → trust score +5. Late → +1." />
        </div>
        <div className="mt-4 px-4 py-3 rounded-lg border border-okx-border bg-okx-card2 text-xs text-okx-muted">
          <span className="text-white font-medium">Score tiers: </span>
          <span className="text-okx-red">0–40 NO_ACCESS</span>
          <span className="text-okx-dim mx-2">·</span>
          <span className="text-yellow-400">41–60 SMALL_ONLY</span>
          <span className="text-okx-dim mx-2">·</span>
          <span className="text-okx-orange">61–80 MEDIUM</span>
          <span className="text-okx-dim mx-2">·</span>
          <span className="text-okx-green">81–100 FULL_ACCESS</span>
        </div>
      </Section>

      {/* Lender flow */}
      <Section title="Step 2 — Lend as an Agent (earn yield)">
        <div className="space-y-2">
          <StepRow n={1} tool="creditmesh_register" args={`wallet="0x...", role="LENDER"`} note="Register as a lender" />
          <StepRow n={2} tool="creditmesh_run_kya" args={`wallet="0x..."`} note="Must score ≥61 to lend" />
          <StepRow n={3} tool="creditmesh_status" args="" note="Confirm platform is live and contracts are reachable" />
        </div>
        <p className="text-okx-dim text-xs mt-3">After registering, deposit USDC to LoanEscrow and set your terms via the contract. Borrowers are matched to you automatically via Circle Nanopayments.</p>
      </Section>

      {/* Available tools */}
      <Section title="All Available Tools">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-okx-border text-okx-dim">
                <th className="text-left px-3 py-2 font-medium">Tool</th>
                <th className="text-left px-3 py-2 font-medium">What it does</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name} className="border-b border-okx-border hover:bg-okx-card transition-colors">
                  <td className="px-3 py-2.5 font-mono text-okx-orange whitespace-nowrap">{t.name}</td>
                  <td className="px-3 py-2.5 text-okx-muted">{t.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* REST fallback */}
      <Section title="No MCP? Use REST API directly">
        <div className="space-y-2">
          <p className="text-okx-muted text-sm mb-3">Any HTTP client can call the backend directly:</p>
          <CodeBlock code={`POST ${BACKEND_URL}/api/kya/register
{ "wallet": "0x...", "role": "BORROWER" }`} />
          <CodeBlock code={`POST ${BACKEND_URL}/api/kya/score
{ "wallet": "0x..." }`} />
          <CodeBlock code={`GET  ${BACKEND_URL}/api/loans/lenders/active`} />
          <CodeBlock code={`POST ${BACKEND_URL}/api/loans/request
{ "borrower": "0x...", "amountUsdc": "0.005", "durationHours": 2, "purpose": "..." }`} />
          <CodeBlock code={`POST ${BACKEND_URL}/api/loans/:loanId/repay`} />
        </div>
      </Section>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-okx-muted uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PrereqCard({ number, title, description, tag, tagColor }: {
  number: string; title: string; description: string; tag: string; tagColor: string;
}) {
  return (
    <div className="flex gap-4 px-4 py-3 rounded-lg bg-okx-card border border-okx-border">
      <div className="w-6 h-6 rounded-full bg-okx-card2 border border-okx-border2 flex items-center justify-center text-xs font-bold text-okx-orange shrink-0 mt-0.5">{number}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-white text-sm font-medium">{title}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${tagColor}`}>{tag}</span>
        </div>
        <p className="text-okx-muted text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function EndpointRow({ label, method, path, url, description }: {
  label: string; method: string; path: string; url: string; description: string;
}) {
  const methodColor = method === "GET" ? "text-okx-green" : "text-okx-orange";
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-bold font-mono ${methodColor}`}>{method}</span>
          <span className="text-white text-sm font-medium">{label}</span>
        </div>
        <div className="text-okx-dim text-xs">{description}</div>
      </div>
      <a href={url} target="_blank" rel="noreferrer"
        className="font-mono text-xs text-okx-orange hover:underline ml-4 shrink-0">{path} ↗</a>
    </div>
  );
}

function StepRow({ n, tool, args, note }: { n: number; tool: string; args: string; note: string }) {
  return (
    <div className="flex gap-3 px-4 py-3 rounded-lg bg-okx-card border border-okx-border">
      <div className="w-5 h-5 rounded-full bg-orange-950 border border-orange-900 flex items-center justify-center text-[10px] font-bold text-orange-400 shrink-0 mt-0.5">{n}</div>
      <div>
        <div className="font-mono text-xs text-okx-orange">{tool}
          {args && <span className="text-okx-dim">({args})</span>}
        </div>
        <div className="text-okx-dim text-[11px] mt-0.5">{note}</div>
      </div>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div>
      {label && <div className="text-okx-dim text-[10px] mb-1">{label}</div>}
      <pre className="px-4 py-3 rounded-lg bg-okx-card border border-okx-border text-xs text-okx-orange font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

const TOOLS = [
  { name: "creditmesh_status",          desc: "Platform health + deployed contract addresses on Arc" },
  { name: "creditmesh_register",        desc: "Register wallet as LENDER or BORROWER onchain" },
  { name: "creditmesh_run_kya",         desc: "Compute + write trust score via KYA Engine" },
  { name: "creditmesh_get_score",       desc: "Read current score and tier for a wallet" },
  { name: "creditmesh_get_agents",      desc: "List all registered agents" },
  { name: "creditmesh_leaderboard",     desc: "Top agents ranked by trust score" },
  { name: "creditmesh_get_agent_profile", desc: "Full profile: score breakdown + loan history" },
  { name: "creditmesh_get_lenders",     desc: "Browse active lenders, rates, and requirements" },
  { name: "creditmesh_request_loan",    desc: "Request a USDC loan — platform auto-matches best lender" },
  { name: "creditmesh_get_loan",        desc: "Fetch loan details by ID" },
  { name: "creditmesh_repay_loan",      desc: "Confirm repayment — updates trust score onchain" },
];
