# Circle x Arc Hackathon — BancoProtocol Adaptation

## Event Details

- **Name:** Agentic Economy on Arc
- **Dates:** April 20–25, 2026 (online submissions) | April 25–26 on-site SF
- **Prize Pool:** $10,000 USDC
- **Track:** Agent-to-Agent Payment Loop
- **Venue (on-site):** MindsDB SF AI Collective, 3154 17th St, San Francisco
- **Submission Deadline:** April 25, 8:00 PM ET

---

## What the Hackathon Wants

Build agent-to-agent economic apps using:

- **Arc** — Circle's EVM-compatible L1 (settlement layer)
- **USDC** — native gas token + stablecoin on Arc
- **Circle Nanopayments** — sub-cent, gas-free, high-frequency transactions
- **Circle Wallets** — programmable wallets for agents

### Hard Requirements (every submission must have)
- Per-action pricing ≤ $0.01
- 50+ onchain transactions demonstrated
- Margin explanation: why this model breaks with traditional gas fees

### Bonus
- $500 USDC for most helpful Circle product feedback in the submission form

---

## Why BancoProtocol Fits

BancoProtocol is already an agent-to-agent lending platform. The core architecture maps directly:

| Layer | OKX Version | Arc Version |
|---|---|---|
| Chain | X Layer Testnet | Arc (EVM, drop-in) |
| Currency | OKB (native ETH) | USDC (ERC-20) |
| Payments | x402 | Circle Nanopayments |
| Agent Wallets | OKX Agentic Wallet | Circle Wallets |
| KYA Engine | OKX Onchain OS | Keep as-is (or swap data source) |
| Smart Contracts | AgentRegistry, TrustScore, LoanEscrow | Redeploy same Solidity on Arc |
| MCP Server | HTTP/SSE on Railway | Keep as-is |
| Frontend | React + Vite on Vercel | Keep as-is |

---

## Required Changes

### 1. Hardhat config — target Arc testnet
- Add Arc testnet to `hardhat.config.ts` (new network entry)
- Update `.env`: new RPC URL, chain ID, deployer key

### 2. LoanEscrow.sol — swap native ETH → USDC ERC-20
- Remove `payable` from `deposit()`
- Add USDC token address constructor param
- Replace `transfer`/`value` with `IERC20.transferFrom` / `IERC20.transfer`
- ~50 lines of Solidity changes

### 3. Circle Nanopayments integration
- Replace x402 disbursement with Circle Nanopayments API
- Each loan disbursement = one Nanopayment (≤ $0.01 per tx)
- Each repayment = one Nanopayment back to lender
- Wire into `loanManager.ts`

### 4. Circle Wallets for agents
- Replace OKX Agentic Wallet creation in `agents/src/shared/agenticWallet.ts`
- Use Circle Wallets API to create/manage agent wallets
- Agents hold USDC balance instead of OKB

### 5. Generate 50+ transactions
- Run the orchestrator with multiple agents for a few cycles
- Each full loan lifecycle = ~6 txs (register, KYA, deposit, createLoan, repay, scoreUpdate)
- 9 agents × 2 cycles = 108 txs easily

---

## The Margin Argument (required in submission)

> A single loan cycle (register → KYA → borrow → repay) involves ~6 onchain transactions.
> At $0.001 per tx via Circle Nanopayments on Arc = **$0.006 total per loan**.
> On Ethereum mainnet at avg $2 gas = **$12 per loan** — making $0.005 micro-loans
> economically impossible. BancoProtocol only works as a business on Arc + Nanopayments.

---

## Submission Checklist

- [ ] Contracts redeployed on Arc testnet
- [ ] USDC swap in LoanEscrow working
- [ ] Circle Nanopayments wired for disburse + repay
- [ ] Circle Wallets used for at least 2 agents
- [ ] 50+ onchain transactions generated
- [ ] Demo video showing Circle Developer Console + Arc Explorer tx
- [ ] GitHub repo public + README updated
- [ ] Circle product feedback field filled (detailed = eligible for $500 bonus)
- [ ] Cover image + slide deck

---

## Circle Product Feedback Notes (draft)

**Products used:** Arc, USDC, Circle Nanopayments, Circle Wallets

**Why chosen:** BancoProtocol is agent-to-agent undercollateralized lending. Loan amounts are $0.001–$0.01 — economically impossible on any chain with gas overhead. Nanopayments is the only infrastructure that makes the unit economics work.

**What worked well:** EVM compatibility on Arc = zero contract rewrites. USDC as the unit of account simplifies the trust score math (dollar-denominated loans are intuitive for agents).

**What could be improved:** Nanopayments SDK documentation for TypeScript could be more complete. Circle Wallets API key scoping was initially confusing.

**Recommendations:** A TypeScript SDK for Nanopayments (not just REST) would significantly reduce integration time for agent-based apps.

---

## Key Links

- Arc Docs: https://docs.arc.xyz
- Nanopayments Docs: https://developers.circle.com/nanopayments
- Circle Dev Account: https://console.circle.com
- Arc Testnet Faucet: (check Arc Discord)
- Arc Block Explorer: (check Arc docs)
- Hackathon Page: lablab.ai
