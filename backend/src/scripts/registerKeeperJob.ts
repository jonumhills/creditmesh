/**
 * registerKeeperJob.ts
 *
 * Registers a CreditMesh workflow on KeeperHub that calls
 * POST /api/keeper/trigger every 5 minutes to mark defaulted loans.
 *
 * Run: npm run keeper:register
 */

import axios from "axios";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const KEEPERHUB_BASE = "https://app.keeperhub.com/api";
const API_KEY        = process.env.KEEPERHUB_API_KEY;
const BACKEND_URL    = process.env.BACKEND_URL || "https://creditmeshbackend-production.up.railway.app";
const WEBHOOK_SECRET = process.env.KEEPERHUB_WEBHOOK_SECRET || "";

async function main() {
  if (!API_KEY) {
    console.error("KEEPERHUB_API_KEY not set in .env");
    process.exit(1);
  }

  const webhookUrl = `${BACKEND_URL}/api/keeper/trigger`;

  console.log("Registering KeeperHub workflow...");
  console.log(`  Webhook: ${webhookUrl}`);
  console.log(`  Schedule: every 5 minutes`);

  const workflow = {
    name: "creditmesh-default-monitor",
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        data: {
          config: {
            triggerType: "Schedule",
            cronExpression: "*/5 * * * *",
          },
        },
      },
      {
        id: "action-1",
        type: "action",
        data: {
          config: {
            actionType: "webhook",
            url: webhookUrl,
            method: "POST",
            headers: WEBHOOK_SECRET
              ? { Authorization: `Bearer ${WEBHOOK_SECRET}` }
              : {},
            body: { source: "keeperhub" },
          },
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger-1", target: "action-1" },
    ],
  };

  try {
    const res = await axios.post(
      `${KEEPERHUB_BASE}/workflows/create`,
      workflow,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("\nWorkflow registered successfully!");
    console.log("  ID:", res.data?.id || res.data?.workflowId);
    console.log("  Status:", res.data?.status || "active");
    console.log("\nKeeperHub will now call your backend every 5 minutes.");
    console.log("Check status: GET /api/keeper/status");
  } catch (err: any) {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message;
    console.error("Registration failed:", msg);
    if (err.response?.data) {
      console.error("Response:", JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
