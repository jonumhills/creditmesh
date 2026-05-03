# CreditMesh — P2P credit market for AI agents · [creditmesh.vercel.app](https://creditmesh.vercel.app)

CreditMesh is a peer-to-peer USDC lending protocol where AI agents borrow and lend directly from each other on Ethereum Sepolia. There are no banks, no humans in the loop, and no overcollateralisation. Every agent earns a trust score (0–100) through a Know Your Agent (KYA) engine that reads on-chain history. A high score unlocks better rates and larger loans. Defaulters are penalised automatically. Trust is built by repaying, not by identity.

Any AI agent — Claude, OpenAI, or any MCP-compatible framework — can connect to the live MCP server and participate in under a minute.

---

## Live

| | URL |
|---|---|
| Dashboard | https://creditmesh.vercel.app |
| Backend API | https://creditmeshbackend-production-95b3.up.railway.app |
| MCP Server | https://creditmeshmcp-production-5090.up.railway.app |

## Deployed Contracts (Ethereum Sepolia · chainId 11155111)

| Contract | Address |
|---|---|
| AgentRegistry | [`0x51ee32f41301CB4157074Aab77a5e861E91282CE`](https://sepolia.etherscan.io/address/0x51ee32f41301CB4157074Aab77a5e861E91282CE) |
| TrustScore | [`0xA5428a9CC80F1469CFb0BbA07dfD3845C23650Eb`](https://sepolia.etherscan.io/address/0xA5428a9CC80F1469CFb0BbA07dfD3845C23650Eb) |
| LoanEscrow | [`0xBD66C23a2bCaBc0BB24caD78062F3Cf71275Cda8`](https://sepolia.etherscan.io/address/0xBD66C23a2bCaBc0BB24caD78062F3Cf71275Cda8) |
| USDC | [`0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8`](https://sepolia.etherscan.io/address/0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AI Agent (Claude / MCP)                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ MCP tools
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CreditMesh Backend API                         │
│                                                                       │
│  Register → KYA engine → TrustScore contract → Matchmaking           │
│                │                                      │               │
│                ▼                                      ▼               │
│         ENS text records                     LoanEscrow.createLoan() │
└──────────────────────────────────────────────────────────────────────┘
          │                    │                        │
          ▼                    ▼                        ▼
   ┌────────────┐    ┌──────────────────┐    ┌──────────────────────┐
   │  ENS       │    │   Uniswap v3     │    │     KeeperHub        │
   │            │    │                  │    │                      │
   │ Agent gets │    │ Borrower deploys │    │ Cron every 5 min     │
   │ a subname  │    │ borrowed USDC:   │    │ → POST /keeper/      │
   │ under      │    │ USDC → WETH      │    │   trigger            │
   │ creditmesh │    │ → hold → WETH    │    │ → markDefault() for  │
   │ .eth with  │    │ → USDC → repay   │    │   overdue loans      │
   │ trust score│    │ via SwapRouter02 │    │   onchain            │
   │ as text    │    │                  │    │                      │
   │ record     │    │                  │    │                      │
   └────────────┘    └──────────────────┘    └──────────────────────┘
```

---

## Uniswap

**What it does:** Borrower agents deploy their borrowed USDC on Uniswap v3. After receiving a loan, the agent calls `SwapRouter02.exactInputSingle()` to swap USDC → WETH, holds the position, then swaps WETH → USDC before the loan deadline to close out. Principal + interest is repaid from the recovered USDC. Profit or loss depends on price movement — a real autonomous DeFi strategy, not a demo loop.

**Why it matters:** Without a productive use of capital, borrowing is circular. Uniswap gives borrowed USDC a genuine job. Agents are real participants in Uniswap liquidity — not because a human told them to, but because it's the optimal strategy for deploying short-term credit.

**Where it lives:**
- `agents/src/utils/uniswap.ts` — `swapUsdcToWeth()` and `swapWethToUsdc()` via SwapRouter02 (`0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`) on Sepolia
- `agents/src/orchestrator.ts` — orchestrates the full borrow → swap → repay cycle autonomously
- Uniswap Trading API used for pre-swap quotes; direct contract calls for execution

---

## KeeperHub

**What it does:** Every loan in CreditMesh has a deadline. When that deadline passes without repayment, `LoanEscrow.markDefault(loanId)` must be called on-chain to penalise the borrower's trust score (−20 pts) and mark the loan defaulted. KeeperHub runs a scheduled workflow every 5 minutes that calls the CreditMesh backend webhook, which scans all active loans and triggers `markDefault()` for any that are overdue.

**Why it matters:** Without KeeperHub, enforcing deadlines requires an always-on polling server — a centralised, fragile single point of failure. KeeperHub turns deadline enforcement into a reliable, external, auditable automation layer. Agents can also self-schedule their own repayment reminders via the KeeperHub MCP server, letting them manage their full loan lifecycle autonomously.

**Where it lives:**
- `backend/src/routes/keeper.ts` — webhook endpoint that KeeperHub calls every 5 minutes
- `backend/src/scripts/registerKeeperJob.ts` — registers the cron workflow via KeeperHub API
- Workflow ID: `b2j79r2fxeoqy59zhoekx` · Webhook: `POST /api/keeper/trigger`
- See `KEEPERHUB_FEEDBACK.md` for developer experience notes

---

## ENS

**What it does:** Every agent that passes KYA automatically gets a subname under `creditmesh.eth` (e.g. `fe7de720.creditmesh.eth`). The backend writes the agent's trust score, role, tier, and KYA status directly to that ENS subname as text records via the Public Resolver on Sepolia. Any wallet, protocol, or agent anywhere in the ecosystem can resolve `*.creditmesh.eth` and read an agent's creditworthiness without calling the CreditMesh API at all.

**Why it matters:** Raw wallet addresses are opaque. ENS gives each agent a portable on-chain identity and credit profile that survives outside of CreditMesh. A future lending protocol can read `cm.trust_score` from ENS and make credit decisions based on CreditMesh history — no integration required.

**Where it lives:**
- `backend/src/services/ensService.ts` — subname creation, text record reads and writes via ENS NameWrapper + Public Resolver on Sepolia
- Text records written automatically after every KYA run: `cm.trust_score`, `cm.role`, `cm.tier`, `cm.kya_status`, `url`
- `GET /api/agents/:wallet/ens` — returns the full ENS identity for any registered agent

---

## Connect Your Agent (MCP)

Any Claude-based agent connects to CreditMesh in one line:

```bash
claude mcp add creditmesh --transport sse https://creditmeshmcp-production-5090.up.railway.app/sse
```

Or in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "creditmesh": {
      "url": "https://creditmeshmcp-production-5090.up.railway.app/sse"
    }
  }
}
```

Borrower flow (5 steps):

```
creditmesh_register(wallet, role="BORROWER")
creditmesh_run_kya(wallet)
creditmesh_get_lenders()
creditmesh_request_loan(borrower, amountUsdc, durationHours, purpose)
creditmesh_repay_loan(loanId)
```

---

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in: DEPLOYER_PRIVATE_KEY, ANTHROPIC_API_KEY

# Contracts already deployed — to redeploy:
cd contracts && npx hardhat run scripts/deploy.ts --network sepolia

npm run backend:dev     # http://localhost:3001
npm run frontend:dev    # http://localhost:3000
npm run mcp:dev         # http://localhost:3002

# Agent pipeline
cd agents
npm run agents:create
npm run agents:fund
npm run agents:bootstrap
npm run agents:start

# Register KeeperHub automation
npm run keeper:register

# ENS setup
npm run ens:setup
npm run ens:mint-all
```

---

## Trust Score

| Factor | Weight |
|---|---|
| Onchain TX count & frequency | 30% |
| Past loan repayment history | 25% |
| Wallet USDC balance | 20% |
| Protocol interaction history | 15% |
| Wallet age | 10% |

| Score | Tier | Access |
|---|---|---|
| 0–40 | NO_ACCESS | Cannot participate |
| 41–60 | SMALL_ONLY | Small loans only |
| 61–80 | MEDIUM | Medium loans + eligible to lend |
| 81–100 | FULL_ACCESS | Best rates + largest loans |

| Event | Change |
|---|---|
| On-time repayment | +5 pts |
| Late repayment | +1 pt |
| Default | −20 pts |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Blockchain | Ethereum Sepolia (chainId 11155111) |
| Contracts | Solidity 0.8.24 + Hardhat + OpenZeppelin |
| Agent Brain | Claude API (`claude-haiku-4-5-20251001`) + tool use |
| Backend | Node.js + TypeScript + Express |
| Frontend | React + Vite + Tailwind CSS |
| MCP Server | `@modelcontextprotocol/sdk` HTTP/SSE |
| Yield Layer | Uniswap v3 SwapRouter02 on Sepolia |
| Automation | KeeperHub scheduled webhook (every 5 min) |
| Agent Identity | ENS subnames + text records on Sepolia |

---

## Repo Structure

```
creditmesh/
├── contracts/          # Solidity (AgentRegistry, TrustScore, LoanEscrow)
├── backend/            # Express API + KYA engine + matchmaking
│   └── src/
│       ├── routes/keeper.ts          # KeeperHub webhook endpoint
│       ├── services/ensService.ts    # ENS subname + text record management
│       └── scripts/
│           ├── registerKeeperJob.ts  # Register KeeperHub cron workflow
│           ├── setupEnsName.ts       # Register creditmesh.eth on Sepolia
│           └── mintAgentSubnames.ts  # Backfill ENS subnames for agents
├── agents/             # Autonomous AI agents (Claude + ethers.js)
│   └── src/
│       ├── orchestrator.ts           # 10-min cycle: lend/borrow/swap/repay
│       └── utils/uniswap.ts          # Uniswap v3 swap helpers
├── mcp/                # MCP server (HTTP/SSE) — remote agent access
├── frontend/           # React dashboard (Vercel)
├── KEEPERHUB_FEEDBACK.md
└── FEEDBACK.md         # Uniswap API developer experience notes
```

---

Built for ETHGlobal Open Agents 2026
