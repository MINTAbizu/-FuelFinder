const crypto = require("crypto");

let cachedFabricToken = "";
let cachedFabricTokenExpiresAt = 0;

function getTelebirrConfig() {
  return {
    baseUrl: String(process.env.TELEBIRR_BASE_URL || "").trim(),
    fabricTokenPath: String(process.env.TELEBIRR_FABRIC_TOKEN_PATH || "/payment/v1/token").trim(),
    authTokenPath: String(process.env.TELEBIRR_AUTH_TOKEN_PATH || "/payment/v1/auth/authToken").trim(),
    preOrderPath: String(process.env.TELEBIRR_PRE_ORDER_PATH || "/payment/v1/merchant/preOrder").trim(),
    fabricAppId: String(
      process.env.TELEBIRR_FABRIC_APP_ID || process.env.TELEBIRR_X_APP_KEY || ""
    ).trim(),
    appSecret: String(process.env.TELEBIRR_APP_SECRET || "").trim(),
    merchantAppId: String(process.env.TELEBIRR_MERCHANT_APP_ID || "").trim(),
    merchantCode: String(process.env.TELEBIRR_MERCHANT_CODE || "").trim(),
    privateKey: String(process.env.TELEBIRR_PRIVATE_KEY || "").trim(),
    callbackUrl: String(process.env.TELEBIRR_CALLBACK_URL || "").trim(),
    returnUrl: String(process.env.TELEBIRR_RETURN_URL || "").trim(),
    receiveName: String(process.env.TELEBIRR_RECEIVE_NAME || "").trim(),
    subject: String(process.env.TELEBIRR_SUBJECT || "FuelFinder Queue Deposit").trim(),
    webhookSecret: String(process.env.TELEBIRR_WEBHOOK_SECRET || "").trim()
  };
}

function ensureConfigured(config) {
  if (
    !config.baseUrl ||
    !config.fabricAppId ||
    !config.appSecret ||
    !config.merchantAppId ||
    !config.merchantCode ||
    !config.privateKey ||
    !config.callbackUrl
  ) {
    throw new Error("Telebirr is not configured. Set TELEBIRR_* environment variables.");
  }
}

function createTimeStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds())
  ].join("");
}

function createNonceStr() {
  return crypto.randomBytes(16).toString("hex");
}

function normalizePrivateKey(privateKey) {
  // Supports both single-line \n escaped and full PEM values.
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

function canonicalizeForSign(obj) {
  return Object.keys(obj)
    .filter((key) => obj[key] !== undefined && obj[key] !== null && key !== "sign")
    .sort()
    .map((key) => {
      const value = typeof obj[key] === "object" ? JSON.stringify(obj[key]) : String(obj[key]);
      return `${key}=${value}`;
    })
    .join("&");
}

function signRequestObject(config, obj) {
  const payload = canonicalizeForSign(obj);
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(payload, "utf8");
  signer.end();
  return signer.sign(normalizePrivateKey(config.privateKey), "base64");
}

function buildSignedRequest(config, method, bizContent) {
  const req = {
    timestamp: createTimeStamp(),
    nonce_str: createNonceStr(),
    method,
    version: "1.0",
    biz_content: bizContent
  };
  req.sign = signRequestObject(config, req);
  req.sign_type = "SHA256WithRSA";
  return req;
}

function parseFabricDate(dateText) {
  const raw = String(dateText || "").trim();
  if (!/^\d{14}$/.test(raw)) return 0;
  const yyyy = Number(raw.slice(0, 4));
  const mm = Number(raw.slice(4, 6));
  const dd = Number(raw.slice(6, 8));
  const HH = Number(raw.slice(8, 10));
  const MM = Number(raw.slice(10, 12));
  const SS = Number(raw.slice(12, 14));
  return Date.UTC(yyyy, mm - 1, dd, HH, MM, SS);
}

async function applyFabricToken(forceRefresh = false) {
  const config = getTelebirrConfig();
  ensureConfigured(config);

  const now = Date.now();
  const refreshSkewMs = 30 * 1000;
  if (!forceRefresh && cachedFabricToken && cachedFabricTokenExpiresAt - refreshSkewMs > now) {
    return cachedFabricToken;
  }

  const response = await fetch(
    `${config.baseUrl.replace(/\/+$/, "")}/${config.fabricTokenPath.replace(/^\/+/, "")}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APP-Key": config.fabricAppId
      },
      body: JSON.stringify({
        appSecret: config.appSecret
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telebirr fabric token request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const token = String(data.token || "").trim();
  if (!token) {
    throw new Error("Telebirr fabric token response missing token.");
  }

  cachedFabricToken = token;
  const expiresAt = parseFabricDate(data.expirationDate);
  cachedFabricTokenExpiresAt = expiresAt || now + 5 * 60 * 1000;
  return cachedFabricToken;
}

async function postWithFabricToken(config, fabricToken, path, body) {
  const response = await fetch(
    `${config.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APP-Key": config.fabricAppId,
        Authorization: fabricToken
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telebirr request failed: ${response.status} ${errText}`);
  }
  return response.json();
}

async function requestAuthToken(accessToken) {
  const config = getTelebirrConfig();
  ensureConfigured(config);
  const fabricToken = await applyFabricToken();

  const req = buildSignedRequest(config, "payment.authtoken", {
    access_token: String(accessToken || "").trim(),
    trade_type: "InApp",
    appid: config.merchantAppId,
    resource_type: "OpenId"
  });

  return postWithFabricToken(config, fabricToken, config.authTokenPath, req);
}

function createMerchantOrderId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function createRawRequest(config, prepayId) {
  const map = {
    appid: config.merchantAppId,
    merch_code: config.merchantCode,
    nonce_str: createNonceStr(),
    prepay_id: prepayId,
    timestamp: createTimeStamp()
  };
  const sign = signRequestObject(config, map);
  return [
    `appid=${map.appid}`,
    `merch_code=${map.merch_code}`,
    `nonce_str=${map.nonce_str}`,
    `prepay_id=${map.prepay_id}`,
    `timestamp=${map.timestamp}`,
    `sign=${sign}`,
    "sign_type=SHA256WithRSA"
  ].join("&");
}

async function createTelebirrCheckout(payload) {
  const config = getTelebirrConfig();
  ensureConfigured(config);
  const fabricToken = await applyFabricToken();

  const merchantOrderId = payload.merchantOrderId || createMerchantOrderId();
  const req = buildSignedRequest(config, "payment.preorder", {
    notify_url: config.callbackUrl,
    trade_type: "InApp",
    appid: config.merchantAppId,
    merch_code: config.merchantCode,
    merch_order_id: merchantOrderId,
    title: payload.title || config.subject,
    total_amount: String(payload.amount),
    trans_currency: payload.currency || "ETB",
    timeout_express: payload.timeoutExpress || "120m",
    business_type: payload.businessType || "BuyGoods",
    payee_identifier: config.merchantCode,
    payee_identifier_type: "04",
    payee_type: "5000"
  });

  const data = await postWithFabricToken(config, fabricToken, config.preOrderPath, req);
  const prepayId = String(data?.biz_content?.prepay_id || "").trim();

  return {
    merchantOrderId,
    prepayId,
    rawRequest: prepayId ? createRawRequest(config, prepayId) : "",
    gatewayResponse: data
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

  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

module.exports = {
  applyFabricToken,
  requestAuthToken,
  createTelebirrCheckout,
  verifyTelebirrWebhookSignature
};
