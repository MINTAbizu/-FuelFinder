const axios = require("axios");

function resolveProvider() {
  return String(process.env.EMAIL_PROVIDER || "console").trim().toLowerCase();
}

function buildFromAddress() {
  const fromAddress = String(process.env.EMAIL_FROM_ADDRESS || "").trim();
  const fromName = String(process.env.EMAIL_FROM_NAME || "FuelFinder").trim();

  if (!fromAddress) {
    throw new Error("EMAIL_FROM_ADDRESS is missing.");
  }

  return fromName ? `${fromName} <${fromAddress}>` : fromAddress;
}

async function sendViaResend({ to, subject, html, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing.");
  }

  await axios.post(
    "https://api.resend.com/emails",
    {
      from: buildFromAddress(),
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  return { provider: "resend" };
}

async function sendEmail({ to, subject, html, text }) {
  const target = String(to || "").trim();
  if (!target) {
    throw new Error("Email target address is missing.");
  }

  const provider = resolveProvider();
  if (provider === "resend") {
    return sendViaResend({ to: target, subject, html, text });
  }

  if (provider === "console" || !provider) {
    if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
      throw new Error("EMAIL_PROVIDER=console is not allowed in production.");
    }
    console.log(`[EMAIL][console] to=${target} subject=${subject}`);
    if (text) console.log(text);
    if (html) console.log(html);
    return { provider: "console" };
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

module.exports = { sendEmail };
