const crypto = require("crypto");
const fetch = require("node-fetch"); // make sure node-fetch is installed

let cachedFabricToken = "";
let cachedFabricTokenExpiresAt = 0;
let lastWorkingBaseUrl = "";

// ---------------------- Config ----------------------
function getTelebirrConfig() {
  const fallbackBaseUrls = String(process.env.TELEBIRR_BASE_URL_FALLBACKS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    baseUrl: String(process.env.TELEBIRR_BASE_URL || "").trim(),
    fallbackBaseUrls,
    fabricTokenPath: String(process.env.TELEBIRR_FABRIC_TOKEN_PATH || "/payment/v1/token").trim(),
    authTokenPath: String(process.env.TELEBIRR_AUTH_TOKEN_PATH || "/payment/v1/auth/authToken").trim(),
    preOrderPath: String(process.env.TELEBIRR_PRE_ORDER_PATH || "/payment/v1/merchant/preOrder").trim(),
    fabricAppId: String(process.env.TELEBIRR_FABRIC_APP_ID || process.env.TELEBIRR_X_APP_KEY || "").trim(),
    appSecret: String(process.env.TELEBIRR_APP_SECRET || "").trim(),
    merchantAppId: String(process.env.TELEBIRR_MERCHANT_APP_ID || "").trim(),
    merchantCode: String(process.env.TELEBIRR_MERCHANT_CODE || "").trim(),
    privateKey: String(process.env.TELEBIRR_PRIVATE_KEY || "").trim(),
    callbackUrl: String(process.env.TELEBIRR_CALLBACK_URL || "").trim(),
    returnUrl: String(process.env.TELEBIRR_RETURN_URL || "").trim(),
    receiveName: String(process.env.TELEBIRR_RECEIVE_NAME || "").trim(),
    subject: String(process.env.TELEBIRR_SUBJECT || "FuelFinder Queue Deposit").trim(),
    webhookSecret: String(process.env.TELEBIRR_WEBHOOK_SECRET || "").trim(),
    maxRetries: Math.max(0, Number(process.env.TELEBIRR_MAX_RETRIES || 2)),
    retryDelayMs: Math.max(0, Number(process.env.TELEBIRR_RETRY_DELAY_MS || 800))
  };
}

function ensureConfigured(config) {
  const required = ["baseUrl", "fabricAppId", "appSecret", "merchantAppId", "merchantCode", "privateKey", "callbackUrl"];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Telebirr is not configured. Missing: ${missing.join(", ")}`);
  }
}

// ---------------------- Helpers ----------------------
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

function buildUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

function getBaseUrlCandidates(config) {
  const deduped = [];
  const add = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || deduped.includes(normalized)) return;
    deduped.push(normalized);
  };
  add(lastWorkingBaseUrl);
  add(config.baseUrl);
  (config.fallbackUrls || []).forEach(add);
  return deduped;
}

// ---------------------- Network ----------------------
function describeNetworkError(error) {
  const cause = error?.cause || {};
  const code = cause.code || error?.code || "UNKNOWN";
  const errno = cause.errno || error?.errno || "";
  const syscall = cause.syscall || "";
  const host = cause.hostname || cause.host || "";
  const port = cause.port || "";
  const reason = String(cause.message || error?.message || "fetch failed");
  return `code=${code}; errno=${errno}; syscall=${syscall}; host=${host}; port=${port}; reason=${reason}`;
}

function shouldRetryNetworkError(error) {
  const text = describeNetworkError(error);
  return /UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, retries, retryDelayMs) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      console.log(`Fetching [attempt ${attempt + 1}] -> ${url}`);
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error;
      console.error(`Network error at ${url}: ${describeNetworkError(error)}`);
      if (!shouldRetryNetworkError(error) || attempt >= retries) {
        throw error;
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError;
}

// ---------------------- Fabric Token ----------------------
async function applyFabricToken(forceRefresh = false) {
  const config = getTelebirrConfig();
  ensureConfigured(config);

  const now = Date.now();
  const refreshSkewMs = 30 * 1000;
  if (!forceRefresh && cachedFabricToken && cachedFabricTokenExpiresAt - refreshSkewMs > now) {
    console.log("Using cached fabric token");
    return cachedFabricToken;
  }

  const errors = [];
  const baseUrls = getBaseUrlCandidates(config);
  for (const baseUrl of baseUrls) {
    const url = buildUrl(baseUrl, config.fabricTokenPath);
    try {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-APP-Key": config.fabricAppId
          },
          body: JSON.stringify({ appSecret: config.appSecret })
        },
        config.maxRetries,
        config.retryDelayMs
      );

      if (!response.ok) {
        const text = await response.text();
        errors.push(`HTTP error at ${url}: ${response.status} ${text}`);
        console.error(`HTTP error at ${url}: ${response.status} ${text}`);
        continue;
      }

      const data = await response.json();
      const token = String(data.token || "").trim();
      if (!token) {
        errors.push(`Invalid token response at ${url}: missing token`);
        console.error(`Invalid token response at ${url}: missing token`);
        continue;
      }

      cachedFabricToken = token;
      cachedFabricTokenExpiresAt = parseFabricDate(data.expirationDate) || now + 5 * 60 * 1000;
      lastWorkingBaseUrl = baseUrl;
      console.log(`Successfully fetched fabric token from ${url}`);
      return cachedFabricToken;
    } catch (error) {
      errors.push(`Network error at ${url}: ${describeNetworkError(error)}`);
      console.error(`Network error at ${url}: ${describeNetworkError(error)}`);
      continue;
    }
  }

  throw new Error(`Telebirr fabric token failed across all base URLs. Details: ${errors.join(" | ")}`);
}

// ---------------------- Post with Fabric Token ----------------------
async function postWithFabricToken(config, fabricToken, path, body) {
  const errors = [];
  const baseUrls = getBaseUrlCandidates(config);

  for (const baseUrl of baseUrls) {
    const url = buildUrl(baseUrl, path);
    try {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-APP-Key": config.fabricAppId,
            Authorization: fabricToken
          },
          body: JSON.stringify(body)
        },
        config.maxRetries,
        config.retryDelayMs
      );

      if (!response.ok) {
        const text = await response.text();
        errors.push(`HTTP error at ${url}: ${response.status} ${text}`);
        console.error(`HTTP error at ${url}: ${response.status} ${text}`);
        continue;
      }

      lastWorkingBaseUrl = baseUrl;
      console.log(`Request successful to ${url}`);
      return response.json();
    } catch (error) {
      errors.push(`Network error at ${url}: ${describeNetworkError(error)}`);
      console.error(`Network error at ${url}: ${describeNetworkError(error)}`);
      continue;
    }
  }

  throw new Error(`Telebirr request failed across all base URLs. Details: ${errors.join(" | ")}`);
}

// ---------------------- Exports ----------------------
module.exports = {
  applyFabricToken,
  postWithFabricToken,
  buildSignedRequest,
  signRequestObject,
  getTelebirrConfig
};