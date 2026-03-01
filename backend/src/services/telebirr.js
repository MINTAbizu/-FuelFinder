const crypto = require("crypto");

function getTelebirrConfig() {
  return {
    baseUrl: String(process.env.TELEBIRR_BASE_URL || "").trim(),
    appId: String(process.env.TELEBIRR_APP_ID || "").trim(),
    merchantId: String(process.env.TELEBIRR_MERCHANT_ID || "").trim(),
    apiKey: String(process.env.TELEBIRR_API_KEY || "").trim(),
    callbackUrl: String(process.env.TELEBIRR_CALLBACK_URL || "").trim(),
    returnUrl: String(process.env.TELEBIRR_RETURN_URL || "").trim(),
    webhookSecret: String(process.env.TELEBIRR_WEBHOOK_SECRET || "").trim()
  };
}

function ensureConfigured(config) {
  if (!config.baseUrl || !config.appId || !config.merchantId || !config.apiKey || !config.callbackUrl) {
    throw new Error("Telebirr is not configured. Set TELEBIRR_* environment variables.");
  }
}

async function createTelebirrCheckout(payload) {
  const config = getTelebirrConfig();
  ensureConfigured(config);

  const merchantOrderId = `ff-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const body = {
    appId: config.appId,
    merchantId: config.merchantId,
    merchantOrderId,
    amount: payload.amount,
    currency: payload.currency || "ETB",
    title: payload.title || "FuelFinder Queue Deposit",
    description: payload.description || "Queue reservation deposit",
    callbackUrl: config.callbackUrl,
    returnUrl: config.returnUrl || undefined,
    metadata: payload.metadata || {}
  };

  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telebirr checkout failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return {
    checkoutUrl: data.checkoutUrl || data.payUrl || "",
    paymentSessionId: String(data.paymentSessionId || data.sessionId || ""),
    merchantOrderId
  };
}

function verifyTelebirrWebhookSignature(rawBody, signatureHeader) {
  const config = getTelebirrConfig();
  if (!config.webhookSecret) return true;

  const signature = String(signatureHeader || "").trim();
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(rawBody || "", "utf8")
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = {
  createTelebirrCheckout,
  verifyTelebirrWebhookSignature
};
