/* eslint-disable no-console */
function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function required(name, value) {
  if (!value) {
    throw new Error(`Missing required argument --${name}=...`);
  }
  return value;
}

async function postJson(url, body, bearer) {
  const headers = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_err) {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

async function main() {
  const baseUrl = required("baseUrl", getArg("baseUrl")).replace(/\/+$/, "");
  const bearer = required("bearer", getArg("bearer"));
  const stationId = required("stationId", getArg("stationId"));
  const authToken = required("authToken", getArg("authToken"));
  const requestedBand = getArg("requestedBand") || "10-20";
  const fuelType = getArg("fuelType") || "gasoline";

  console.log("[1/3] Reserving queue slot...");
  const reserve = await postJson(
    `${baseUrl}/api/queue/reserve`,
    { stationId, requestedBand, fuelType },
    bearer
  );
  const reservationId = reserve.reservationId;
  if (!reservationId) {
    throw new Error(`reserve response missing reservationId: ${JSON.stringify(reserve)}`);
  }
  console.log("reservationId:", reservationId);

  console.log("[2/3] Exchanging Telebirr app auth token...");
  const auth = await postJson(
    `${baseUrl}/api/queue/payments/telebirr/auth-token`,
    { authToken },
    bearer
  );
  console.log("authToken exchange status:", auth.result || auth.code || "ok");

  console.log("[3/3] Initiating Telebirr pre-order...");
  const initiate = await postJson(
    `${baseUrl}/api/queue/payments/telebirr/initiate`,
    { reservationId },
    bearer
  );

  console.log("\n--- Telebirr Output ---");
  console.log("merchantOrderId:", initiate.merchantOrderId || "");
  console.log("prepayId:", initiate.prepayId || "");
  console.log("rawRequest:", initiate.rawRequest || "");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
