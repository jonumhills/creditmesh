# Uniswap Developer Platform — Builder Feedback

**Project:** CreditMesh — Agent-to-Agent USDC Lending with Uniswap yield generation
**Hackathon:** ETHGlobal AI Agents 2026
**Integration:** Uniswap v3 Trading API + SwapRouter on Ethereum Sepolia

---

## What We Built

CreditMesh is an autonomous agent lending platform. Borrower agents:
1. Request a USDC loan from lender agents (matched via trust score)
2. Swap borrowed USDC → WETH via Uniswap v3 to generate yield
3. Swap WETH → USDC to close position
4. Repay the loan with profit

Uniswap is the yield layer — agents don't just hold borrowed capital, they deploy it into Uniswap liquidity and earn swap fees autonomously.

---

## What Worked Well

- **Uniswap v3 SwapRouter ABI** is clean and easy to call with ethers.js. The `exactInputSingle` function is intuitive — token addresses, fee tier, recipient, amounts. No surprises.
- **Sepolia deployment** is well-documented. Addresses for USDC, WETH, and SwapRouter02 were findable with some digging.
- **OpenAI-compatible quote structure** from the Trading API was easy to parse once we understood the response shape.

---

## What Was Difficult

- **Uniswap Trading API authentication** — the `x-api-key` requirement isn't clearly documented for testnet. It wasn't obvious whether Sepolia quotes require an API key or if the endpoint is open for testing. We hit 401s before discovering the endpoint sometimes works without a key on testnet.
- **USDC address ambiguity on Sepolia** — there are at least two different USDC addresses on Sepolia: Circle's official (`0x1c7D4B196...`) and Uniswap's test token (`0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8`). Only the latter has Uniswap v3 liquidity. This cost us ~2 hours debugging failed swaps.
- **Permit2 flow not well-explained** — the Trading API quote response includes a `permit2` field but the docs don't clearly explain when you need it vs when a standard `approve()` is sufficient. For small test amounts we fell back to direct approve.
- **No TypeScript types exported from the Trading API** — had to manually type the response shape. A `@uniswap/trading-api-types` package would be very helpful.

---

## Documentation Gaps

- The [Integration Guide](https://docs.uniswap.org/api/trading/integration-guide) doesn't include a working end-to-end Sepolia example with real addresses.
- SwapRouter02 vs SwapRouter (v1) distinction could be clearer — several older guides use the wrong address.
- Fee tier selection (500/3000/10000) has no beginner guidance on which pools have liquidity on testnet.

---

## Feature Requests

1. **Testnet-specific docs page** — a single page with all Sepolia addresses (USDC, WETH, SwapRouter02, Permit2) and a working curl example for a quote.
2. **TypeScript SDK for Trading API** — `@uniswap/trading-api` package with typed request/response would reduce integration time significantly.
3. **Agent-optimised endpoints** — a `POST /v1/swap` endpoint that handles quote + calldata + submission in one call would be ideal for autonomous agents that can't do multi-step UI flows.
4. **Pool liquidity check endpoint** — before building a swap, agents need to know if a pool has sufficient liquidity. A simple `GET /v1/pool/liquidity?tokenIn=...&tokenOut=...&fee=3000` would help.

---

## Overall DX Rating

**7/10** — The contracts are excellent, the ABI is clean, and v3 works as documented. The main friction is in the API layer (auth confusion, address ambiguity, missing TypeScript types). Fixing the Sepolia docs page alone would save builders hours.
