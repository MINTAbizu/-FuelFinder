const PAYMENT_DETAIL_KEYS = [
  "providerName",
  "accountName",
  "accountNumber",
  "phoneNumber",
  "instructions"
];

function normalizePaymentDetails(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    providerName: String(source.providerName || "").trim(),
    accountName: String(source.accountName || "").trim(),
    accountNumber: String(source.accountNumber || "").trim(),
    phoneNumber: String(source.phoneNumber || "").trim(),
    instructions: String(source.instructions || "").trim()
  };
}

function pickPaymentDetailsPayload(value) {
  const source = value && typeof value === "object" ? value : {};
  const nested =
    source.paymentDetails && typeof source.paymentDetails === "object"
      ? source.paymentDetails
      : source;

  const partial = {};
  let hasAny = false;

  PAYMENT_DETAIL_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nested, key)) {
      partial[key] = String(nested[key] || "").trim();
      hasAny = true;
    }
  });

  return hasAny ? partial : null;
}

module.exports = {
  normalizePaymentDetails,
  pickPaymentDetailsPayload
};
