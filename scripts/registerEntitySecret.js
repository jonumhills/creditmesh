/**
 * registerEntitySecret.js
 *
 * Registers your CIRCLE_ENTITY_SECRET with Circle's Developer-Controlled Wallets.
 * Run once: node scripts/registerEntitySecret.js
 */

const crypto = require("crypto");
const axios  = require("axios");
require("dotenv").config({ path: ".env" });

const CIRCLE_BASE   = "https://api.circle.com/v1/w3s";
const API_KEY       = process.env.CIRCLE_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

if (!API_KEY)       { console.error("❌ CIRCLE_API_KEY not set in .env"); process.exit(1); }
if (!ENTITY_SECRET) { console.error("❌ CIRCLE_ENTITY_SECRET not set in .env"); process.exit(1); }

async function main() {
  console.log("── Registering Circle Entity Secret ─────────────────────────\n");

  // 1. Fetch Circle's entity public key
  console.log("1. Fetching Circle entity public key...");
  const pkRes = await axios.get(`${CIRCLE_BASE}/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const publicKeyPem = pkRes.data?.data?.publicKey;
  if (!publicKeyPem) throw new Error("Failed to fetch public key: " + JSON.stringify(pkRes.data));
  console.log("   ✓ Public key fetched\n");

  // 2. Encrypt entity secret with Circle's RSA public key (OAEP SHA-256)
  console.log("2. Encrypting entity secret...");
  const entitySecretBuffer = Buffer.from(ENTITY_SECRET, "hex");
  const encryptedBuffer = crypto.publicEncrypt(
    {
      key:    publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    entitySecretBuffer
  );
  const ciphertext = encryptedBuffer.toString("base64");
  console.log("   ✓ Encrypted\n");

  // 3. Register the ciphertext with Circle
  console.log("3. Registering ciphertext with Circle...");
  const regRes = await axios.post(
    `${CIRCLE_BASE}/config/entity/secretCiphertext`,
    {
      idempotencyKey:        require("crypto").randomUUID(),
      encryptedEntitySecret: ciphertext,
    },
    { headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" } }
  );
  console.log("   ✓ Registered!\n");
  console.log("Response:", JSON.stringify(regRes.data, null, 2));
  console.log("\n✅ Entity secret registered. You can now use Developer-Controlled Wallets.");
}

main().catch((err) => {
  console.error("❌ Error:", err.response?.data || err.message);
  process.exit(1);
});
