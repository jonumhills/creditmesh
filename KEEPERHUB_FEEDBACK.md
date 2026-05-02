# KeeperHub Developer Feedback — CreditMesh Integration

**Project:** CreditMesh — P2P Agent Credit Market on Ethereum Sepolia  
**Team:** ETHGlobal Open Agents 2026  
**Integration:** Automated loan default monitoring via KeeperHub scheduled webhooks

---

## What We Built

CreditMesh uses KeeperHub to automate the most time-critical part of a lending protocol: marking loans as defaulted the moment their deadline passes. Without automation, this would require a centralized cron job or manual intervention. KeeperHub replaced our `setInterval` polling with a reliable external trigger.

**The flow:**
1. KeeperHub fires `POST /api/keeper/trigger` every 5 minutes (cron: `*/5 * * * *`)
2. Our backend scans all `ACTIVE` loans and calls `LoanEscrow.markDefault(loanId)` on-chain for any past their `dueTime`
3. The borrower's trust score is penalised −20 points on-chain automatically

---

## What Worked Well

**1. Simple workflow model** — The node/edge JSON structure (`trigger → action`) is intuitive. Creating our first workflow took under 10 minutes once we had the API key. The mental model maps cleanly to what we wanted: "when X happens, do Y."

**2. HTTP webhook action is exactly right for our use case** — We didn't need KeeperHub to make on-chain calls directly (our contract is `onlyOwner`). Calling our backend which then calls the contract is the right separation of concerns. The ability to add custom headers (we used `Authorization: Bearer <secret>`) meant we could secure the endpoint properly.

**3. The MCP server is a genuinely novel idea** — The fact that KeeperHub exposes an MCP server means an AI agent can create and manage automation workflows as part of its execution. In CreditMesh, a borrower agent could register its own repayment reminder via `create_workflow` — that's emergent, autonomous behaviour we didn't expect to be possible. This is the most compelling part of the integration for an "Open Agents" hackathon.

---

## Pain Points and Suggestions

**1. No SDK, only REST**  
We had to write our own `registerKeeperJob.ts` script around raw axios calls. An npm package (`@keeperhub/sdk`) with typed `createWorkflow()` / `deleteWorkflow()` / `listWorkflows()` would eliminate copy-paste errors and version drift. Even a Zod schema export for the workflow shape would help — it's easy to get the `nodes[].data.config` nesting wrong silently.

**Suggested API:**
```typescript
import { KeeperHub } from "@keeperhub/sdk";
const kh = new KeeperHub(process.env.KEEPERHUB_API_KEY);
await kh.workflows.create({
  name: "creditmesh-default-monitor",
  trigger: { type: "schedule", cron: "*/5 * * * *" },
  action:  { type: "webhook", url, method: "POST", headers },
});
```

**2. No way to verify a workflow is running from the outside**  
Once we registered the workflow, we had no way to confirm it was actually firing in production without waiting 5 minutes and watching logs. A `GET /api/workflows/:id/runs` endpoint that returns recent execution history (timestamp, HTTP status, response body excerpt) would make debugging much faster. We worked around this with our `GET /api/keeper/status` endpoint that stores last-run metadata locally — but that's fragile.

**3. Webhook delivery failures need clearer retry semantics**  
The docs don't specify: if our backend returns a 500, does KeeperHub retry? How many times? With what backoff? For a lending protocol, missing a default check matters. We'd want at least 3 retries with exponential backoff, and ideally a way to see failed deliveries in the dashboard.

**4. No test/dry-run mode**  
We couldn't test "does this workflow actually fire correctly" without waiting for the cron window. A `POST /api/workflows/:id/test` endpoint that immediately fires the action once would have saved us significant time during development.

**5. cron expression is a footgun for beginners**  
`*/5 * * * *` is correct for "every 5 minutes" but non-obvious. Many developers will write `5 * * * *` (every hour at :05) by mistake. A higher-level abstraction like `{ type: "interval", minutes: 5 }` would be more ergonomic for simple cases, with cron as an advanced option.

---

## The AI Agent + KeeperHub Angle (Open Agents Specific)

The most exciting thing we discovered: **an AI agent can be its own keeper**. Because KeeperHub exposes an MCP server, a Claude-based borrower agent could:
1. Request a loan from CreditMesh
2. Immediately register a KeeperHub reminder: "call me back in 2 hours to repay"
3. Get woken up by KeeperHub, check loan status, repay automatically

This creates a fully autonomous repayment loop with no human intervention and no always-on process. The agent only runs when it has something to do. For Open Agents, this is a genuinely compelling primitive.

**Feature request:** A `returnUrl` field on the webhook action that supports a "callback" pattern — the keeper fires, the agent processes, and can optionally reschedule itself with a new delay. This would enable event-driven agent loops rather than fixed-interval polling.

---

## Summary

KeeperHub solved a real problem for us (reliable default detection in a lending protocol) and the MCP server unlocks an interaction pattern we hadn't anticipated. The main gaps are: SDK/typed client, execution history API, and retry visibility. These are table-stakes for production use but entirely fixable — the core model is right.

**Integration code:** [github.com/jonumhills/creditmesh/blob/main/backend/src/routes/keeper.ts](https://github.com/jonumhills/creditmesh/blob/main/backend/src/routes/keeper.ts)
