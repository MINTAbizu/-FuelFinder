const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function trimText(value) {
  return String(value || "").trim();
}

function isExpoPushToken(value) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(trimText(value));
}

async function sendExpoPushNotifications(messages = []) {
  const normalized = (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      to: trimText(message?.to),
      title: trimText(message?.title),
      body: trimText(message?.body),
      sound: trimText(message?.sound) || "default",
      channelId: trimText(message?.channelId),
      priority: trimText(message?.priority) || "high",
      data: message?.data && typeof message.data === "object" ? message.data : {},
    }))
    .filter((message) => isExpoPushToken(message.to));

  if (!normalized.length) {
    return {
      ok: false,
      sentCount: 0,
      invalidTokens: [],
      errors: ["No valid Expo push tokens were available."],
    };
  }

  let response;
  try {
    response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(normalized),
    });
  } catch (error) {
    return {
      ok: false,
      sentCount: 0,
      invalidTokens: [],
      errors: [trimText(error?.message) || "Failed to reach Expo push service."],
    };
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  const ticketResults = Array.isArray(payload?.data)
    ? payload.data
    : payload?.data
      ? [payload.data]
      : [];

  const invalidTokens = [];
  const errors = [];
  let sentCount = 0;

  ticketResults.forEach((ticket, index) => {
    if (String(ticket?.status || "").trim().toLowerCase() === "ok") {
      sentCount += 1;
      return;
    }

    const detailError = trimText(ticket?.details?.error);
    if (detailError === "DeviceNotRegistered") {
      invalidTokens.push(normalized[index]?.to);
    }

    const message =
      trimText(ticket?.message) ||
      detailError ||
      `Expo push notification failed for token ${normalized[index]?.to || "unknown"}.`;
    errors.push(message);
  });

  if (!response.ok && !errors.length) {
    const topLevelErrors = Array.isArray(payload?.errors) ? payload.errors : [];
    topLevelErrors.forEach((item) => {
      const message = trimText(item?.message);
      if (message) {
        errors.push(message);
      }
    });
    if (!errors.length) {
      errors.push(`Expo push notification request failed with status ${response.status}.`);
    }
  }

  return {
    ok: sentCount > 0,
    sentCount,
    invalidTokens: invalidTokens.filter(Boolean),
    errors,
    tickets: ticketResults,
  };
}

module.exports = { isExpoPushToken, sendExpoPushNotifications };
