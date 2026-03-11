const axios = require("axios");

function resolveProvider() {
  return String(process.env.SMS_PROVIDER || "console").trim().toLowerCase();
}

async function sendViaTwilio({ to, message }) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio credentials are missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: message
  });

  await axios.post(url, body.toString(), {
    auth: { username: accountSid, password: authToken },
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  return { provider: "twilio" };
}

async function sendSms(to, message) {
  const provider = resolveProvider();
  if (!to) {
    throw new Error("SMS target phone number is missing.");
  }

  if (provider === "twilio") {
    return sendViaTwilio({ to, message });
  }

  if (provider === "console" || !provider) {
    console.log(`[SMS][console] ${to}: ${message}`);
    return { provider: "console" };
  }

  throw new Error(`Unsupported SMS_PROVIDER: ${provider}`);
}

module.exports = { sendSms };
