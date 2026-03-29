const FUEL_PRICE_KEYS = ["gasoline", "diesel", "other"];

function readFuelPriceValue(source, key) {
  const input = source && typeof source === "object" ? source : {};

  ["fuelPrices", "fuel_prices"].forEach((nestedKey) => {
    const nested = input[nestedKey];
    if (
      nested &&
      typeof nested === "object" &&
      Object.prototype.hasOwnProperty.call(nested, key)
    ) {
      throw { __fuelPriceFound: true, value: nested[key] };
    }
  });

  if (Object.prototype.hasOwnProperty.call(input, `${key}Price`)) {
    return { found: true, value: input[`${key}Price`] };
  }
  if (Object.prototype.hasOwnProperty.call(input, `${key}_price`)) {
    return { found: true, value: input[`${key}_price`] };
  }
  if (Object.prototype.hasOwnProperty.call(input, key)) {
    return { found: true, value: input[key] };
  }

  return { found: false, value: undefined };
}

function resolveFuelPriceValue(source, key) {
  try {
    return readFuelPriceValue(source, key);
  } catch (error) {
    if (error && error.__fuelPriceFound) {
      return { found: true, value: error.value };
    }
    throw error;
  }
}

function normalizeFuelPriceNumber(value, fieldLabel = "") {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && !value.trim()) return null;

  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    if (fieldLabel) {
      throw new Error(`${fieldLabel} must be a non-negative number.`);
    }
    return null;
  }

  return Number(price.toFixed(2));
}

function normalizeFuelPrices(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    gasoline: normalizeFuelPriceNumber(resolveFuelPriceValue(source, "gasoline").value),
    diesel: normalizeFuelPriceNumber(resolveFuelPriceValue(source, "diesel").value),
    other: normalizeFuelPriceNumber(resolveFuelPriceValue(source, "other").value)
  };
}

function pickFuelPricesPayload(value) {
  const source = value && typeof value === "object" ? value : {};
  const partial = {};
  let hasAny = false;

  FUEL_PRICE_KEYS.forEach((key) => {
    const entry = resolveFuelPriceValue(source, key);
    if (!entry.found) return;

    partial[key] = normalizeFuelPriceNumber(entry.value, `${key} price`);
    hasAny = true;
  });

  return hasAny ? partial : null;
}

function buildFuelPricesResponse(value) {
  const fuelPrices = normalizeFuelPrices(value);
  return {
    fuelPrices,
    fuel_prices: { ...fuelPrices },
    gasolinePrice: fuelPrices.gasoline,
    dieselPrice: fuelPrices.diesel,
    otherPrice: fuelPrices.other,
    gasoline_price: fuelPrices.gasoline,
    diesel_price: fuelPrices.diesel,
    other_price: fuelPrices.other
  };
}

function resolveFuelPriceForType(value, fuelType) {
  const normalizedFuelType = String(fuelType || "").trim().toLowerCase();
  if (!FUEL_PRICE_KEYS.includes(normalizedFuelType)) {
    return null;
  }

  const fuelPrices = normalizeFuelPrices(value);
  return fuelPrices[normalizedFuelType];
}

module.exports = {
  buildFuelPricesResponse,
  normalizeFuelPrices,
  pickFuelPricesPayload,
  resolveFuelPriceForType
};
