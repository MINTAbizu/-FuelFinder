import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AUTH_EXPIRED_EVENT,
  AUTH_EXPIRED_MESSAGE,
  callNextInQueue,
  createAdminStation,
  createStationPromotion,
  createStationTeamUser,
  createAdminUser,
  forceLogoutAdminUser,
  forceLogoutStationTeamUser,
  getOwnerStation,
  getStationFuelStockSummary,
  listAdminStations,
  listNearbyFuelStations,
  listPublicMapStations,
  getStationQueue,
  listAdminCities,
  listAdminRegions,
  listAdminWoredas,
  listAdminUsers,
  listOrganizationOptions,
  listOwnerStations,
  listStationPromotions,
  listStationPayments,
  listStationTeam,
  loadSession,
  login,
  logout,
  setAdminUserBlocked,
  setStationTeamUserBlocked,
  updateAdminStation,
  updateOwnerStation,
  updateStationPromotion,
  updateStationTeamUser,
  updateAdminUser,
  updateFuelStock
} from "../api.js";

const sections = [
  { id: "overview", label: "Command Center" },
  { id: "all_stations", label: "All Stations" },
  { id: "queue", label: "Queue" },
  { id: "inventory", label: "Fuel & Stock" },
  { id: "cashflow", label: "Cashflow" },
  { id: "pricing", label: "Pricing" },
  { id: "reports", label: "Reports" },
  { id: "staff", label: "Team" },
  { id: "settings", label: "Station Settings" }
];

const roleLabels = {
  staff: "Staff",
  station_manager: "Station Manager",
  city_manager: "City Manager",
  org_admin: "Org Owner",
  super_admin: "Super Admin"
};
const SUPER_ADMIN_DIRECTORY_PAGE_LIMIT = 50;

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "--";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function buildEstimate(waitingCount) {
  const avgMinutesPerCar = 3;
  return waitingCount * avgMinutesPerCar;
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function formatMoney(value, currency = "ETB") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatPricePerLiter(value, currency = "ETB") {
  const money = formatMoney(value, currency);
  return money === "--" ? "--" : `${money}/L`;
}

function formatFuelPriceInputValue(value) {
  if (value === null || value === undefined) return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

function buildFuelPricesPayload(form) {
  const asNullableText = (value) => {
    const text = String(value ?? "").trim();
    return text ? text : null;
  };

  return {
    gasoline: asNullableText(form?.gasolinePrice),
    diesel: asNullableText(form?.dieselPrice),
    other: asNullableText(form?.otherPrice)
  };
}

function formatLiters(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
}

function formatFuelTypeLabel(fuelType) {
  const normalized = String(fuelType || "").trim().toLowerCase();
  if (normalized === "gasoline") return "Gasoline";
  if (normalized === "diesel") return "Diesel";
  if (normalized === "other") return "Other fuel";
  return "Fuel";
}

function formatFuelStatusLabel(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "full" || normalized === "available") return "Healthy stock";
  if (normalized === "limited") return "Low stock";
  if (normalized === "empty") return "Out of stock";
  return "Partial stock";
}

function asFiniteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function readOptionalFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsvFile(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildStationFormState(stationId, station) {
  const paymentDetails = station?.paymentDetails || {};
  const fuelPrices = station?.fuelPrices || station?.fuel_prices || {};
  return {
    _stationId: stationId,
    name: String(station?.name || ""),
    address: String(station?.address || ""),
    contact: String(station?.contact || ""),
    stationType: String(station?.stationType || "fuel"),
    gasolinePrice: formatFuelPriceInputValue(
      fuelPrices.gasoline ?? station?.gasolinePrice ?? station?.gasoline_price
    ),
    dieselPrice: formatFuelPriceInputValue(
      fuelPrices.diesel ?? station?.dieselPrice ?? station?.diesel_price
    ),
    otherPrice: formatFuelPriceInputValue(
      fuelPrices.other ?? station?.otherPrice ?? station?.other_price
    ),
    chapaSubaccountId: String(station?.chapaSubaccountId || ""),
    paymentProviderName: String(paymentDetails.providerName || ""),
    paymentAccountName: String(paymentDetails.accountName || ""),
    paymentAccountNumber: String(paymentDetails.accountNumber || ""),
    paymentPhoneNumber: String(paymentDetails.phoneNumber || ""),
    paymentInstructions: String(paymentDetails.instructions || ""),
    isActive: Boolean(station?.isActive)
  };
}

function buildCreateStationFormState(defaultOrganizationId = "") {
  return {
    name: "",
    address: "",
    contact: "",
    latitude: "",
    longitude: "",
    stationType: "fuel",
    fuelStatus: "partial",
    gasolinePrice: "",
    dieselPrice: "",
    otherPrice: "",
    isActive: true,
    organizationId: String(defaultOrganizationId || ""),
    regionId: "",
    cityId: "",
    woredaId: "",
    branchId: "",
    chapaSubaccountId: "",
    paymentProviderName: "",
    paymentAccountName: "",
    paymentAccountNumber: "",
    paymentPhoneNumber: "",
    paymentInstructions: ""
  };
}

function formatDateTimeLocalValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildPromotionFormState(promotion = null) {
  return {
    id: String(promotion?.id || promotion?._id || ""),
    title: String(promotion?.title || ""),
    description: String(promotion?.description || ""),
    mediaType: String(promotion?.mediaType || "image"),
    mediaUrl: String(promotion?.mediaUrl || ""),
    thumbnailUrl: String(promotion?.thumbnailUrl || ""),
    ctaLabel: String(promotion?.ctaLabel || ""),
    ctaUrl: String(promotion?.ctaUrl || ""),
    startsAt: formatDateTimeLocalValue(promotion?.startsAt),
    endsAt: formatDateTimeLocalValue(promotion?.endsAt),
    sortOrder: String(
      promotion?.sortOrder !== undefined && promotion?.sortOrder !== null
        ? promotion.sortOrder
        : 100
    ),
    isActive: promotion?.isActive !== undefined ? Boolean(promotion.isActive) : true
  };
}

function splitAddressParts(address) {
  return String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildDirectoryNameMap(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = normalizeKey(item?.name);
    if (!key) return;
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  });
  return map;
}

function getDirectoryMatchesByName(map, value) {
  const key = normalizeKey(value);
  return key ? map.get(key) || [] : [];
}

function findDirectoryMentionInText(text, items, options = {}) {
  const normalizedText = normalizeKey(text);
  if (!normalizedText) return null;

  const regionId = String(options?.regionId || "").trim();
  const haystack = ` ${normalizedText} `;
  const matches = (Array.isArray(items) ? items : [])
    .filter((item) => {
      if (!regionId) return true;
      return String(item?.regionId || "").trim() === regionId;
    })
    .map((item) => ({
      item,
      key: normalizeKey(item?.name)
    }))
    .filter(({ key }) => key && haystack.includes(` ${key} `))
    .sort((a, b) => b.key.length - a.key.length);

  return matches[0]?.item || null;
}

function isPlaceholderLocationText(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text === "address not listed") return true;
  return text.startsWith("approx location");
}

function isCoordinateFragment(value) {
  const text = String(value || "")
    .trim()
    .replace(/[()]/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(text);
}

function looksLikeRoadOrLandmark(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  if (/^\d+[\s-]/.test(text)) return true;

  const roadHints = [
    " road",
    " street",
    " avenue",
    " ave",
    " highway",
    " bridge",
    " ring road",
    " junction",
    " roundabout",
    " camp",
    " area",
    " terminal",
    " station",
    " fuel",
    " hotel",
    " square"
  ];

  return roadHints.some((hint) => text.includes(hint) || text.endsWith(hint.trim()));
}

const LIVE_STATION_NAME_PREFIXES = [
  "fuel station",
  "fuel stop",
  "fuel",
  "gas station",
  "service station",
  "shell fuel",
  "shell",
  "total fuelstop",
  "total fuel",
  "totalenergies",
  "total",
  "nile petroleum",
  "nile",
  "national oil company",
  "national oil ethiopia plc noc",
  "noc ethiopia",
  "noc",
  "oilibya ethiopia orbis",
  "oilibya ethiopia",
  "oilibya",
  "oilibya",
  "mobil fuel",
  "mobil",
  "kobil",
  "ybp",
  "yetebaberut gas station",
  "yetebaberut",
  "yeshi",
  "gomeju oil ethiopia",
  "gomeju",
  "ola",
  "taf",
  "was",
  "baro",
  "calub",
  "bp fuel",
  "bp lubricants",
  "bp",
  "green",
  "united",
  "global",
  "delta",
  "allway",
  "african"
].sort((a, b) => b.length - a.length);

function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function cleanLiveLocalityCandidate(value, cityLabel, regionLabel) {
  const text = String(value || "")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (isPlaceholderLocationText(text) || isCoordinateFragment(text)) return "";

  const normalized = normalizeKey(text);
  if (!normalized) return "";
  if (normalized === normalizeKey(cityLabel) || normalized === normalizeKey(regionLabel)) return "";
  if (normalized.startsWith("node ") || normalized.startsWith("way ")) return "";
  if (["fuel", "fuel station", "fuel stop", "gas station", "service station"].includes(normalized)) {
    return "";
  }

  return text;
}

function deriveLocalityFromLiveStationName(name, cityLabel, regionLabel) {
  const raw = String(name || "").trim();
  if (!raw) return "";

  const candidates = [];
  const parenMatches = raw.match(/\(([^)]+)\)/g) || [];
  parenMatches.forEach((match) => {
    const inner = String(match || "").replace(/[()]/g, "").trim();
    if (inner) candidates.push(inner);
  });

  raw
    .split(/\s[-/]\s| - | \/ /)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(1)
    .forEach((part) => candidates.push(part));

  const normalizedRaw = normalizeKey(raw);
  LIVE_STATION_NAME_PREFIXES.forEach((prefix) => {
    if (!normalizedRaw.startsWith(`${prefix} `)) return;
    const remainder = normalizedRaw.slice(prefix.length).trim();
    if (remainder) {
      candidates.push(titleCaseWords(remainder));
    }
  });

  for (const candidate of candidates) {
    const cleaned = cleanLiveLocalityCandidate(candidate, cityLabel, regionLabel);
    if (cleaned) return cleaned;
  }

  return "";
}

function buildHumanReadableLiveAddress(station, cityLabel, regionLabel) {
  const directAddress = String(station?.address || "").trim();
  if (!isPlaceholderLocationText(directAddress)) {
    return directAddress;
  }

  const parts = [
    String(station?.landmark || "").trim(),
    String(station?.subcity || "").trim(),
    String(station?.woreda || "").trim(),
    deriveLocalityFromLiveStationName(station?.name, cityLabel, regionLabel),
    String(cityLabel || "").trim(),
    String(regionLabel || "").trim()
  ].filter(Boolean);

  const uniqueParts = [];
  const seen = new Set();
  parts.forEach((part) => {
    const key = normalizeKey(part);
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueParts.push(part);
  });

  if (uniqueParts.length) {
    return `Near ${uniqueParts.join(", ")}`;
  }

  return "Live map location";
}

function buildStationFullAddress(station, cityLabel = "", regionLabel = "") {
  const parts = [];
  const seen = new Set();

  const pushPart = (value) => {
    String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (isPlaceholderLocationText(part)) return;
        const key = normalizeKey(part);
        if (!key || seen.has(key)) return;
        seen.add(key);
        parts.push(part);
      });
  };

  pushPart(station?.address);
  pushPart(station?.landmark);
  pushPart(station?.subcity);
  pushPart(station?.woredaDirectory?.name || station?.woreda);
  pushPart(station?.city?.name || cityLabel);
  pushPart(station?.region?.name || regionLabel);

  return parts.length ? parts.join(", ") : "Address not set yet.";
}

function deriveCityRegion(station) {
  const countryTokens = new Set(["ethiopia", "ethiopia.", "et", "eth", "ethiopian"]);
  const rawAddress = String(station?.address || "").trim();
  const parts = isPlaceholderLocationText(rawAddress)
    ? []
    : splitAddressParts(rawAddress).filter(
        (part) => !isPlaceholderLocationText(part) && !isCoordinateFragment(part)
      );
  const fallbackSubcity = String(station?.subcity || "").trim();
  const fallbackWoreda = String(station?.woreda || "").trim();
  while (parts.length && countryTokens.has(normalizeKey(parts[parts.length - 1]))) {
    parts.pop();
  }

  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const prev = parts[parts.length - 2];

    if (looksLikeRoadOrLandmark(prev) && !looksLikeRoadOrLandmark(last)) {
      return { cityLabel: last, regionLabel: "Unspecified region" };
    }
  }

  if (parts.length >= 2) {
    const cityLabel = parts[parts.length - 2];
    const regionLabel = parts[parts.length - 1];
    if (!looksLikeRoadOrLandmark(cityLabel) && !looksLikeRoadOrLandmark(regionLabel)) {
      return { cityLabel, regionLabel };
    }
    return { cityLabel: regionLabel, regionLabel: "Unspecified region" };
  }

  if (parts.length === 1) {
    const only = parts[0];
    if (looksLikeRoadOrLandmark(only)) {
      return { cityLabel: "Unspecified city", regionLabel: "Unspecified region" };
    }
    return { cityLabel: only, regionLabel: "Unspecified region" };
  }

  if (fallbackSubcity) {
    return { cityLabel: fallbackSubcity, regionLabel: "Unspecified region" };
  }

  if (fallbackWoreda && !isPlaceholderLocationText(fallbackWoreda)) {
    return { cityLabel: fallbackWoreda, regionLabel: "Unspecified region" };
  }

  const fallbackCity = station?.cityId ? `City ${String(station.cityId).slice(-6).toUpperCase()}` : "Unspecified city";
  return { cityLabel: fallbackCity, regionLabel: "Unspecified region" };
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildLocalDayBounds(dateKey = localDateKey()) {
  const safeDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) ? String(dateKey) : localDateKey();
  const [year, month, day] = safeDateKey.split("-").map((part) => Number(part));
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return {
    dateKey: safeDateKey,
    from: start.toISOString(),
    to: end.toISOString()
  };
}

function buildEmptyInventorySummary(dateKey = localDateKey()) {
  return {
    date: dateKey,
    leftFuelAvailable: false,
    leftFuelSource: "unavailable",
    leftFuelUpdatedAt: null,
    totals: {
      soldLiters: 0,
      soldAmount: 0,
      servedTickets: 0,
      leftLiters: null
    },
    breakdown: ["gasoline", "diesel", "other"].map((fuelType) => ({
      fuelType,
      soldLiters: 0,
      soldAmount: 0,
      servedTickets: 0,
      leftLiters: null
    }))
  };
}

function buildCoordinateCentroid(items = []) {
  const coords = (Array.isArray(items) ? items : [])
    .map((item) => ({
      latitude: readOptionalFiniteNumber(item?.latitude),
      longitude: readOptionalFiniteNumber(item?.longitude)
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

  if (!coords.length) return null;

  const totals = coords.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude,
      longitude: sum.longitude + point.longitude
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: totals.latitude / coords.length,
    longitude: totals.longitude / coords.length,
    sampleSize: coords.length
  };
}

function distanceMetersBetweenPoints(from, to) {
  const fromLatitude = readOptionalFiniteNumber(from?.latitude);
  const fromLongitude = readOptionalFiniteNumber(from?.longitude);
  const toLatitude = readOptionalFiniteNumber(to?.latitude);
  const toLongitude = readOptionalFiniteNumber(to?.longitude);
  if (
    !Number.isFinite(fromLatitude) ||
    !Number.isFinite(fromLongitude) ||
    !Number.isFinite(toLatitude) ||
    !Number.isFinite(toLongitude)
  ) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const dLat = ((toLatitude - fromLatitude) * Math.PI) / 180;
  const dLon = ((toLongitude - fromLongitude) * Math.PI) / 180;
  const lat1 = (fromLatitude * Math.PI) / 180;
  const lat2 = (toLatitude * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildLiveCitySearchRadiusMeters(center, stations = []) {
  const stationList = Array.isArray(stations) ? stations : [];
  const maxStationDistance = stationList.reduce((currentMax, station) => {
    const distance = distanceMetersBetweenPoints(center, {
      latitude: station?.latitude,
      longitude: station?.longitude
    });
    return Number.isFinite(distance) ? Math.max(currentMax, distance) : currentMax;
  }, 0);

  const bufferedDistance = maxStationDistance > 0 ? maxStationDistance + 5000 : 12000;
  return Math.min(50000, Math.max(12000, Math.round(bufferedDistance)));
}

function buildLiveStationMergeKey(station) {
  const linkedStationId = String(station?.stationId || "").trim();
  if (linkedStationId) return `station:${linkedStationId}`;

  const publicId = String(station?.id || "").trim();
  if (publicId) return `public:${publicId}`;

  const nameKey = normalizeKey(station?.name || "station");
  const latitude = readOptionalFiniteNumber(station?.latitude);
  const longitude = readOptionalFiniteNumber(station?.longitude);
  return `${nameKey}:${latitude ?? "na"}:${longitude ?? "na"}`;
}

function mergeLiveStationLists(primary = [], secondary = []) {
  const merged = new Map();

  [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].forEach((station) => {
    const key = buildLiveStationMergeKey(station);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, station);
      return;
    }

    merged.set(key, {
      ...existing,
      ...station,
      id: station?.id || existing?.id,
      stationId: station?.stationId || existing?.stationId,
      distanceMeters:
        readOptionalFiniteNumber(station?.distanceMeters) ?? readOptionalFiniteNumber(existing?.distanceMeters),
      latitude: readOptionalFiniteNumber(station?.latitude) ?? readOptionalFiniteNumber(existing?.latitude),
      longitude: readOptionalFiniteNumber(station?.longitude) ?? readOptionalFiniteNumber(existing?.longitude)
    });
  });

  return Array.from(merged.values()).sort((left, right) => {
    const leftDistance = readOptionalFiniteNumber(left?.distanceMeters);
    const rightDistance = readOptionalFiniteNumber(right?.distanceMeters);
    const leftHasDistance = Number.isFinite(leftDistance);
    const rightHasDistance = Number.isFinite(rightDistance);

    if (leftHasDistance && rightHasDistance && leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    if (leftHasDistance !== rightHasDistance) {
      return leftHasDistance ? -1 : 1;
    }

    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
}

function readStorageJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const CEO_TASKS = [
  {
    id: "fuel_stock",
    title: "Confirm fuel stock is up to date",
    note: "Keep customer availability accurate.",
    section: "inventory"
  },
  {
    id: "queue_health",
    title: "Check queue health",
    note: "Watch avg wait time and call next ticket if needed.",
    section: "queue"
  },
  {
    id: "cashflow_review",
    title: "Review payments and payouts",
    note: "Confirm transactions and expected station payout.",
    section: "cashflow"
  },
  {
    id: "team_review",
    title: "Review team roster",
    note: "Block old accounts, revoke sessions if needed.",
    section: "staff"
  },
  {
    id: "profile_review",
    title: "Verify station profile",
    note: "Name, address, and contact should be correct.",
    section: "settings"
  }
];

const SUPER_ADMIN_QUICK_ACTIONS = [
  {
    section: "overview",
    label: "Summary",
    note: "Check the selected station overview."
  },
  {
    section: "queue",
    label: "Queue",
    note: "Open queue and call next."
  },
  {
    section: "inventory",
    label: "Fuel & Stock",
    note: "Update live fuel availability."
  },
  {
    section: "cashflow",
    label: "Payments",
    note: "Review transactions and payouts."
  },
  {
    section: "staff",
    label: "Users & Roles",
    note: "Manage admin and station accounts."
  },
  {
    section: "settings",
    label: "Station Settings",
    note: "Edit station profile and setup."
  }
];

const STATION_MANAGER_QUICK_ACTIONS = [
  { section: "queue", label: "Queue" },
  { section: "inventory", label: "Fuel & Stock" },
  { section: "cashflow", label: "Payments" },
  { section: "pricing", label: "Promotions" },
  { section: "staff", label: "Team" },
  { section: "reports", label: "Reports" },
  { section: "settings", label: "Station Profile" }
];

const LOCATION_DIRECTORY_STORAGE_KEY = "ff_owner_location_directory_v1";

function readCachedLocationDirectory() {
  const cached = readStorageJSON(LOCATION_DIRECTORY_STORAGE_KEY, {});
  return {
    regions: Array.isArray(cached?.regions) ? cached.regions : [],
    cities: Array.isArray(cached?.cities) ? cached.cities : [],
    woredas: Array.isArray(cached?.woredas) ? cached.woredas : []
  };
}

function persistLocationDirectory(directory = {}) {
  try {
    localStorage.setItem(
      LOCATION_DIRECTORY_STORAGE_KEY,
      JSON.stringify({
        regions: Array.isArray(directory?.regions) ? directory.regions : [],
        cities: Array.isArray(directory?.cities) ? directory.cities : [],
        woredas: Array.isArray(directory?.woredas) ? directory.woredas : []
      })
    );
  } catch {
    // Ignore storage failures.
  }
}

export default function Dashboard() {
  const cachedLocationDirectory = useMemo(() => readCachedLocationDirectory(), []);
  const [active, setActive] = useState("overview");
  const [session, setSession] = useState(() => loadSession());
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState("");
  const [station, setStation] = useState(null);
  const [queueSnapshot, setQueueSnapshot] = useState(null);
  const [fuelForm, setFuelForm] = useState({
    gasolineLiters: "",
    dieselLiters: "",
    otherLiters: ""
  });
  const [inventoryDate, setInventoryDate] = useState(() => localDateKey());
  const [inventorySummary, setInventorySummary] = useState(() => buildEmptyInventorySummary(localDateKey()));
  const [inventorySummaryLoading, setInventorySummaryLoading] = useState(false);
  const [inventorySummaryError, setInventorySummaryError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const actorRole = String(session?.user?.role || "");
  const isSuperAdmin = actorRole === "super_admin";
  const isStationManager = actorRole === "station_manager";
  const isStationExec = actorRole === "station_manager" || actorRole === "org_admin" || actorRole === "super_admin";
  const canManageStations = actorRole === "org_admin" || actorRole === "super_admin";
  const canEditChapaSubaccount = isSuperAdmin || isStationManager;
  const isCeo = actorRole === "station_manager" || actorRole === "org_admin";
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [organizationOptions, setOrganizationOptions] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [limitToCurrentStation, setLimitToCurrentStation] = useState(true);

  const [createUserForm, setCreateUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "staff",
    organizationId: "",
    cityIds: "",
    stationIds: "",
    branchIds: "",
    assignToSelectedStation: true
  });
  const [createUserError, setCreateUserError] = useState("");
  const [createUserStatus, setCreateUserStatus] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const [editUserId, setEditUserId] = useState("");
  const [editUserForm, setEditUserForm] = useState(null);
  const [editUserError, setEditUserError] = useState("");
  const [editUserStatus, setEditUserStatus] = useState("");
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [ceoTasks, setCeoTasks] = useState({});

  const [paymentsSnapshot, setPaymentsSnapshot] = useState(() => ({
    total: 0,
    page: 1,
    limit: 25,
    stationId: "",
    summary: { amount: 0, platformFee: 0, stationPayout: 0 },
    items: []
  }));
  const [paymentsFilters, setPaymentsFilters] = useState({
    provider: "",
    status: "",
    from: "",
    to: "",
    page: 1,
    limit: 25
  });
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");

  const [teamUsers, setTeamUsers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamStatus, setTeamStatus] = useState("");

  const [createTeamForm, setCreateTeamForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "staff"
  });
  const [createTeamError, setCreateTeamError] = useState("");
  const [createTeamStatus, setCreateTeamStatus] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const [editTeamUserId, setEditTeamUserId] = useState("");
  const [editTeamForm, setEditTeamForm] = useState(null);
  const [editTeamError, setEditTeamError] = useState("");
  const [editTeamStatus, setEditTeamStatus] = useState("");
  const [isSavingTeam, setIsSavingTeam] = useState(false);

  const [stationForm, setStationForm] = useState(null);
  const [stationFormDirty, setStationFormDirty] = useState(false);
  const [stationFormError, setStationFormError] = useState("");
  const [stationFormStatus, setStationFormStatus] = useState("");
  const [isSavingStation, setIsSavingStation] = useState(false);
  const [createStationForm, setCreateStationForm] = useState(() =>
    buildCreateStationFormState(session?.user?.organizationId || "")
  );
  const [createStationError, setCreateStationError] = useState("");
  const [createStationStatus, setCreateStationStatus] = useState("");
  const [isCreatingStation, setIsCreatingStation] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionsError, setPromotionsError] = useState("");
  const [promotionStatus, setPromotionStatus] = useState("");
  const [promotionForm, setPromotionForm] = useState(() => buildPromotionFormState());
  const [isSavingPromotion, setIsSavingPromotion] = useState(false);
  const [directoryRegions, setDirectoryRegions] = useState(cachedLocationDirectory.regions);
  const [directoryCities, setDirectoryCities] = useState(cachedLocationDirectory.cities);
  const [directoryWoredas, setDirectoryWoredas] = useState(cachedLocationDirectory.woredas);
  const [locationDirectoryMessage, setLocationDirectoryMessage] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [woredaFilter, setWoredaFilter] = useState("all");
  const [superAdminStationSearch, setSuperAdminStationSearch] = useState("");
  const deferredSuperAdminStationSearch = useDeferredValue(superAdminStationSearch);
  const [superAdminStationPage, setSuperAdminStationPage] = useState(1);
  const [superAdminStationDirectoryMeta, setSuperAdminStationDirectoryMeta] = useState({
    total: 0,
    page: 1,
    limit: SUPER_ADMIN_DIRECTORY_PAGE_LIMIT,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false
  });
  const [superAdminStationDirectoryLoading, setSuperAdminStationDirectoryLoading] = useState(false);
  const [superAdminStationDirectoryError, setSuperAdminStationDirectoryError] = useState("");
  const [superAdminStationDirectoryRefreshKey, setSuperAdminStationDirectoryRefreshKey] = useState(0);
  const [liveCityStations, setLiveCityStations] = useState([]);
  const [liveCityStationsLoading, setLiveCityStationsLoading] = useState(false);
  const [liveCityStationsError, setLiveCityStationsError] = useState("");
  const [allStationsList, setAllStationsList] = useState([]);
  const [allStationsListLoading, setAllStationsListLoading] = useState(false);
  const [allStationsListError, setAllStationsListError] = useState("");

  const resetConsoleState = (nextAuthError = "") => {
    setSession(null);
    setActive("overview");
    setStations([]);
    setStationId("");
    setStation(null);
    setQueueSnapshot(null);
    setStatusMessage("");
    setLocationDirectoryMessage("");
    setRegionFilter("all");
    setCityFilter("all");
    setWoredaFilter("all");
    setSuperAdminStationSearch("");
    setSuperAdminStationPage(1);
    setSuperAdminStationDirectoryMeta({
      total: 0,
      page: 1,
      limit: SUPER_ADMIN_DIRECTORY_PAGE_LIMIT,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false
    });
    setSuperAdminStationDirectoryLoading(false);
    setSuperAdminStationDirectoryError("");
    setSuperAdminStationDirectoryRefreshKey(0);
    setAllStationsList([]);
    setAllStationsListLoading(false);
    setAllStationsListError("");

    setAdminUsers([]);
    setAdminUsersError("");
    setOrganizationOptions([]);
    setUserSearch("");
    setRoleFilter("all");
    setLimitToCurrentStation(true);
    setCreateUserForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      role: "staff",
      organizationId: "",
      cityIds: "",
      stationIds: "",
      branchIds: "",
      assignToSelectedStation: true
    });
    setCreateUserError("");
    setCreateUserStatus("");
    setIsCreatingUser(false);
    setEditUserId("");
    setEditUserForm(null);
    setEditUserError("");
    setEditUserStatus("");
    setIsSavingUser(false);

    setCeoTasks({});
    setPaymentsSnapshot({
      total: 0,
      page: 1,
      limit: 25,
      stationId: "",
      summary: { amount: 0, platformFee: 0, stationPayout: 0 },
      items: []
    });
    setPaymentsFilters({
      provider: "",
      status: "",
      from: "",
      to: "",
      page: 1,
      limit: 25
    });
    setPaymentsLoading(false);
    setPaymentsError("");

    setTeamUsers([]);
    setTeamLoading(false);
    setTeamError("");
    setTeamStatus("");
    setCreateTeamForm({ name: "", email: "", phone: "", password: "", role: "staff" });
    setCreateTeamError("");
    setCreateTeamStatus("");
    setIsCreatingTeam(false);
    setEditTeamUserId("");
    setEditTeamForm(null);
    setEditTeamError("");
    setEditTeamStatus("");
    setIsSavingTeam(false);

    setStationForm(null);
    setStationFormDirty(false);
    setStationFormError("");
    setStationFormStatus("");
    setIsSavingStation(false);
    setCreateStationForm(buildCreateStationFormState(""));
    setCreateStationError("");
    setCreateStationStatus("");
    setIsCreatingStation(false);

    setPromotions([]);
    setPromotionsLoading(false);
    setPromotionsError("");
    setPromotionStatus("");
    setPromotionForm(buildPromotionFormState());
    setIsSavingPromotion(false);

    setAuthError(nextAuthError);
  };

  const parseIdList = (value) => {
    return String(value || "")
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const formatIdList = (value) => {
    if (!Array.isArray(value)) return "";
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  };

  const regionDirectoryById = useMemo(() => {
    const map = new Map();
    directoryRegions.forEach((item) => {
      const key = String(item?.id || item?._id || "").trim();
      if (!key) return;
      map.set(key, item);
    });
    return map;
  }, [directoryRegions]);

  const cityDirectoryById = useMemo(() => {
    const map = new Map();
    directoryCities.forEach((item) => {
      const key = String(item?.id || item?._id || "").trim();
      if (!key) return;
      map.set(key, item);
    });
    return map;
  }, [directoryCities]);

  const regionDirectoryByName = useMemo(() => {
    return buildDirectoryNameMap(directoryRegions);
  }, [directoryRegions]);

  const cityDirectoryByName = useMemo(() => {
    return buildDirectoryNameMap(directoryCities);
  }, [directoryCities]);

  const woredaDirectoryById = useMemo(() => {
    const map = new Map();
    directoryWoredas.forEach((item) => {
      const key = String(item?.id || item?._id || "").trim();
      if (!key) return;
      map.set(key, item);
    });
    return map;
  }, [directoryWoredas]);

  const stationGeo = useMemo(() => {
    return stations.map((item) => {
      const fallback = deriveCityRegion(item);
      const cityIdValue = String(item?.cityId || "").trim();
      const regionIdValue = String(item?.regionId || "").trim();
      const woredaIdValue = String(item?.woredaId || "").trim();
      const explicitCityRecord = cityDirectoryById.get(cityIdValue) || null;
      const explicitRegionRecord = regionDirectoryById.get(regionIdValue) || null;
      const namedRegionMatches = getDirectoryMatchesByName(regionDirectoryByName, fallback.regionLabel);
      let regionRecord = explicitRegionRecord || (namedRegionMatches.length === 1 ? namedRegionMatches[0] : null);

      const namedCityMatches = getDirectoryMatchesByName(cityDirectoryByName, fallback.cityLabel);
      let cityRecord = explicitCityRecord;
      if (!cityRecord && namedCityMatches.length) {
        const scopedMatches = regionRecord
          ? namedCityMatches.filter(
              (candidate) =>
                String(candidate?.regionId || "").trim() ===
                String(regionRecord?.id || regionRecord?._id || "").trim()
            )
          : namedCityMatches;

        if (scopedMatches.length === 1) {
          cityRecord = scopedMatches[0];
        } else if (!regionRecord && namedCityMatches.length === 1) {
          cityRecord = namedCityMatches[0];
        }
      }

      if (!cityRecord) {
        const scopedRegionId = String(regionRecord?.id || regionRecord?._id || "").trim();
        cityRecord =
          findDirectoryMentionInText(item?.name, directoryCities, { regionId: scopedRegionId }) ||
          findDirectoryMentionInText(item?.subcity, directoryCities, { regionId: scopedRegionId }) ||
          findDirectoryMentionInText(item?.woreda, directoryCities, { regionId: scopedRegionId }) ||
          findDirectoryMentionInText(item?.address, directoryCities, { regionId: scopedRegionId }) ||
          null;
      }

      const cityRegionRecord = regionDirectoryById.get(String(cityRecord?.regionId || "").trim()) || null;
      if (!regionRecord || (cityRegionRecord && String(cityRegionRecord?.id || cityRegionRecord?._id || "") !== String(regionRecord?.id || regionRecord?._id || ""))) {
        regionRecord = cityRegionRecord || regionRecord;
      }

      const woredaRecord = woredaDirectoryById.get(woredaIdValue) || null;
      const cityLabel = cityRecord?.name || fallback.cityLabel;
      const regionLabel = regionRecord?.name || fallback.regionLabel;
      const woredaLabel = woredaRecord?.name || String(item?.woreda || "").trim() || "Unspecified woreda";

      return {
        ...item,
        regionLabel,
        cityLabel,
        woredaLabel,
        regionKey: regionRecord?.id || regionIdValue || `region:${normalizeKey(regionLabel) || "unspecified"}`,
        cityLabelKey: cityRecord?.id || cityIdValue || `city:${normalizeKey(cityLabel) || "unspecified"}`,
        woredaKey: woredaRecord?.id || woredaIdValue || `woreda:${normalizeKey(woredaLabel) || "unspecified"}`,
        regionRecord,
        cityRecord,
        woredaRecord
      };
    });
  }, [
    cityDirectoryById,
    cityDirectoryByName,
    regionDirectoryById,
    regionDirectoryByName,
    stations,
    woredaDirectoryById
  ]);

  const stationGeoById = useMemo(() => {
    const map = new Map();
    stationGeo.forEach((item) => {
      map.set(String(item.id || item._id || ""), item);
    });
    return map;
  }, [stationGeo]);

  const stationCountByRegion = useMemo(() => {
    const map = new Map();
    stationGeo.forEach((item) => {
      const key = String(item.regionKey || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [stationGeo]);

  const stationCountByCity = useMemo(() => {
    const map = new Map();
    stationGeo.forEach((item) => {
      const key = String(item.cityLabelKey || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [stationGeo]);

  const stationCountByWoreda = useMemo(() => {
    const map = new Map();
    stationGeo.forEach((item) => {
      const key = String(item.woredaKey || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [stationGeo]);

  const cityCenterById = useMemo(() => {
    const groupedStations = new Map();

    stationGeo.forEach((item) => {
      const key = String(item.cityLabelKey || "").trim();
      const latitude = readOptionalFiniteNumber(item?.latitude);
      const longitude = readOptionalFiniteNumber(item?.longitude);
      if (!key || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const existing = groupedStations.get(key) || [];
      existing.push({ latitude, longitude });
      groupedStations.set(key, existing);
    });

    const centers = new Map();
    groupedStations.forEach((items, key) => {
      const centroid = buildCoordinateCentroid(items);
      if (!centroid) return;
      centers.set(key, centroid);
    });

    return centers;
  }, [stationGeo]);

  const selectedCityRecord = useMemo(() => {
    if (cityFilter === "all") return null;
    return (
      directoryCities.find(
        (item) => String(item.id || item._id || "").trim() === String(cityFilter || "").trim()
      ) || null
    );
  }, [cityFilter, directoryCities]);

  const selectedCityCenter = useMemo(() => {
    if (!selectedCityRecord) return null;
    const recordLatitude = readOptionalFiniteNumber(selectedCityRecord.latitude);
    const recordLongitude = readOptionalFiniteNumber(selectedCityRecord.longitude);
    if (Number.isFinite(recordLatitude) && Number.isFinite(recordLongitude)) {
      return {
        latitude: recordLatitude,
        longitude: recordLongitude,
        sampleSize: Number(selectedCityRecord.stationCount || 0)
      };
    }
    const cityId = String(selectedCityRecord.id || selectedCityRecord._id || "").trim();
    return cityCenterById.get(cityId) || null;
  }, [cityCenterById, selectedCityRecord]);

  const regionOptions = useMemo(() => {
    if (directoryRegions.length) {
      const options = directoryRegions
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .map((item) => {
          const key = String(item.id || item._id || "").trim();
          return {
            key,
            label: item.name || key,
            count: isSuperAdmin ? undefined : stationCountByRegion.get(key) || 0
          };
        });

      return [{ key: "all", label: "All regions", count: isSuperAdmin ? undefined : options.length }, ...options];
    }

    const map = new Map();
    stationGeo.forEach(({ regionKey, regionLabel }) => {
      if (!regionKey) return;
      if (!map.has(regionKey)) {
        map.set(regionKey, { key: regionKey, label: regionLabel, count: stationCountByRegion.get(regionKey) || 0 });
      }
    });
    const options = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: "all", label: "All regions", count: options.length }, ...options];
  }, [directoryRegions, isSuperAdmin, stationCountByRegion, stationGeo]);

  const regionScopedStations = useMemo(() => {
    return stationGeo.filter((item) => {
      return (
        regionFilter === "all" ||
        item.regionKey === regionFilter ||
        (!item.regionKey && cityFilter !== "all" && item.cityLabelKey === cityFilter)
      );
    });
  }, [cityFilter, regionFilter, stationGeo]);

  const cityOptions = useMemo(() => {
    if (directoryCities.length) {
      const options = directoryCities
        .filter((item) => {
          if (regionFilter === "all") return true;
          return String(item.regionId || "").trim() === String(regionFilter || "").trim();
        })
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .map((item) => {
          const key = String(item.id || item._id || "").trim();
          return {
            key,
            label: item.name || key,
            count: isSuperAdmin ? undefined : stationCountByCity.get(key) || 0,
            regionId: String(item.regionId || "").trim()
          };
        });

      return [
        {
          key: "all",
          label: regionFilter === "all" ? "All cities" : "All cities in region",
          count: isSuperAdmin ? undefined : options.length
        },
        ...options
      ];
    }

    const map = new Map();
    stationGeo
      .filter((stationItem) => {
        if (regionFilter === "all") return true;
        if (stationItem.regionKey === regionFilter) return true;
        // Allow stations with no region to still show up under any region so their city can be selected.
        return !stationItem.regionKey;
      })
      .forEach(({ cityLabelKey, cityLabel }) => {
        if (!cityLabelKey) return;
        const existing = map.get(cityLabelKey) || { key: cityLabelKey, label: cityLabel, count: 0 };
        map.set(cityLabelKey, { ...existing, count: existing.count + 1 });
    });
    const options = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: "all", label: "All cities", count: options.length }, ...options];
  }, [directoryCities, isSuperAdmin, regionFilter, regionScopedStations.length, stationCountByCity, stationGeo]);

  const cityScopedStations = useMemo(() => {
    return regionScopedStations.filter((item) => cityFilter === "all" || item.cityLabelKey === cityFilter);
  }, [cityFilter, regionScopedStations]);

  const woredaOptions = useMemo(() => {
    if (directoryWoredas.length) {
      const options = directoryWoredas
        .filter((item) => {
          const itemRegionId = String(item.regionId || "").trim();
          const itemCityId = String(item.cityId || "").trim();
          const matchesRegion = regionFilter === "all" || itemRegionId === String(regionFilter || "").trim();
          const matchesCity = cityFilter === "all" || itemCityId === String(cityFilter || "").trim();
          return matchesRegion && matchesCity;
        })
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .map((item) => {
          const key = String(item.id || item._id || "").trim();
          return {
            key,
            label: item.name || key,
            count: isSuperAdmin ? undefined : stationCountByWoreda.get(key) || 0
          };
        });

      return [
        {
          key: "all",
          label: cityFilter === "all" ? "All woredas" : "All woredas in city",
          count: isSuperAdmin ? undefined : options.length
        },
        ...options
      ];
    }

    const map = new Map();
    cityScopedStations.forEach(({ woredaKey, woredaLabel }) => {
      if (!woredaKey) return;
      const existing = map.get(woredaKey) || { key: woredaKey, label: woredaLabel, count: 0 };
      map.set(woredaKey, { ...existing, count: existing.count + 1 });
    });
    const options = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: "all", label: "All woredas", count: options.length }, ...options];
  }, [cityFilter, cityScopedStations, directoryWoredas, isSuperAdmin, regionFilter, stationCountByWoreda]);

  const filteredStations = useMemo(() => {
    const normalizedSearch = normalizeKey(isSuperAdmin ? deferredSuperAdminStationSearch : "");

    return cityScopedStations.filter((item) => {
      if (woredaFilter !== "all" && item.woredaKey !== woredaFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableFields = [
        item?.name,
        item?.address,
        item?.contact,
        item?.landmark,
        item?.subcity,
        item?.woreda,
        item?.woredaLabel,
        item?.cityLabel,
        item?.regionLabel
      ];

      return searchableFields.some((value) => normalizeKey(value).includes(normalizedSearch));
    });
  }, [cityScopedStations, deferredSuperAdminStationSearch, isSuperAdmin, woredaFilter]);

  const visibleStations = useMemo(() => {
    if (!isSuperAdmin) return filteredStations;

    const startIndex = Math.max(0, (Number(superAdminStationPage || 1) - 1) * SUPER_ADMIN_DIRECTORY_PAGE_LIMIT);
    return filteredStations.slice(startIndex, startIndex + SUPER_ADMIN_DIRECTORY_PAGE_LIMIT);
  }, [filteredStations, isSuperAdmin, superAdminStationPage]);

  const cityStationGroups = useMemo(() => {
    const groups = [];
    const knownCityKeys = new Set();

    if (directoryCities.length) {
      const scopedCities = directoryCities
        .filter((item) => {
          const cityIdValue = String(item.id || item._id || "").trim();
          const regionIdValue = String(item.regionId || "").trim();
          const matchesRegion = regionFilter === "all" || regionIdValue === String(regionFilter || "").trim();
          const matchesCity = cityFilter === "all" || cityIdValue === String(cityFilter || "").trim();
          return matchesRegion && matchesCity;
        })
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      scopedCities.forEach((cityItem) => {
        const cityIdValue = String(cityItem.id || cityItem._id || "").trim();
        const regionIdValue = String(cityItem.regionId || "").trim();
        const regionRecord = regionDirectoryById.get(regionIdValue) || null;
        const cityStations = filteredStations
          .filter((stationItem) => String(stationItem.cityLabelKey || "").trim() === cityIdValue)
          .slice()
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        knownCityKeys.add(cityIdValue);
        groups.push({
          key: cityIdValue || `city:${normalizeKey(cityItem.name) || "unspecified"}`,
          cityLabel: cityItem.name || "Unspecified city",
          regionLabel: regionRecord?.name || "Unspecified region",
          regionKey:
            regionRecord?.id ||
            regionIdValue ||
            `region:${normalizeKey(regionRecord?.name || cityItem.name) || "unspecified"}`,
          stationCount: cityStations.length,
          stations: cityStations
        });
      });
    }

    const fallbackGroups = new Map();
    filteredStations.forEach((item) => {
      const cityGroupKey = String(
        item.cityLabelKey || `city:${normalizeKey(item.cityLabel) || "unspecified"}`
      ).trim();
      if (!cityGroupKey || knownCityKeys.has(cityGroupKey)) return;

      if (!fallbackGroups.has(cityGroupKey)) {
        fallbackGroups.set(cityGroupKey, {
          key: cityGroupKey,
          cityLabel: item.cityLabel || "Unspecified city",
          regionLabel: item.regionLabel || "Unspecified region",
          regionKey: String(
            item.regionKey || `region:${normalizeKey(item.regionLabel) || "unspecified"}`
          ).trim(),
          stationCount: 0,
          stations: []
        });
      }

      const nextGroup = fallbackGroups.get(cityGroupKey);
      nextGroup.stations.push(item);
      nextGroup.stationCount += 1;
    });

    return [
      ...groups,
      ...Array.from(fallbackGroups.values())
        .map((group) => ({
          ...group,
          stations: group.stations
            .slice()
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        }))
        .sort((a, b) => String(a.cityLabel || "").localeCompare(String(b.cityLabel || "")))
    ];
  }, [cityFilter, directoryCities, filteredStations, regionDirectoryById, regionFilter]);

  const regionStationGroups = useMemo(() => {
    const finalizeRegionGroup = (group) => {
      const cityGroups = (group.cityGroups || [])
        .slice()
        .sort((a, b) => String(a.cityLabel || "").localeCompare(String(b.cityLabel || "")));

      return {
        ...group,
        cityGroups,
        cityCount: cityGroups.length,
        stationCount: cityGroups.reduce(
          (total, cityGroup) => total + Number(cityGroup.stationCount || cityGroup.stations?.length || 0),
          0
        )
      };
    };

    if (directoryRegions.length) {
      const scopedRegions = directoryRegions
        .filter((item) => {
          const regionIdValue = String(item.id || item._id || "").trim();
          return regionFilter === "all" || regionIdValue === String(regionFilter || "").trim();
        })
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

      const knownRegionKeys = new Set();
      const regionGroups = scopedRegions.map((regionItem) => {
        const regionKey =
          String(regionItem.id || regionItem._id || "").trim() ||
          `region:${normalizeKey(regionItem.name) || "unspecified"}`;
        knownRegionKeys.add(regionKey);
        return finalizeRegionGroup({
          key: regionKey,
          regionLabel: regionItem.name || "Unspecified region",
          cityGroups: cityStationGroups.filter(
            (cityGroup) => String(cityGroup.regionKey || "").trim() === regionKey
          )
        });
      });

      const fallbackRegionMap = new Map();
      cityStationGroups.forEach((cityGroup) => {
        const regionKey = String(
          cityGroup.regionKey || `region:${normalizeKey(cityGroup.regionLabel) || "unspecified"}`
        ).trim();
        if (!regionKey || knownRegionKeys.has(regionKey)) return;

        if (!fallbackRegionMap.has(regionKey)) {
          fallbackRegionMap.set(regionKey, {
            key: regionKey,
            regionLabel: cityGroup.regionLabel || "Unspecified region",
            cityGroups: []
          });
        }

        fallbackRegionMap.get(regionKey).cityGroups.push(cityGroup);
      });

      const allRegionGroups = [
        ...regionGroups,
        ...Array.from(fallbackRegionMap.values())
          .map((group) => finalizeRegionGroup(group))
          .sort((a, b) => String(a.regionLabel || "").localeCompare(String(b.regionLabel || "")))
      ];

      if (regionFilter === "all" && (cityFilter !== "all" || woredaFilter !== "all")) {
        return allRegionGroups.filter((group) => group.cityCount > 0);
      }

      return allRegionGroups;
    }

    const groups = new Map();
    cityStationGroups.forEach((cityGroup) => {
      const regionKey = String(
        cityGroup.regionKey || `region:${normalizeKey(cityGroup.regionLabel) || "unspecified"}`
      ).trim();
      if (!groups.has(regionKey)) {
        groups.set(regionKey, {
          key: regionKey,
          regionLabel: cityGroup.regionLabel || "Unspecified region",
          cityGroups: []
        });
      }
      groups.get(regionKey).cityGroups.push(cityGroup);
    });

    return Array.from(groups.values())
      .map((group) => finalizeRegionGroup(group))
      .sort((a, b) => String(a.regionLabel || "").localeCompare(String(b.regionLabel || "")));
  }, [cityFilter, cityStationGroups, directoryRegions, regionFilter, woredaFilter]);

  const createStationRegionOptions = useMemo(() => {
    return directoryRegions
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [directoryRegions]);

  const createStationCityOptions = useMemo(() => {
    return directoryCities
      .filter((item) => {
        if (!createStationForm.regionId) return true;
        return String(item.regionId || "") === String(createStationForm.regionId || "");
      })
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [createStationForm.regionId, directoryCities]);

  const createStationWoredaOptions = useMemo(() => {
    return directoryWoredas
      .filter((item) => {
        if (!createStationForm.cityId) return false;
        return String(item.cityId || "") === String(createStationForm.cityId || "");
      })
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [createStationForm.cityId, directoryWoredas]);

  const selectedStationGeo = useMemo(() => {
    return stationGeoById.get(String(stationId)) || null;
  }, [stationGeoById, stationId]);

  const activePromotionCount = useMemo(() => {
    return promotions.filter((item) => Boolean(item?.isActive)).length;
  }, [promotions]);

  const blockedTeamCount = useMemo(() => {
    return teamUsers.filter((item) => Boolean(item?.isBlocked)).length;
  }, [teamUsers]);

  const selectedTeamUser = useMemo(() => {
    return teamUsers.find((item) => String(item?.id || "") === String(editTeamUserId || "")) || null;
  }, [editTeamUserId, teamUsers]);

  const fuelHealth = useMemo(() => {
    const gasoline = asFiniteNumber(station?.fuelInventory?.gasolineLiters, 0);
    const diesel = asFiniteNumber(station?.fuelInventory?.dieselLiters, 0);
    const other = asFiniteNumber(station?.fuelInventory?.otherLiters, 0);
    return {
      gasoline,
      diesel,
      other,
      total: gasoline + diesel + other
    };
  }, [
    station?.fuelInventory?.dieselLiters,
    station?.fuelInventory?.gasolineLiters,
    station?.fuelInventory?.otherLiters
  ]);

  const operationalAlerts = useMemo(() => {
    const alerts = [];
    const waitingCount = Number(queueSnapshot?.waitingCount || 0);
    const pendingCount = Number(queueSnapshot?.pendingCount || 0);
    const paymentDetails = station?.paymentDetails || {};

    if (!station?.isActive) {
      alerts.push({
        title: "Station is inactive",
        detail: "Drivers may not be able to queue or trust station availability until you reopen it.",
        pill: "Settings",
        section: "settings",
        warn: true
      });
    }

    if (fuelHealth.gasoline > 0 && fuelHealth.gasoline < 1000) {
      alerts.push({
        title: "Gasoline stock is low",
        detail: `${Math.round(fuelHealth.gasoline)} liters remaining. Update stock or prepare replenishment.`,
        pill: "Fuel",
        section: "inventory",
        warn: true
      });
    }

    if (fuelHealth.diesel > 0 && fuelHealth.diesel < 1000) {
      alerts.push({
        title: "Diesel stock is low",
        detail: `${Math.round(fuelHealth.diesel)} liters remaining. Review delivery timing now.`,
        pill: "Fuel",
        section: "inventory",
        warn: true
      });
    }

    if (waitingCount >= 15) {
      alerts.push({
        title: "Queue pressure is high",
        detail: `${waitingCount} drivers are waiting. Review lane flow and call the next ticket promptly.`,
        pill: "Queue",
        section: "queue",
        warn: true
      });
    }

    if (pendingCount > 0) {
      alerts.push({
        title: "Pending payments need follow-up",
        detail: `${pendingCount} transactions are still pending. Review cashier and payment confirmations.`,
        pill: "Payments",
        section: "cashflow",
        warn: false
      });
    }

    if (!teamUsers.length) {
      alerts.push({
        title: "No station staff accounts found",
        detail: "Create staff access for attendants and supervisors so activity stays traceable.",
        pill: "Team",
        section: "staff",
        warn: false
      });
    }

    if (!paymentDetails.providerName && !paymentDetails.phoneNumber && !paymentDetails.accountNumber) {
      alerts.push({
        title: "Customer payment details are incomplete",
        detail: "Add wallet or bank details so customers see a verified payment method in the app.",
        pill: "Profile",
        section: "settings",
        warn: false
      });
    }

    if (!alerts.length) {
      alerts.push({
        title: "Operations look stable",
        detail: "No urgent station issues were detected from the current live data.",
        pill: "Stable",
        section: "overview",
        warn: false
      });
    }

    return alerts.slice(0, 5);
  }, [
    fuelHealth.diesel,
    fuelHealth.gasoline,
    queueSnapshot?.pendingCount,
    queueSnapshot?.waitingCount,
    station?.isActive,
    station?.paymentDetails,
    teamUsers.length
  ]);

  const visibleSections = useMemo(() => {
    if (isSuperAdmin) return sections;
    if (isStationExec) return sections.filter((section) => section.id !== "all_stations");
    return sections.filter((section) => ["overview", "queue", "inventory"].includes(section.id));
  }, [isSuperAdmin, isStationExec]);

  useEffect(() => {
    if (visibleSections.some((section) => section.id === active)) return;
    setActive("overview");
  }, [active, visibleSections]);

  useEffect(() => {
    const handleAuthExpired = (event) => {
      const nextMessage = String(event?.detail?.message || AUTH_EXPIRED_MESSAGE).trim() || AUTH_EXPIRED_MESSAGE;
      resetConsoleState(nextMessage);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    if (!session?.tokens?.accessToken || !canManageStations) {
      setDirectoryRegions([]);
      setDirectoryCities([]);
      setDirectoryWoredas([]);
      setLocationDirectoryMessage("");
      return;
    }

    let isActive = true;

    const loadLocationDirectory = async () => {
      try {
        setLocationDirectoryMessage("");
        const [regionsData, citiesData, woredasData] = await Promise.all([
          listAdminRegions(),
          listAdminCities(),
          listAdminWoredas()
        ]);
        if (!isActive) return;
        const nextRegions = regionsData?.regions || [];
        const nextCities = citiesData?.cities || [];
        const nextWoredas = woredasData?.woredas || [];
        setDirectoryRegions(nextRegions);
        setDirectoryCities(nextCities);
        setDirectoryWoredas(nextWoredas);
        persistLocationDirectory({
          regions: nextRegions,
          cities: nextCities,
          woredas: nextWoredas
        });
        if (!nextRegions.length || !nextCities.length) {
          setLocationDirectoryMessage(
            "Backend location directory is empty. Run the Ethiopia location seed on the backend, then refresh this page."
          );
        }
      } catch (error) {
        if (!isActive) return;
        setLocationDirectoryMessage(
          error?.message
            ? `${error.message} Region and city directory could not be refreshed from the backend.`
            : "Region and city directory could not be refreshed from the backend."
        );
      }
    };

    loadLocationDirectory();
    return () => {
      isActive = false;
    };
  }, [canManageStations, session?.tokens?.accessToken]);

  useEffect(() => {
    if (!createStationForm.cityId) return;
    const selectedCity = directoryCities.find(
      (item) => String(item.id || item._id || "") === String(createStationForm.cityId || "")
    );
    if (!selectedCity) return;

    if (
      !createStationForm.regionId ||
      String(selectedCity.regionId || "") !== String(createStationForm.regionId || "")
    ) {
      setCreateStationForm((prev) => ({ ...prev, cityId: "", woredaId: "" }));
    }
  }, [createStationForm.cityId, createStationForm.regionId, directoryCities]);

  useEffect(() => {
    if (!createStationForm.woredaId) return;
    const selectedWoreda = directoryWoredas.find(
      (item) => String(item.id || item._id || "") === String(createStationForm.woredaId || "")
    );
    if (!selectedWoreda) return;

    if (
      !createStationForm.cityId ||
      String(selectedWoreda.cityId || "") !== String(createStationForm.cityId || "")
    ) {
      setCreateStationForm((prev) => ({ ...prev, woredaId: "" }));
    }
  }, [createStationForm.cityId, createStationForm.woredaId, directoryWoredas]);

  useEffect(() => {
    const validCityKeys = new Set(cityOptions.map((item) => item.key));
    if (!validCityKeys.has(cityFilter)) {
      setCityFilter("all");
    }
  }, [cityFilter, cityOptions]);

  useEffect(() => {
    const validWoredaKeys = new Set(woredaOptions.map((item) => item.key));
    if (!validWoredaKeys.has(woredaFilter)) {
      setWoredaFilter("all");
    }
  }, [woredaFilter, woredaOptions]);

  useEffect(() => {
    if (!isSuperAdmin || cityFilter === "all") {
      setLiveCityStations([]);
      setLiveCityStationsLoading(false);
      setLiveCityStationsError("");
      return;
    }

    let isActive = true;

    const loadLiveCityStations = async () => {
      try {
        setLiveCityStationsLoading(true);
        setLiveCityStationsError("");

        const cityId = String(selectedCityRecord?.id || selectedCityRecord?._id || cityFilter || "").trim();
        const customerCityData = cityId
          ? await listPublicMapStations({
              cityId,
              limit: 220
            })
          : { stations: [] };
        if (!isActive) return;

        const customerCityStations = Array.isArray(customerCityData?.stations)
          ? customerCityData.stations
          : [];
        const fallbackCenter = buildCoordinateCentroid(customerCityStations);
        const liveSearchCenter = selectedCityCenter || fallbackCenter;

        if (!liveSearchCenter) {
          setLiveCityStations(customerCityStations);
          setLiveCityStationsError(
            customerCityStations.length
              ? ""
              : selectedCityRecord
                ? `No city-center estimate is available for ${selectedCityRecord.name} yet, and no customer city stations were found for it.`
                : "No customer city stations were found."
          );
          return;
        }

        const nearbyRadius = buildLiveCitySearchRadiusMeters(liveSearchCenter, customerCityStations);
        let nearbyStations = [];

        try {
          const nearbyData = await listNearbyFuelStations({
            lat: liveSearchCenter.latitude,
            lon: liveSearchCenter.longitude,
            radius: nearbyRadius
          });
          if (!isActive) return;
          nearbyStations = Array.isArray(nearbyData?.stations) ? nearbyData.stations : [];
        } catch (nearbyError) {
          if (!customerCityStations.length) {
            throw nearbyError;
          }
        }

        const mergedStations = mergeLiveStationLists(customerCityStations, nearbyStations);
        setLiveCityStations(mergedStations);
        setLiveCityStationsError(
          mergedStations.length
            ? ""
            : `No customer-visible stations were found for ${selectedCityRecord?.name || "this city"} yet.`
        );
      } catch (error) {
        if (!isActive) return;
        setLiveCityStations([]);
        setLiveCityStationsError(error?.message || "Failed to load customer-visible stations for this city.");
      } finally {
        if (isActive) {
          setLiveCityStationsLoading(false);
        }
      }
    };

    loadLiveCityStations();
    return () => {
      isActive = false;
    };
  }, [cityFilter, isSuperAdmin, selectedCityCenter, selectedCityRecord]);

  useEffect(() => {
    if (!visibleStations.length) {
      setStationId("");
      return;
    }
    const hasCurrent = visibleStations.some((item) => String(item.id) === String(stationId));
    if (!stationId || !hasCurrent) {
      setStationId(String(visibleStations[0].id));
    }
  }, [stationId, visibleStations]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const totalPages = Math.max(1, Math.ceil(filteredStations.length / SUPER_ADMIN_DIRECTORY_PAGE_LIMIT));
    if (superAdminStationPage > totalPages) {
      setSuperAdminStationPage(totalPages);
    }
  }, [filteredStations.length, isSuperAdmin, superAdminStationPage]);

  const sectionTitle = useMemo(() => {
    const section = sections.find((item) => item.id === active);
    return section ? section.label : "Overview";
  }, [active]);

  const derivedMetrics = useMemo(() => {
    const waitingCount = Number(queueSnapshot?.waitingCount || 0);
    const estimatedWait = buildEstimate(waitingCount);
    const fuelStatus = station?.fuelStatus || queueSnapshot?.fuelStatus || "partial";
    return [
      { label: "Avg wait time", value: formatMinutes(estimatedWait) },
      { label: "Active queue", value: `${waitingCount} drivers` },
      {
        label: "Fuel status",
        value: formatFuelStatusLabel(fuelStatus)
      },
      { label: "Pending payments", value: `${Number(queueSnapshot?.pendingCount || 0)}` }
    ];
  }, [queueSnapshot, station]);

  const todayKey = localDateKey();
  const ceoTasksStorageKey = stationId ? `ff_owner_ceo_tasks_v1:${stationId}:${todayKey}` : "";

  const ceoTaskProgress = useMemo(() => {
    const total = CEO_TASKS.length;
    const completed = CEO_TASKS.reduce((count, task) => count + (ceoTasks?.[task.id] ? 1 : 0), 0);
    return { completed, total };
  }, [ceoTasks]);

  useEffect(() => {
    if (!ceoTasksStorageKey) return;
    setCeoTasks(readStorageJSON(ceoTasksStorageKey, {}));
  }, [ceoTasksStorageKey]);

  const toggleCeoTask = (taskId) => {
    if (!ceoTasksStorageKey) return;
    setCeoTasks((prev) => {
      const next = { ...(prev || {}), [taskId]: !Boolean(prev?.[taskId]) };
      try {
        localStorage.setItem(ceoTasksStorageKey, JSON.stringify(next));
      } catch {
        // Ignore storage failures (private mode, etc.)
      }
      return next;
    });
  };

  const filteredAdminUsers = useMemo(() => {
    const trimmedSearch = userSearch.trim().toLowerCase();
    let list = Array.isArray(adminUsers) ? adminUsers : [];

    if (roleFilter !== "all") {
      list = list.filter((user) => String(user.role || "") === roleFilter);
    }

    if (limitToCurrentStation && stationId) {
      list = list.filter((user) => Array.isArray(user.stationIds) && user.stationIds.includes(stationId));
    }

    if (trimmedSearch) {
      list = list.filter((user) => {
        const name = String(user.name || "").toLowerCase();
        const email = String(user.email || "").toLowerCase();
        const phone = String(user.phone || "").toLowerCase();
        return name.includes(trimmedSearch) || email.includes(trimmedSearch) || phone.includes(trimmedSearch);
      });
    }

    return list;
  }, [adminUsers, limitToCurrentStation, roleFilter, stationId, userSearch]);

  const allStationsSorted = useMemo(() => {
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base"
    });

    const getStationSortParts = (item) => [
      String(item?.region?.name || "").trim(),
      String(item?.city?.name || item?.subcity || "").trim(),
      String(item?.woredaDirectory?.name || item?.woreda || "").trim(),
      String(item?.name || "").trim(),
      String(item?.address || "").trim()
    ];

    return (Array.isArray(allStationsList) ? allStationsList : [])
      .slice()
      .sort((left, right) => {
        const leftParts = getStationSortParts(left);
        const rightParts = getStationSortParts(right);

        for (let index = 0; index < leftParts.length; index += 1) {
          const comparison = collator.compare(leftParts[index], rightParts[index]);
          if (comparison !== 0) return comparison;
        }

        return collator.compare(String(left?.id || ""), String(right?.id || ""));
      });
  }, [allStationsList]);

  const openSection = (nextSection) => {
    startTransition(() => {
      setActive(nextSection);
    });
  };

  const selectStation = (nextStationId) => {
    startTransition(() => {
      setStationId(String(nextStationId || ""));
    });
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken || !isSuperAdmin) return;

    let isActive = true;

    const loadSuperAdminStations = async () => {
      try {
        setSuperAdminStationDirectoryLoading(true);
        setSuperAdminStationDirectoryError("");
        setAllStationsListLoading(true);
        setAllStationsListError("");
        setStatusMessage("");

        const data = await listAdminStations();
        if (!isActive) return;

        const list = Array.isArray(data?.stations) ? data.stations : [];
        setStations(list);
        setAllStationsList(list);
        setSuperAdminStationDirectoryMeta({
          total: Number(data?.total || list.length || 0),
          page: Number(data?.page || 1),
          limit: Number(data?.limit || list.length || SUPER_ADMIN_DIRECTORY_PAGE_LIMIT),
          totalPages: Math.max(1, Number(data?.totalPages || 1)),
          hasNextPage: Boolean(data?.hasNextPage),
          hasPreviousPage: Boolean(data?.hasPreviousPage)
        });

        if (!list.length) {
          setStationId("");
          return;
        }

        const hasCurrent = list.some((item) => String(item.id || item._id || "") === String(stationId));
        if (!stationId || !hasCurrent) {
          setStationId(String(list[0].id || list[0]._id || ""));
        }
      } catch (error) {
        if (!isActive) return;
        setStations([]);
        setAllStationsList([]);
        setStationId("");
        setSuperAdminStationDirectoryMeta({
          total: 0,
          page: 1,
          limit: SUPER_ADMIN_DIRECTORY_PAGE_LIMIT,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false
        });
        setSuperAdminStationDirectoryError(
          error?.message || "Failed to load the Ethiopia station directory."
        );
      } finally {
        if (isActive) {
          setSuperAdminStationDirectoryLoading(false);
          setAllStationsListLoading(false);
        }
      }
    };

    loadSuperAdminStations();
    return () => {
      isActive = false;
    };
  }, [isSuperAdmin, session?.tokens?.accessToken, superAdminStationDirectoryRefreshKey]);

  useEffect(() => {
    if (
      !session?.tokens?.accessToken ||
      !isSuperAdmin ||
      active !== "all_stations" ||
      allStationsList.length
    ) {
      return;
    }

    let isActive = true;

    const loadAllStations = async () => {
      try {
        setAllStationsListLoading(true);
        setAllStationsListError("");

        const data = await listAdminStations();
        if (!isActive) return;

        setAllStationsList(Array.isArray(data?.stations) ? data.stations : []);
      } catch (error) {
        if (!isActive) return;
        setAllStationsList([]);
        setAllStationsListError(error?.message || "Failed to load the full Ethiopia station list.");
      } finally {
        if (isActive) {
          setAllStationsListLoading(false);
        }
      }
    };

    loadAllStations();
    return () => {
      isActive = false;
    };
  }, [active, allStationsList.length, isSuperAdmin, session?.tokens?.accessToken]);

  useEffect(() => {
    if (!session?.tokens?.accessToken || isSuperAdmin) return;

    const loadStations = async () => {
      setIsLoading(true);
      setStatusMessage("");
      try {
        const data = await listOwnerStations();
        const list = data?.stations || [];
        setStations(list);

        if (!list.length) {
          setStationId("");
          if (actorRole === "station_manager") {
            setStatusMessage("No assigned stations were found for this station manager account.");
          }
          return;
        }

        const firstId = String(list[0].id || list[0]._id || "");
        const hasCurrent = list.some((item) => String(item.id || item._id || "") === String(stationId));
        if (!stationId || !hasCurrent) {
          setStationId(firstId);
        }
      } catch (error) {
        setStatusMessage(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadStations();
  }, [actorRole, isSuperAdmin, session?.tokens?.accessToken]);

  useEffect(() => {
    if (!session?.tokens?.accessToken || !stationId) return;
    let isActive = true;

    const loadStationData = async () => {
      setIsLoading(true);
      try {
        const [stationData, queueData] = await Promise.all([
          getOwnerStation(stationId),
          getStationQueue(stationId)
        ]);
        if (!isActive) return;
        const resolvedStation = stationData?.station || stationData;
        setStation(resolvedStation);
        setQueueSnapshot(queueData);
      } catch (error) {
        if (!isActive) return;
        setStatusMessage(error.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    loadStationData();
    const interval = setInterval(loadStationData, 30000);
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [session, stationId]);

  useEffect(() => {
    if (!station?.fuelInventory) return;
    setFuelForm({
      gasolineLiters: station.fuelInventory.gasolineLiters ?? "",
      dieselLiters: station.fuelInventory.dieselLiters ?? "",
      otherLiters: station.fuelInventory.otherLiters ?? ""
    });
  }, [station]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    setCreateUserForm((prev) => {
      if (!prev.assignToSelectedStation) return prev;

      const next = { ...prev };
      if (stationId) next.stationIds = String(stationId);
      if (!next.organizationId && station?.organizationId) {
        next.organizationId = String(station.organizationId);
      }
      return next;
    });
  }, [isSuperAdmin, stationId, station?.organizationId]);

  useEffect(() => {
    if (!canManageStations) return;

    const fallbackOrganizationId = isSuperAdmin
      ? String(createStationForm.organizationId || station?.organizationId || session?.user?.organizationId || "")
      : String(session?.user?.organizationId || station?.organizationId || "");

    setCreateStationForm((prev) => {
      if (!prev) return buildCreateStationFormState(fallbackOrganizationId);
      if (!String(prev.organizationId || "").trim()) {
        return { ...prev, organizationId: fallbackOrganizationId };
      }
      return prev;
    });
  }, [
    canManageStations,
    createStationForm.organizationId,
    isSuperAdmin,
    session?.user?.organizationId,
    station?.organizationId
  ]);

  useEffect(() => {
    // When switching stations, clear station-scoped UI state.
    setTeamUsers([]);
    setTeamError("");
    setTeamStatus("");
    setCreateTeamError("");
    setCreateTeamStatus("");
    setIsCreatingTeam(false);
    setEditTeamUserId("");
    setEditTeamForm(null);
    setEditTeamError("");
    setEditTeamStatus("");
    setIsSavingTeam(false);

    setInventorySummary(buildEmptyInventorySummary(inventoryDate));
    setInventorySummaryLoading(false);
    setInventorySummaryError("");

    setPaymentsSnapshot((prev) => ({
      total: 0,
      page: 1,
      limit: prev?.limit || 25,
      stationId: "",
      summary: { amount: 0, platformFee: 0, stationPayout: 0 },
      items: []
    }));
    setPaymentsError("");
    setPaymentsFilters((prev) => ({ ...prev, page: 1 }));

    setStationForm(null);
    setStationFormDirty(false);
    setStationFormError("");
    setStationFormStatus("");
    setIsSavingStation(false);
    setCreateStationError("");
    setCreateStationStatus("");
    setIsCreatingStation(false);
    setPromotions([]);
    setPromotionsLoading(false);
    setPromotionsError("");
    setPromotionStatus("");
    setPromotionForm(buildPromotionFormState());
    setIsSavingPromotion(false);
  }, [stationId]);

  useEffect(() => {
    if (!stationId || !station) return;

    const next = buildStationFormState(stationId, station);

    setStationForm((prev) => {
      if (!prev || prev._stationId !== stationId) return next;
      if (stationFormDirty) return prev;

      if (
        prev.name === next.name &&
        prev.address === next.address &&
        prev.contact === next.contact &&
        prev.gasolinePrice === next.gasolinePrice &&
        prev.dieselPrice === next.dieselPrice &&
        prev.otherPrice === next.otherPrice &&
        prev.chapaSubaccountId === next.chapaSubaccountId &&
        prev.paymentProviderName === next.paymentProviderName &&
        prev.paymentAccountName === next.paymentAccountName &&
        prev.paymentAccountNumber === next.paymentAccountNumber &&
        prev.paymentPhoneNumber === next.paymentPhoneNumber &&
        prev.paymentInstructions === next.paymentInstructions &&
        prev.isActive === next.isActive
      ) {
        return prev;
      }
      return { ...prev, ...next };
    });
  }, [
    station?.address,
    station?.chapaSubaccountId,
    station?.contact,
    station?.fuelPrices?.diesel,
    station?.fuelPrices?.gasoline,
    station?.fuelPrices?.other,
    station?.isActive,
    station?.name,
    station?.paymentDetails?.accountName,
    station?.paymentDetails?.accountNumber,
    station?.paymentDetails?.instructions,
    station?.paymentDetails?.phoneNumber,
    station?.paymentDetails?.providerName,
    stationFormDirty,
    stationId
  ]);

  const loadAdminDirectory = async () => {
    if (!isSuperAdmin) return;
    setAdminUsersLoading(true);
    setAdminUsersError("");

    try {
      const [usersData, orgData] = await Promise.all([listAdminUsers(), listOrganizationOptions()]);
      setAdminUsers(usersData?.users || []);
      setOrganizationOptions(orgData?.organizations || []);
    } catch (error) {
      setAdminUsersError(error.message);
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const loadOrganizationOptionsOnly = async () => {
    if (!isSuperAdmin) return;
    try {
      const orgData = await listOrganizationOptions();
      setOrganizationOptions(orgData?.organizations || []);
    } catch (_error) {
      // Keep the form usable with manual organization IDs if this request fails.
    }
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken || !isSuperAdmin) return;
    if (active !== "staff") return;
    loadAdminDirectory();
  }, [active, isSuperAdmin, session?.tokens?.accessToken]);

  useEffect(() => {
    if (!session?.tokens?.accessToken || !isSuperAdmin) return;

    const timeoutId = window.setTimeout(() => {
      void Promise.allSettled([listAdminUsers(), listOrganizationOptions()]);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [isSuperAdmin, session?.tokens?.accessToken]);

  useEffect(() => {
    if (!session?.tokens?.accessToken || !isSuperAdmin) return;
    if (active !== "settings") return;
    if (organizationOptions.length) return;
    loadOrganizationOptionsOnly();
  }, [active, isSuperAdmin, organizationOptions.length, session?.tokens?.accessToken]);

  useEffect(() => {
    if (!session?.tokens?.accessToken || !isSuperAdmin || !stationId) return;

    const timeoutId = window.setTimeout(() => {
      void Promise.allSettled([
        listStationPayments(stationId, {
          provider: "",
          status: "",
          from: "",
          to: "",
          page: 1,
          limit: 25
        }),
        listStationPromotions(stationId)
      ]);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [isSuperAdmin, session?.tokens?.accessToken, stationId]);

  const loadStationTeam = async () => {
    if (!stationId) return;
    setTeamLoading(true);
    setTeamError("");
    setTeamStatus("");
    try {
      const data = await listStationTeam(stationId);
      setTeamUsers(data?.users || []);
    } catch (error) {
      setTeamError(error.message);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken) return;
    if (active !== "staff") return;
    if (isSuperAdmin) return;
    if (!isStationExec) return;
    if (!stationId) return;
    loadStationTeam();
  }, [active, isStationExec, isSuperAdmin, session?.tokens?.accessToken, stationId]);

  const loadInventorySummary = async (dateKey = inventoryDate) => {
    if (!stationId) return;
    const range = buildLocalDayBounds(dateKey);
    setInventorySummaryLoading(true);
    setInventorySummaryError("");

    try {
      const data = await getStationFuelStockSummary(stationId, {
        date: range.dateKey,
        from: range.from,
        to: range.to
      });
      setInventoryDate(range.dateKey);
      setInventorySummary({
        ...buildEmptyInventorySummary(range.dateKey),
        ...data,
        totals: {
          ...buildEmptyInventorySummary(range.dateKey).totals,
          ...(data?.totals || {})
        },
        breakdown: Array.isArray(data?.breakdown) && data.breakdown.length
          ? data.breakdown
          : buildEmptyInventorySummary(range.dateKey).breakdown
      });
    } catch (error) {
      setInventorySummary(buildEmptyInventorySummary(range.dateKey));
      setInventorySummaryError(error.message);
    } finally {
      setInventorySummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken) return;
    if (active !== "inventory") return;
    if (!isStationExec) return;
    if (!stationId) return;
    loadInventorySummary(inventoryDate);
  }, [active, isStationExec, session?.tokens?.accessToken, stationId]);

  const loadStationPayments = async (filters) => {
    if (!stationId) return;
    setPaymentsLoading(true);
    setPaymentsError("");
    try {
      const data = await listStationPayments(stationId, filters);
      setPaymentsSnapshot({
        total: Number(data?.total || 0),
        page: Number(data?.page || 1),
        limit: Number(data?.limit || filters?.limit || 25),
        stationId: String(data?.stationId || stationId),
        summary: {
          amount: Number(data?.summary?.amount || 0),
          platformFee: Number(data?.summary?.platformFee || 0),
          stationPayout: Number(data?.summary?.stationPayout || 0)
        },
        items: Array.isArray(data?.items) ? data.items : []
      });
    } catch (error) {
      setPaymentsError(error.message);
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken) return;
    if (active !== "cashflow") return;
    if (!isStationExec) return;
    if (!stationId) return;
    loadStationPayments(paymentsFilters);
  }, [active, isStationExec, session?.tokens?.accessToken, stationId]);

  const loadPromotions = async () => {
    if (!stationId) return;
    setPromotionsLoading(true);
    setPromotionsError("");

    try {
      const data = await listStationPromotions(stationId);
      setPromotions(Array.isArray(data?.promotions) ? data.promotions : []);
    } catch (error) {
      setPromotionsError(error.message);
    } finally {
      setPromotionsLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.tokens?.accessToken) return;
    if (active !== "pricing") return;
    if (!isStationExec) return;
    if (!stationId) return;
    loadPromotions();
  }, [active, isStationExec, session?.tokens?.accessToken, stationId]);

  useEffect(() => {
    if (!session?.tokens?.accessToken) return;
    if (!isStationManager) return;
    if (!stationId) return;
    if (!["overview", "reports"].includes(active)) return;

    loadStationTeam();
    loadPromotions();
    loadStationPayments({
      provider: "",
      status: "",
      from: "",
      to: "",
      page: 1,
      limit: 10
    });
  }, [active, isStationManager, session?.tokens?.accessToken, stationId]);

  const handlePromotionSubmit = async (event) => {
    event.preventDefault();
    if (!stationId) return;

    setIsSavingPromotion(true);
    setPromotionsError("");
    setPromotionStatus("");

    try {
      const payload = {
        title: String(promotionForm.title || "").trim(),
        description: String(promotionForm.description || "").trim(),
        mediaType: String(promotionForm.mediaType || "image").trim().toLowerCase(),
        mediaUrl: String(promotionForm.mediaUrl || "").trim(),
        thumbnailUrl: String(promotionForm.thumbnailUrl || "").trim(),
        ctaLabel: String(promotionForm.ctaLabel || "").trim(),
        ctaUrl: String(promotionForm.ctaUrl || "").trim(),
        startsAt: String(promotionForm.startsAt || "").trim() || null,
        endsAt: String(promotionForm.endsAt || "").trim() || null,
        sortOrder: Number(promotionForm.sortOrder || 0),
        isActive: Boolean(promotionForm.isActive)
      };

      const result = promotionForm.id
        ? await updateStationPromotion(stationId, promotionForm.id, payload)
        : await createStationPromotion(stationId, payload);

      setPromotionStatus(result?.message || (promotionForm.id ? "Promotion updated." : "Promotion published."));
      setPromotionForm(buildPromotionFormState());
      await loadPromotions();
    } catch (error) {
      setPromotionsError(error.message);
    } finally {
      setIsSavingPromotion(false);
    }
  };

  const startEditPromotion = (promotion) => {
    setPromotionsError("");
    setPromotionStatus("");
    setPromotionForm(buildPromotionFormState(promotion));
  };

  const resetPromotionForm = () => {
    setPromotionsError("");
    setPromotionStatus("");
    setPromotionForm(buildPromotionFormState());
  };

  const togglePromotionActive = async (promotion) => {
    if (!stationId || !promotion?.id) return;

    setIsSavingPromotion(true);
    setPromotionsError("");
    setPromotionStatus("");

    try {
      const nextIsActive = !promotion.isActive;
      const result = await updateStationPromotion(stationId, promotion.id, {
        isActive: nextIsActive
      });
      setPromotionStatus(
        result?.message || (nextIsActive ? "Promotion enabled." : "Promotion hidden from the app.")
      );
      if (promotionForm.id === promotion.id) {
        setPromotionForm((prev) => ({ ...prev, isActive: nextIsActive }));
      }
      await loadPromotions();
    } catch (error) {
      setPromotionsError(error.message);
    } finally {
      setIsSavingPromotion(false);
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin) return;

    setIsCreatingUser(true);
    setCreateUserError("");
    setCreateUserStatus("");

    try {
      const stationIds = createUserForm.assignToSelectedStation && stationId
        ? [String(stationId)]
        : parseIdList(createUserForm.stationIds);

      const payload = {
        name: String(createUserForm.name || "").trim(),
        email: String(createUserForm.email || "").trim().toLowerCase(),
        phone: String(createUserForm.phone || "").trim(),
        password: String(createUserForm.password || ""),
        role: String(createUserForm.role || "staff").trim().toLowerCase(),
        organizationId: String(createUserForm.organizationId || "").trim() || null,
        cityIds: [...new Set(parseIdList(createUserForm.cityIds))],
        stationIds: [...new Set(stationIds)],
        branchIds: [...new Set(parseIdList(createUserForm.branchIds))]
      };

      const result = await createAdminUser(payload);
      setCreateUserStatus(result?.message || "User created.");
      await loadAdminDirectory();

      setCreateUserForm((prev) => ({
        ...prev,
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "staff",
        cityIds: "",
        branchIds: ""
      }));
    } catch (error) {
      setCreateUserError(error.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const startEditUser = (user) => {
    setEditUserStatus("");
    setEditUserError("");
    setEditUserId(String(user?.id || ""));
    setEditUserForm({
      name: String(user?.name || ""),
      email: String(user?.email || ""),
      phone: String(user?.phone || ""),
      role: String(user?.role || "staff"),
      organizationId: String(user?.organizationId || ""),
      cityIds: formatIdList(user?.cityIds),
      stationIds: formatIdList(user?.stationIds),
      branchIds: formatIdList(user?.branchIds),
      isBlocked: Boolean(user?.isBlocked)
    });
  };

  const stopEditUser = () => {
    setEditUserId("");
    setEditUserForm(null);
    setEditUserStatus("");
    setEditUserError("");
  };

  const handleSaveUser = async (event) => {
    event.preventDefault();
    if (!isSuperAdmin || !editUserId) return;

    setIsSavingUser(true);
    setEditUserStatus("");
    setEditUserError("");

    try {
      const payload = {
        name: String(editUserForm?.name || "").trim(),
        email: String(editUserForm?.email || "").trim().toLowerCase(),
        phone: String(editUserForm?.phone || "").trim(),
        role: String(editUserForm?.role || "staff").trim().toLowerCase(),
        organizationId: String(editUserForm?.organizationId || "").trim() || null,
        cityIds: [...new Set(parseIdList(editUserForm?.cityIds))],
        stationIds: [...new Set(parseIdList(editUserForm?.stationIds))],
        branchIds: [...new Set(parseIdList(editUserForm?.branchIds))]
      };

      const result = await updateAdminUser(editUserId, payload);
      setEditUserStatus(result?.message || "User updated.");
      await loadAdminDirectory();

      if (result?.user) {
        startEditUser(result.user);
      }
    } catch (error) {
      setEditUserError(error.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!isSuperAdmin || !editUserId) return;

    setIsSavingUser(true);
    setEditUserStatus("");
    setEditUserError("");

    try {
      const nextValue = !Boolean(editUserForm?.isBlocked);
      const result = await setAdminUserBlocked(editUserId, nextValue);
      setEditUserStatus(result?.message || (nextValue ? "User blocked." : "User unblocked."));
      await loadAdminDirectory();

      if (result?.user) {
        startEditUser(result.user);
      } else {
        setEditUserForm((prev) => (prev ? { ...prev, isBlocked: nextValue } : prev));
      }
    } catch (error) {
      setEditUserError(error.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleForceLogout = async () => {
    if (!isSuperAdmin || !editUserId) return;

    setIsSavingUser(true);
    setEditUserStatus("");
    setEditUserError("");

    try {
      const result = await forceLogoutAdminUser(editUserId);
      setEditUserStatus(result?.message || "User sessions revoked.");
      await loadAdminDirectory();
    } catch (error) {
      setEditUserError(error.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const allowedTeamRoles = useMemo(() => {
    if (actorRole === "station_manager") return ["staff"];
    if (actorRole === "org_admin" || actorRole === "super_admin") return ["staff", "station_manager"];
    return [];
  }, [actorRole]);

  const handleCreateTeamUser = async (event) => {
    event.preventDefault();
    if (!isStationExec || isSuperAdmin) return;
    if (!stationId) return;

    setIsCreatingTeam(true);
    setCreateTeamError("");
    setCreateTeamStatus("");

    try {
      const payload = {
        name: String(createTeamForm.name || "").trim(),
        email: String(createTeamForm.email || "").trim().toLowerCase(),
        phone: String(createTeamForm.phone || "").trim(),
        password: String(createTeamForm.password || ""),
        role: String(createTeamForm.role || "staff").trim().toLowerCase()
      };

      const result = await createStationTeamUser(stationId, payload);
      setCreateTeamStatus(result?.message || "Team member created.");
      await loadStationTeam();
      setCreateTeamForm((prev) => ({ ...prev, name: "", email: "", phone: "", password: "" }));
    } catch (error) {
      setCreateTeamError(error.message);
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const startEditTeamUser = (user) => {
    setEditTeamStatus("");
    setEditTeamError("");
    setEditTeamUserId(String(user?.id || ""));
    setEditTeamForm({
      name: String(user?.name || ""),
      email: String(user?.email || ""),
      phone: String(user?.phone || ""),
      role: String(user?.role || "staff"),
      isBlocked: Boolean(user?.isBlocked)
    });
  };

  const stopEditTeamUser = () => {
    setEditTeamUserId("");
    setEditTeamForm(null);
    setEditTeamStatus("");
    setEditTeamError("");
  };

  const handleSaveTeamUser = async (event) => {
    event.preventDefault();
    if (!isStationExec || isSuperAdmin) return;
    if (!stationId || !editTeamUserId) return;

    setIsSavingTeam(true);
    setEditTeamStatus("");
    setEditTeamError("");

    try {
      const payload = {
        name: String(editTeamForm?.name || "").trim(),
        email: String(editTeamForm?.email || "").trim().toLowerCase(),
        phone: String(editTeamForm?.phone || "").trim(),
        role: String(editTeamForm?.role || "staff").trim().toLowerCase()
      };

      const result = await updateStationTeamUser(stationId, editTeamUserId, payload);
      setEditTeamStatus(result?.message || "Team member updated.");
      await loadStationTeam();
      if (result?.user) startEditTeamUser(result.user);
    } catch (error) {
      setEditTeamError(error.message);
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleToggleTeamBlock = async () => {
    if (!isStationExec || isSuperAdmin) return;
    if (!stationId || !editTeamUserId) return;

    setIsSavingTeam(true);
    setEditTeamStatus("");
    setEditTeamError("");

    try {
      const nextValue = !Boolean(editTeamForm?.isBlocked);
      const result = await setStationTeamUserBlocked(stationId, editTeamUserId, nextValue);
      setEditTeamStatus(result?.message || (nextValue ? "User blocked." : "User unblocked."));
      await loadStationTeam();

      if (result?.user) {
        startEditTeamUser(result.user);
      } else {
        setEditTeamForm((prev) => (prev ? { ...prev, isBlocked: nextValue } : prev));
      }
    } catch (error) {
      setEditTeamError(error.message);
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleForceLogoutTeamUser = async () => {
    if (!isStationExec || isSuperAdmin) return;
    if (!stationId || !editTeamUserId) return;

    setIsSavingTeam(true);
    setEditTeamStatus("");
    setEditTeamError("");

    try {
      const result = await forceLogoutStationTeamUser(stationId, editTeamUserId);
      setEditTeamStatus(result?.message || "User sessions revoked.");
      await loadStationTeam();
    } catch (error) {
      setEditTeamError(error.message);
    } finally {
      setIsSavingTeam(false);
    }
  };

  const applyPaymentsFilters = async (event) => {
    event?.preventDefault?.();
    if (!isStationExec || !stationId) return;
    const nextFilters = { ...paymentsFilters, page: 1 };
    setPaymentsFilters(nextFilters);
    await loadStationPayments(nextFilters);
  };

  const goToPaymentsPage = async (nextPage) => {
    if (!isStationExec || !stationId) return;
    const resolvedPage = Math.max(1, Number(nextPage || 1));
    const nextFilters = { ...paymentsFilters, page: resolvedPage };
    setPaymentsFilters(nextFilters);
    await loadStationPayments(nextFilters);
  };

  const resetCreateStationForm = () => {
    const defaultOrganizationId = isSuperAdmin
      ? String(station?.organizationId || session?.user?.organizationId || "")
      : String(session?.user?.organizationId || station?.organizationId || "");
    setCreateStationForm(buildCreateStationFormState(defaultOrganizationId));
    setCreateStationError("");
    setCreateStationStatus("");
  };

  const handleCreateStation = async (event) => {
    event.preventDefault();
    if (!canManageStations) return;

    setIsCreatingStation(true);
    setCreateStationError("");
    setCreateStationStatus("");

    try {
      const latitude = readOptionalFiniteNumber(createStationForm.latitude);
      const longitude = readOptionalFiniteNumber(createStationForm.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Latitude and longitude are required.");
      }

      const payload = {
        name: String(createStationForm.name || "").trim(),
        address: String(createStationForm.address || "").trim(),
        contact: String(createStationForm.contact || "").trim(),
        stationType: String(createStationForm.stationType || "fuel").trim().toLowerCase(),
        latitude,
        longitude,
        fuelStatus: String(createStationForm.fuelStatus || "partial").trim().toLowerCase(),
        fuelPrices: buildFuelPricesPayload(createStationForm),
        isActive: Boolean(createStationForm.isActive),
        organizationId: String(createStationForm.organizationId || "").trim() || null,
        regionId: String(createStationForm.regionId || "").trim() || null,
        cityId: String(createStationForm.cityId || "").trim() || null,
        woredaId: String(createStationForm.woredaId || "").trim() || null,
        branchId: String(createStationForm.branchId || "").trim() || null,
        ...(isSuperAdmin
          ? {
              chapaSubaccountId: String(createStationForm.chapaSubaccountId || "").trim()
            }
          : {}),
        paymentDetails: {
          providerName: String(createStationForm.paymentProviderName || "").trim(),
          accountName: String(createStationForm.paymentAccountName || "").trim(),
          accountNumber: String(createStationForm.paymentAccountNumber || "").trim(),
          phoneNumber: String(createStationForm.paymentPhoneNumber || "").trim(),
          instructions: String(createStationForm.paymentInstructions || "").trim()
        }
      };

      const result = await createAdminStation(payload);
      const createdStation = result?.station || null;
      let nextStationId = String(createdStation?.id || createdStation?._id || "");

      if (isSuperAdmin) {
        setSuperAdminStationSearch("");
        setSuperAdminStationPage(1);
        setRegionFilter(String(createdStation?.regionId || "").trim() || "all");
        setCityFilter(String(createdStation?.cityId || "").trim() || "all");
        setWoredaFilter(String(createdStation?.woredaId || "").trim() || "all");
        setSuperAdminStationDirectoryRefreshKey((prev) => prev + 1);
      } else {
        const refreshed = await listOwnerStations();
        const nextStations = refreshed?.stations || [];
        setStations(nextStations);
        nextStationId = nextStationId || String(nextStations[0]?.id || nextStations[0]?._id || "");
      }

      if (nextStationId) {
        setStationId(nextStationId);
      }

      resetCreateStationForm();
      setCreateStationStatus(result?.message || "Station created.");
    } catch (error) {
      setCreateStationError(error.message);
    } finally {
      setIsCreatingStation(false);
    }
  };

  const handleSaveStationProfile = async (event) => {
    event.preventDefault();
    if (!isStationExec) return;
    if (!stationId || !stationForm) return;

    setIsSavingStation(true);
    setStationFormError("");
    setStationFormStatus("");

    try {
      const payload = {
        name: String(stationForm.name || "").trim(),
        address: String(stationForm.address || "").trim(),
        contact: String(stationForm.contact || "").trim(),
        stationType: String(stationForm.stationType || "fuel").trim().toLowerCase(),
        fuelPrices: buildFuelPricesPayload(stationForm),
        ...(canEditChapaSubaccount
          ? {
              chapaSubaccountId: String(stationForm.chapaSubaccountId || "").trim()
            }
          : {}),
        paymentDetails: {
          providerName: String(stationForm.paymentProviderName || "").trim(),
          accountName: String(stationForm.paymentAccountName || "").trim(),
          accountNumber: String(stationForm.paymentAccountNumber || "").trim(),
          phoneNumber: String(stationForm.paymentPhoneNumber || "").trim(),
          instructions: String(stationForm.paymentInstructions || "").trim()
        },
        isActive: Boolean(stationForm.isActive)
      };
      const result = canManageStations
        ? await updateAdminStation(stationId, payload)
        : await updateOwnerStation(stationId, payload);
      const updatedStation = result?.station || null;
      if (updatedStation) {
        setStation(updatedStation);
        setStationForm(buildStationFormState(stationId, updatedStation));
        setStationFormDirty(false);
        setStations((prev) =>
          Array.isArray(prev)
            ? prev.map((item) =>
                String(item?.id || item?._id || "") === String(updatedStation.id || updatedStation._id || "")
                  ? { ...item, ...updatedStation }
                  : item
              )
            : prev
        );
      }
      if (isSuperAdmin) {
        setSuperAdminStationDirectoryRefreshKey((prev) => prev + 1);
      }
      setStationFormStatus(result?.message || "Station updated.");
    } catch (error) {
      setStationFormError(error.message);
    } finally {
      setIsSavingStation(false);
    }
  };

  const resetStationProfileForm = () => {
    if (!stationId || !station) return;
    setStationForm(buildStationFormState(stationId, station));
    setStationFormDirty(false);
    setStationFormError("");
    setStationFormStatus("");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthError("");
    setIsLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");
    try {
      const nextSession = await login(email, password);
      setSession(nextSession);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    resetConsoleState("");
  };

  const handleFuelUpdate = async () => {
    if (!stationId) return;
    setIsLoading(true);
    setStatusMessage("");
    try {
      await updateFuelStock(stationId, {
        gasolineLiters: Number(fuelForm.gasolineLiters),
        dieselLiters: Number(fuelForm.dieselLiters),
        otherLiters: Number(fuelForm.otherLiters)
      });
      const refreshedStation = await getOwnerStation(stationId);
      setStation(refreshedStation?.station || refreshedStation);
      if (isStationExec) {
        await loadInventorySummary(inventoryDate);
      }
      setStatusMessage("Fuel stock updated.");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCallNext = async () => {
    if (!stationId) return;
    setIsLoading(true);
    setStatusMessage("");
    try {
      await callNextInQueue(stationId);
      const queueData = await getStationQueue(stationId);
      setQueueSnapshot(queueData);
      setStatusMessage("Next ticket called.");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadQueueCsv = () => {
    const waiting = Array.isArray(queueSnapshot?.waiting) ? queueSnapshot.waiting : [];
    if (!waiting.length) {
      setStatusMessage("There are no waiting tickets to export.");
      return;
    }

    downloadCsvFile(
      `queue-${stationId || "station"}.csv`,
      ["Reservation code", "Position", "Fuel type", "Requested liters", "Joined at"],
      waiting.map((ticket) => [
        ticket?.reservationCode || "",
        ticket?.position || "",
        ticket?.fuelType || "",
        ticket?.requestedLiters || "",
        formatDateTime(ticket?.joinedAt)
      ])
    );
    setStatusMessage("Queue CSV downloaded.");
  };

  const handleDownloadPaymentsCsv = () => {
    if (!paymentsSnapshot.items.length) {
      setStatusMessage("There are no payment rows to export.");
      return;
    }

    downloadCsvFile(
      `payments-${stationId || "station"}.csv`,
      ["Created at", "Provider", "Status", "Gross", "Platform fee", "Station payout", "Reference"],
      paymentsSnapshot.items.map((item) => [
        formatDateTime(item?.createdAt),
        item?.provider || "",
        item?.status || "",
        item?.amount || 0,
        item?.platformFee || 0,
        item?.stationPayout || 0,
        item?.reference || item?.txRef || ""
      ])
    );
    setStatusMessage("Payments CSV downloaded.");
  };

  const handleDownloadTeamCsv = () => {
    if (!teamUsers.length) {
      setStatusMessage("There are no team accounts to export.");
      return;
    }

    downloadCsvFile(
      `team-${stationId || "station"}.csv`,
      ["Name", "Email", "Phone", "Role", "Blocked", "Created at"],
      teamUsers.map((user) => [
        user?.name || "",
        user?.email || "",
        user?.phone || "",
        roleLabels[user?.role] || user?.role || "",
        user?.isBlocked ? "Yes" : "No",
        formatDateTime(user?.createdAt)
      ])
    );
    setStatusMessage("Team CSV downloaded.");
  };

  if (!session?.tokens?.accessToken) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>FuelFinder Owner Console</h1>
          <p>Sign in to manage station, city, organization, or super admin operations.</p>
          <form onSubmit={handleLogin} className="login-form">
            <label>
              Email
              <input name="email" type="email" placeholder="owner@station.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="Your password" required />
            </label>
            {authError && <span className="error-text">{authError}</span>}
            <button className="btn alt" type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <small>Need access? Ask your admin to create an owner account.</small>
        </div>
      </div>
    );
  }

  const canSwitchStation =
    (isSuperAdmin ||
      actorRole === "org_admin" ||
      actorRole === "city_manager" ||
      (isStationManager && stations.length > 1)) &&
    stations.length > 0;
  const resolvedStationName =
    station?.name ||
    filteredStations.find((item) => String(item.id) === String(stationId))?.name ||
    stations.find((item) => String(item.id) === String(stationId))?.name ||
    (stationId ? `Station ${stationId}` : "Station");
  const consoleScopeLabel = isSuperAdmin
    ? "Super admin workspace"
    : isStationManager
      ? "Station manager workspace"
    : actorRole === "city_manager"
      ? "City operations workspace"
      : actorRole === "org_admin"
        ? "Organization owner workspace"
        : "Station operations workspace";
  const consoleSubtitle = isSuperAdmin
    ? "Region -> City -> Station -> Task"
    : "FuelFinder Owner Console";
  const superAdminDirectoryTotal = isSuperAdmin
    ? filteredStations.length
    : Number(superAdminStationDirectoryMeta.total || 0);
  const superAdminDirectoryPage = isSuperAdmin
    ? Math.max(1, Number(superAdminStationPage || 1))
    : Number(superAdminStationDirectoryMeta.page || 1);
  const superAdminDirectoryTotalPages = isSuperAdmin
    ? Math.max(1, Math.ceil(superAdminDirectoryTotal / SUPER_ADMIN_DIRECTORY_PAGE_LIMIT))
    : Math.max(1, Number(superAdminStationDirectoryMeta.totalPages || 1));
  const superAdminDirectoryRangeStart =
    superAdminDirectoryTotal > 0
      ? (superAdminDirectoryPage - 1) * SUPER_ADMIN_DIRECTORY_PAGE_LIMIT + 1
      : 0;
  const superAdminDirectoryRangeEnd =
    superAdminDirectoryTotal > 0 ? superAdminDirectoryRangeStart + visibleStations.length - 1 : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>FuelFinder</h1>
          <p>{consoleScopeLabel}</p>
        </div>
        <nav className="nav">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              className={active === section.id ? "active" : ""}
              onClick={() => setActive(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="cta">
          Signed in as <strong>{session?.user?.name || "Owner"}</strong>
          <br />
          <span>{roleLabels[session?.user?.role] || session?.user?.role}</span>
          <button className="btn" onClick={handleLogout} style={{ marginTop: "12px" }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h2>{sectionTitle}</h2>
            <p className="section-title">{consoleSubtitle}</p>
          </div>
          {active === "all_stations" && isSuperAdmin ? (
            <div className="station-chip">
              <strong>Directory:</strong>
              <span style={{ fontWeight: 700 }}>
                {allStationsListLoading ? "Loading all stations..." : `${allStationsSorted.length} stations`}
              </span>
            </div>
          ) : (
            <div className="station-chip">
              <strong>Station:</strong>
              {canSwitchStation ? (
                visibleStations.length ? (
                  <select value={stationId} onChange={(event) => setStationId(event.target.value)}>
                    {visibleStations.map((item) => (
                      <option key={item.id} value={item.id}>
                        {(item.name || `Station ${item.id}`) +
                          (item.cityLabel ? ` - ${item.cityLabel}` : "")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select value="" disabled>
                    <option value="">No stations for this filter</option>
                  </select>
                )
              ) : (
                <span style={{ fontWeight: 700 }}>{resolvedStationName}</span>
              )}
              <span className={`pill ${station?.isActive ? "" : "warn"}`}>
                {station?.isActive ? "Open" : "Inactive"}
              </span>
            </div>
          )}
        </div>

        {isSuperAdmin && (
          <div className="super-admin-workspace card">
            <div className="super-admin-head">
              <div className="super-admin-copy">
                <p className="section-title">Production station directory</p>
                <h3>Filter the saved Ethiopia station network, then open the station task you need.</h3>
                <p>
                  This view is backed by the saved admin station directory, not a nearby live-map search.
                  Filter by region, city, woreda, or search text, then jump straight to queue, fuel,
                  payments, users, or settings.
                </p>
              </div>
              <div className="pill">
                {superAdminStationDirectoryLoading
                  ? "Refreshing station directory..."
                  : `${superAdminDirectoryTotal} stations in directory`}
              </div>
            </div>

            {locationDirectoryMessage ? (
              <div className="station-browser-empty">
                {locationDirectoryMessage}
                <br />
                Backend action needed: seed Ethiopia locations and make sure this Netlify domain is allowed by backend CORS.
              </div>
            ) : null}

            {superAdminStationDirectoryError ? (
              <div className="station-browser-empty">{superAdminStationDirectoryError}</div>
            ) : null}

            <div className="super-admin-steps">
              <label className="super-admin-step">
                <strong>1. Region</strong>
                <select
                  value={regionFilter}
                  onChange={(event) => {
                    startTransition(() => {
                      setRegionFilter(event.target.value);
                      setCityFilter("all");
                      setWoredaFilter("all");
                      setSuperAdminStationPage(1);
                    });
                  }}
                >
                  {regionOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.count !== undefined ? `${option.label} (${option.count})` : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="super-admin-step">
                <strong>2. City</strong>
                <select
                  value={cityFilter}
                  onChange={(event) => {
                    startTransition(() => {
                      setCityFilter(event.target.value);
                      setWoredaFilter("all");
                      setSuperAdminStationPage(1);
                    });
                  }}
                  disabled={cityOptions.length <= 1}
                >
                  {cityOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.count !== undefined ? `${option.label} (${option.count})` : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="super-admin-step">
                <strong>3. Woreda</strong>
                <select
                  value={woredaFilter}
                  onChange={(event) => {
                    startTransition(() => {
                      setWoredaFilter(event.target.value);
                      setSuperAdminStationPage(1);
                    });
                  }}
                  disabled={woredaOptions.length <= 1}
                >
                  {woredaOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.count !== undefined ? `${option.label} (${option.count})` : option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="super-admin-step">
                <strong>4. Search</strong>
                <input
                  type="search"
                  value={superAdminStationSearch}
                  onChange={(event) => {
                    setSuperAdminStationSearch(event.target.value);
                    setSuperAdminStationPage(1);
                  }}
                  placeholder="Station name, address, contact, landmark"
                />
                <span className="section-title">Search across the full saved station directory.</span>
              </label>

              <div className="super-admin-step">
                <strong>5. Reset</strong>
                <button
                  className="btn alt small"
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setRegionFilter("all");
                      setCityFilter("all");
                      setWoredaFilter("all");
                      setSuperAdminStationSearch("");
                      setSuperAdminStationPage(1);
                    });
                  }}
                  disabled={
                    regionFilter === "all" &&
                    cityFilter === "all" &&
                    woredaFilter === "all" &&
                    !String(superAdminStationSearch || "").trim()
                  }
                >
                  Show whole network
                </button>
              </div>
            </div>

            {selectedStationGeo ? (
              <div className="super-admin-summary">
                <div className="super-admin-station-meta">
                  <p className="section-title">Selected station</p>
                  <h3>{selectedStationGeo.name || `Station ${selectedStationGeo.id}`}</h3>
                  <p>
                    {selectedStationGeo.cityLabel} - {selectedStationGeo.regionLabel}
                  </p>
                  <p>{buildStationFullAddress(selectedStationGeo, selectedStationGeo.cityLabel, selectedStationGeo.regionLabel)}</p>
                  <div className="super-admin-badges">
                    <span className={`pill ${selectedStationGeo.isActive ? "" : "warn"}`}>
                      {selectedStationGeo.isActive ? "Open" : "Inactive"}
                    </span>
                    <span className="pill">{formatFuelStatusLabel(selectedStationGeo.fuelStatus)}</span>
                  </div>
                </div>

                <div className="super-admin-actions">
                  {SUPER_ADMIN_QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.section}
                      className={active === action.section ? "btn small" : "btn alt small"}
                      type="button"
                      onClick={() => setActive(action.section)}
                      title={action.note}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {cityFilter !== "all" ? (
              <div className="city-live-panel">
                <div className="city-station-head">
                  <div>
                    <p className="section-title">Customer app stations</p>
                    <h4>{selectedCityRecord?.name || "Selected city"}</h4>
                    <span>
                      Stations visible in the customer app for this city
                      {selectedCityCenter?.sampleSize
                        ? `, centered from ${selectedCityCenter.sampleSize} known station${selectedCityCenter.sampleSize === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </div>
                  <span className="pill">{liveCityStations.length} live stations</span>
                </div>

                <div className="station-browser">
                  {liveCityStationsLoading ? (
                    <div className="station-browser-empty">
                      Loading customer-visible stations for {selectedCityRecord?.name || "this city"}...
                    </div>
                  ) : liveCityStations.length ? (
                    liveCityStations.map((item) => {
                      const linkedStationId = String(item.stationId || "").trim();
                      const canOpenLinkedStation = filteredStations.some(
                        (stationItem) => String(stationItem.id || "") === linkedStationId
                      );
                      const content = (
                        <>
                          <div className="station-browser-top">
                            <div>
                              <strong>{item.name || "Fuel Station"}</strong>
                              <span>
                                {(selectedCityRecord?.name || "Selected city") +
                                  " / " +
                                  (selectedCityRecord?.region?.name || selectedStationGeo?.regionLabel || item.region?.name || "Selected region")}
                              </span>
                            </div>
                            <span className={`pill ${item.isActive === false ? "warn" : ""}`}>
                              {linkedStationId
                                ? canOpenLinkedStation
                                  ? "Linked"
                                  : "Linked in directory"
                                : "Live map only"}
                            </span>
                          </div>
                          <p>
                            {buildHumanReadableLiveAddress(
                              item,
                              selectedCityRecord?.name || "Selected city",
                              selectedCityRecord?.region?.name || selectedStationGeo?.regionLabel || item.region?.name || "Selected region"
                            )}
                          </p>
                          <div className="station-browser-meta">
                            <span>Fuel: {formatFuelStatusLabel(item.fuel_status || item.fuelStatus)}</span>
                            <span>Queue: {Number(item.queue_length || 0)} drivers</span>
                            {Number.isFinite(Number(item.distanceMeters)) ? (
                              <span>{Math.round(Number(item.distanceMeters) / 1000)} km from city center</span>
                            ) : null}
                            {Number.isFinite(readOptionalFiniteNumber(item.latitude)) &&
                            Number.isFinite(readOptionalFiniteNumber(item.longitude)) ? (
                              <span>
                                Coords: {readOptionalFiniteNumber(item.latitude).toFixed(5)}, {readOptionalFiniteNumber(item.longitude).toFixed(5)}
                              </span>
                            ) : null}
                          </div>
                        </>
                      );

                      if (linkedStationId && canOpenLinkedStation) {
                        return (
                          <button
                            key={`${item.id || item.stationId || item.name}-${linkedStationId}`}
                            type="button"
                            className="station-browser-card"
                            onClick={() => selectStation(linkedStationId)}
                          >
                            {content}
                          </button>
                        );
                      }

                      return (
                        <div
                          key={`${item.id || item.stationId || item.name}-${item.latitude || "live"}`}
                          className="station-browser-card"
                        >
                          {content}
                        </div>
                      );
                    })
                  ) : (
                    <div className="station-browser-empty">
                      {liveCityStationsError || `No customer-visible stations were found for ${selectedCityRecord?.name || "this city"} yet.`}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="super-admin-results-bar">
              <div className="super-admin-results-copy">
                <p className="section-title">Station directory</p>
                <h4>
                  {superAdminDirectoryTotal
                    ? `Showing ${superAdminDirectoryRangeStart}-${superAdminDirectoryRangeEnd} of ${superAdminDirectoryTotal} saved stations`
                    : "No saved stations matched this view"}
                </h4>
                <span>
                  Saved admin stations are filterable nationwide by region, city, and woreda when location links are available.
                </span>
              </div>
              <div className="super-admin-pagination">
                <span className="pill">
                  Page {superAdminDirectoryPage} of {superAdminDirectoryTotalPages}
                </span>
                <button
                  className="btn alt small"
                  type="button"
                  onClick={() => setSuperAdminStationPage((prev) => Math.max(1, prev - 1))}
                  disabled={superAdminStationDirectoryLoading || superAdminDirectoryPage <= 1}
                >
                  Previous
                </button>
                <button
                  className="btn alt small"
                  type="button"
                  onClick={() =>
                    setSuperAdminStationPage((prev) =>
                      Math.min(superAdminDirectoryTotalPages, prev + 1)
                    )
                  }
                  disabled={
                    superAdminStationDirectoryLoading ||
                    superAdminDirectoryPage >= superAdminDirectoryTotalPages
                  }
                >
                  Next
                </button>
              </div>
            </div>

            {superAdminStationDirectoryLoading ? (
              <div className="station-browser-empty">
                Loading the Ethiopia station directory for this filter...
              </div>
            ) : visibleStations.length ? (
              <div className="station-browser">
                {visibleStations.map((item) => {
                  const selected = String(item.id) === String(stationId);
                  const needsLocationReview = !item.regionId || !item.cityId || !item.woredaId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`station-browser-card${selected ? " selected" : ""}`}
                      onClick={() => selectStation(String(item.id))}
                    >
                      <div className="station-browser-top">
                        <div>
                          <strong>{item.name || `Station ${item.id}`}</strong>
                          <span>
                            {(item.cityLabel || "Unspecified city") + " / " + (item.regionLabel || "Unspecified region")}
                          </span>
                        </div>
                        <span className={`pill ${needsLocationReview || !item.isActive ? "warn" : ""}`}>
                          {needsLocationReview ? "Needs review" : item.isActive ? "Open" : "Inactive"}
                        </span>
                      </div>
                      <p>{buildStationFullAddress(item, item.cityLabel, item.regionLabel)}</p>
                      <div className="station-browser-meta">
                        <span>Woreda: {item.woredaLabel || "Unspecified woreda"}</span>
                        <span>Fuel: {formatFuelStatusLabel(item.fuelStatus)}</span>
                        <span>Updated: {formatDateTime(item.fuelInventory?.updatedAt || item.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="station-browser-empty">
                No stations match this region, city, woreda, or search. Reset filters or import more Ethiopia stations.
              </div>
            )}
          </div>
        )}

        {statusMessage && <div className="status-banner">{statusMessage}</div>}

        {active === "overview" && (
          <div className="grid">
            <div className="card full">
              <h3>Today at a glance</h3>
              <div className="metrics">
                {derivedMetrics.map((metric) => (
                  <div className="metric" key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            {isStationManager && (
              <div className="card full">
                <div className="topbar">
                  <div>
                    <h3>Assigned station workspace</h3>
                    <p className="section-title">Only assigned stations are available to this manager account</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {STATION_MANAGER_QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.section}
                        className={active === action.section ? "btn small" : "btn alt small"}
                        type="button"
                        onClick={() => setActive(action.section)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="metrics">
                  <div className="metric">
                    <span>Assigned stations</span>
                    <strong>{stations.length}</strong>
                  </div>
                  <div className="metric">
                    <span>Selected city</span>
                    <strong>{selectedStationGeo?.cityLabel || "--"}</strong>
                  </div>
                  <div className="metric">
                    <span>Selected region</span>
                    <strong>{selectedStationGeo?.regionLabel || "--"}</strong>
                  </div>
                  <div className="metric">
                    <span>Team accounts</span>
                    <strong>{teamUsers.length}</strong>
                  </div>
                  <div className="metric">
                    <span>Live promotions</span>
                    <strong>{activePromotionCount}</strong>
                  </div>
                  <div className="metric">
                    <span>Blocked accounts</span>
                    <strong>{blockedTeamCount}</strong>
                  </div>
                </div>

                {stations.length > 1 ? (
                  <div className="station-browser">
                    {stations.map((item) => {
                      const stationItem = stationGeo.find((entry) => String(entry.id) === String(item.id));
                      const selected = String(item.id) === String(stationId);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`station-browser-card${selected ? " selected" : ""}`}
                          onClick={() => setStationId(String(item.id))}
                        >
                          <div className="station-browser-top">
                            <div>
                              <strong>{item.name || `Station ${item.id}`}</strong>
                              <span>
                                {stationItem?.cityLabel || "Unspecified city"} - {stationItem?.regionLabel || "Unspecified region"}
                              </span>
                            </div>
                            <span className={`pill ${item.isActive ? "" : "warn"}`}>
                              {item.isActive ? "Open" : "Inactive"}
                            </span>
                          </div>
                          <p>{item.address || "Address not set yet."}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {isCeo && (
              <div className="card full">
                <h3>Station manager checklist</h3>
                <p className="section-title">
                  {todayKey} - {ceoTaskProgress.completed}/{ceoTaskProgress.total} done
                </p>
                <div className="list">
                  {CEO_TASKS.map((task) => {
                    const done = Boolean(ceoTasks?.[task.id]);
                    return (
                      <div className="list-item" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <span>{task.note}</span>
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <button className="btn small" type="button" onClick={() => setActive(task.section)}>
                            Open
                          </button>
                          <button
                            className={done ? "btn small" : "btn alt small"}
                            type="button"
                            onClick={() => toggleCeoTask(task.id)}
                          >
                            {done ? "Undo" : "Mark done"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card wide">
              <h3>Live operations status</h3>
              <div className="form-row">
                <label>
                  Station status
                  <input type="text" value={station?.isActive ? "Open" : "Inactive"} readOnly />
                </label>
                <label>
                  Fuel status
                  <input type="text" value={formatFuelStatusLabel(station?.fuelStatus)} readOnly />
                </label>
                <label>
                  Live queue length
                  <input type="number" value={queueSnapshot?.waitingCount || 0} readOnly />
                </label>
                <label>
                  Estimated wait
                  <input type="text" value={formatMinutes(buildEstimate(queueSnapshot?.waitingCount || 0))} readOnly />
                </label>
                <label>
                  Last fuel update
                  <input type="text" value={formatDateTime(station?.fuelInventory?.updatedAt)} readOnly />
                </label>
                <label>
                  Pending payments
                  <input type="number" value={queueSnapshot?.pendingCount || 0} readOnly />
                </label>
              </div>
              <button className="btn alt" type="button" onClick={() => setActive("queue")}>
                Open queue controls
              </button>
            </div>

            <div className="card narrow">
              <h3>Priority alerts</h3>
              <div className="list">
                {operationalAlerts.map((alert) => (
                  <div className="list-item" key={alert.title}>
                    <div>
                      <strong>{alert.title}</strong>
                      <span>{alert.detail}</span>
                    </div>
                    <button
                      className={alert.warn ? "btn small" : "btn alt small"}
                      type="button"
                      onClick={() => setActive(alert.section)}
                    >
                      {alert.pill}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === "all_stations" && isSuperAdmin && (
          <div className="grid">
            <div className="card full">
              <div className="super-admin-head">
                <div className="super-admin-copy">
                  <p className="section-title">Ethiopia station directory</p>
                  <h3>All saved stations</h3>
                  <p>
                    This root admin page shows the full saved station list across Ethiopia with no
                    filters, no actions, and no extra controls.
                  </p>
                </div>
                <div className="pill">
                  {allStationsListLoading ? "Loading station list..." : `${allStationsSorted.length} stations`}
                </div>
              </div>

              {allStationsListError ? (
                <div className="station-browser-empty">{allStationsListError}</div>
              ) : null}

              {allStationsListLoading ? (
                <div className="station-browser-empty">Loading the Ethiopia station list...</div>
              ) : null}

              {!allStationsListLoading && !allStationsListError && !allStationsSorted.length ? (
                <div className="station-browser-empty">No saved stations were found yet.</div>
              ) : null}

              {!allStationsListLoading && !allStationsListError && allStationsSorted.length ? (
                <ol className="all-station-list">
                  {allStationsSorted.map((item, index) => {
                    const regionLabel = String(item?.region?.name || "").trim() || "Unspecified region";
                    const cityLabel =
                      String(item?.city?.name || item?.subcity || "").trim() || "Unspecified city";
                    const woredaLabel =
                      String(item?.woredaDirectory?.name || item?.woreda || "").trim() ||
                      "Unspecified woreda";

                    return (
                      <li className="all-station-item" key={String(item?.id || `${item?.name || "station"}-${index}`)}>
                        <div className="all-station-order">{index + 1}</div>
                        <div className="all-station-copy">
                          <div className="all-station-head">
                            <strong>{item?.name || "Unnamed station"}</strong>
                            <span className={`pill ${item?.isActive ? "" : "warn"}`}>
                              {item?.isActive ? "Open" : "Inactive"}
                            </span>
                          </div>
                          <p>{buildStationFullAddress(item, item?.city?.name, item?.region?.name)}</p>
                          <div className="all-station-meta">
                            <span>{regionLabel}</span>
                            <span>{cityLabel}</span>
                            <span>{woredaLabel}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </div>
          </div>
        )}

        {active === "queue" && (
          <div className="grid">
            <div className="card wide">
              <h3>Queue controls</h3>
              <div className="form-row">
                <label>
                  Current wait estimate
                  <input type="text" value={formatMinutes(buildEstimate(queueSnapshot?.waitingCount || 0))} readOnly />
                </label>
                <label>
                  Waiting drivers
                  <input type="number" value={queueSnapshot?.waitingCount || 0} readOnly />
                </label>
                <label>
                  Pending payments
                  <input type="number" value={queueSnapshot?.pendingCount || 0} readOnly />
                </label>
                <label>
                  Called now
                  <input type="text" value={queueSnapshot?.called?.reservationCode || "--"} readOnly />
                </label>
              </div>
              <button className="btn alt" onClick={handleCallNext} disabled={isLoading}>
                Call next ticket
              </button>
            </div>
            <div className="card narrow">
              <h3>Queue insights</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Avg wait</strong>
                    <span>{formatMinutes(buildEstimate(queueSnapshot?.waitingCount || 0))}</span>
                  </div>
                  <span className="pill">Live</span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Next call</strong>
                    <span>{queueSnapshot?.waiting?.[0]?.reservationCode || "None"}</span>
                  </div>
                  <span className="pill warn">Queue</span>
                </div>
              </div>
            </div>
            <div className="card full">
              <h3>Waiting tickets</h3>
              <div className="list">
                {(queueSnapshot?.waiting || []).slice(0, 6).map((ticket) => (
                  <div className="list-item" key={ticket.reservationId}>
                    <div>
                      <strong>{ticket.reservationCode || "Ticket"}</strong>
                      <span>Position {ticket.position}</span>
                    </div>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() =>
                        setStatusMessage(
                          `${ticket.reservationCode || "Ticket"} is waiting in position ${ticket.position}${
                            ticket.requestedLiters ? ` for ${ticket.requestedLiters} liters` : ""
                          }.`
                        )
                      }
                    >
                      Details
                    </button>
                  </div>
                ))}
                {!queueSnapshot?.waiting?.length && (
                  <div className="list-item">
                    <div>
                      <strong>No waiting tickets</strong>
                      <span>Queue is clear.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {active === "inventory" && (
          <div className="grid">
            <div className="card wide">
              <h3>Fuel availability</h3>
              <div className="form-row">
                <label>
                  Gasoline (liters)
                  <input
                    type="number"
                    value={fuelForm.gasolineLiters}
                    onChange={(event) =>
                      setFuelForm((prev) => ({ ...prev, gasolineLiters: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Diesel (liters)
                  <input
                    type="number"
                    value={fuelForm.dieselLiters}
                    onChange={(event) =>
                      setFuelForm((prev) => ({ ...prev, dieselLiters: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Other (liters)
                  <input
                    type="number"
                    value={fuelForm.otherLiters}
                    onChange={(event) =>
                      setFuelForm((prev) => ({ ...prev, otherLiters: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Last updated
                  <input type="text" value={formatDateTime(station?.fuelInventory?.updatedAt)} readOnly />
                </label>
              </div>
              <button className="btn alt" onClick={handleFuelUpdate} disabled={isLoading}>
                Update fuel stock
              </button>
            </div>
            <div className="card narrow">
              <h3>Inventory alerts</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Diesel tank</strong>
                    <span>{Math.round(asFiniteNumber(fuelForm.dieselLiters, 0))} liters remaining</span>
                  </div>
                  <span className={asFiniteNumber(fuelForm.dieselLiters, 0) < 1000 ? "pill warn" : "pill"}>
                    {asFiniteNumber(fuelForm.dieselLiters, 0) < 1000 ? "Low" : "Stable"}
                  </span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Gasoline tank</strong>
                    <span>{Math.round(asFiniteNumber(fuelForm.gasolineLiters, 0))} liters remaining</span>
                  </div>
                  <span className={asFiniteNumber(fuelForm.gasolineLiters, 0) < 1000 ? "pill warn" : "pill"}>
                    {asFiniteNumber(fuelForm.gasolineLiters, 0) < 1000 ? "Low" : "Stable"}
                  </span>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Other fuel</strong>
                    <span>{Math.round(asFiniteNumber(fuelForm.otherLiters, 0))} liters remaining</span>
                  </div>
                  <span className={asFiniteNumber(fuelForm.otherLiters, 0) < 500 ? "pill warn" : "pill"}>
                    {asFiniteNumber(fuelForm.otherLiters, 0) < 500 ? "Watch" : "Stable"}
                  </span>
                </div>
              </div>
            </div>
            {isStationExec && (
              <div className="card full">
                <h3>Daily fuel summary</h3>
                <p className="section-title">Check left fuel, sold liters, and total sold price for one date.</p>

                <form
                  className="form-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadInventorySummary(inventoryDate);
                  }}
                >
                  <label>
                    Selected date
                    <input
                      type="date"
                      value={inventoryDate}
                      max={todayKey}
                      onChange={(event) => setInventoryDate(event.target.value)}
                    />
                  </label>
                  <button className="btn" type="submit" disabled={inventorySummaryLoading}>
                    {inventorySummaryLoading ? "Loading..." : "Load summary"}
                  </button>
                  <button
                    className="btn alt"
                    type="button"
                    onClick={() => loadInventorySummary(inventoryDate)}
                    disabled={inventorySummaryLoading}
                  >
                    Refresh
                  </button>
                </form>

                {inventorySummaryError && <span className="error-text">{inventorySummaryError}</span>}

                {!inventorySummary.leftFuelAvailable && inventoryDate !== todayKey && !inventorySummaryError && (
                  <span className="status-banner">
                    Left-fuel history becomes available after stock changes are recorded for that date. Sold liters and sold
                    price still show below.
                  </span>
                )}

                <div className="metrics">
                  <div className="metric">
                    <span>Left fuel</span>
                    <strong>
                      {inventorySummary.leftFuelAvailable ? formatLiters(inventorySummary.totals?.leftLiters) : "Not available"}
                    </strong>
                  </div>
                  <div className="metric">
                    <span>Sold liters</span>
                    <strong>{formatLiters(inventorySummary.totals?.soldLiters || 0)}</strong>
                  </div>
                  <div className="metric">
                    <span>Total sold price</span>
                    <strong>{formatMoney(inventorySummary.totals?.soldAmount || 0, "ETB")}</strong>
                  </div>
                  <div className="metric">
                    <span>Served tickets</span>
                    <strong>{Number(inventorySummary.totals?.servedTickets || 0)}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <span className={inventorySummary.leftFuelAvailable ? "pill" : "pill warn"}>
                    {inventorySummary.leftFuelSource === "snapshot"
                      ? "Historical snapshot"
                      : inventorySummary.leftFuelAvailable
                        ? "Current live stock"
                        : "Awaiting snapshot"}
                  </span>
                  <span className="section-title" style={{ fontSize: "12px" }}>
                    Snapshot time: {formatDateTime(inventorySummary.leftFuelUpdatedAt)}
                  </span>
                </div>

                <div className="list">
                  {inventorySummary.breakdown.map((item) => {
                    const lowThreshold = item.fuelType === "other" ? 500 : 1000;
                    const hasLeftLiters = Number.isFinite(Number(item.leftLiters));
                    return (
                      <div className="list-item" key={item.fuelType}>
                        <div>
                          <strong>{formatFuelTypeLabel(item.fuelType)}</strong>
                          <span>
                            Sold {formatLiters(item.soldLiters || 0)} - {formatMoney(item.soldAmount || 0, "ETB")} -{" "}
                            {Number(item.servedTickets || 0)} tickets
                          </span>
                        </div>
                        <span
                          className={
                            hasLeftLiters && Number(item.leftLiters || 0) < lowThreshold ? "pill warn" : "pill"
                          }
                        >
                          Left: {hasLeftLiters ? formatLiters(item.leftLiters) : "Not available"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="card full">
              <h3>Inventory operating standard</h3>
              <div className="list">
                <div className="list-item">
                  <div>
                    <strong>Record every tank update immediately</strong>
                    <span>Fuel figures should match the physical dip or approved delivery log before customer demand spikes.</span>
                  </div>
                  <button className="btn small" type="button" onClick={handleFuelUpdate} disabled={isLoading}>
                    Save live stock
                  </button>
                </div>
                <div className="list-item">
                  <div>
                    <strong>Escalate low stock before outage</strong>
                    <span>Use the live warnings above to trigger replenishment before customers see an empty station.</span>
                  </div>
                  <button className="btn alt small" type="button" onClick={() => setActive("reports")}>
                    View report
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {active === "cashflow" && (
          <div className="grid">
            {!isStationExec ? (
              <div className="card full">
                <h3>Cashflow</h3>
                <p className="section-title">Station manager or higher</p>
                <p>You do not have permission to view station payments.</p>
              </div>
            ) : (
              <>
                <div className="card wide">
                  <h3>Payments</h3>
                  <p className="section-title">Station transactions</p>

                  <form onSubmit={applyPaymentsFilters} className="form-row">
                    <label>
                      Provider
                      <select
                        value={paymentsFilters.provider}
                        onChange={(event) => setPaymentsFilters((prev) => ({ ...prev, provider: event.target.value }))}
                      >
                        <option value="">All</option>
                        <option value="chapa">Chapa</option>
                      </select>
                    </label>
                    <label>
                      Status
                      <select
                        value={paymentsFilters.status}
                        onChange={(event) => setPaymentsFilters((prev) => ({ ...prev, status: event.target.value }))}
                      >
                        <option value="">All</option>
                        <option value="initialized">Initialized</option>
                        <option value="pending">Pending</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                      </select>
                    </label>
                    <label>
                      From
                      <input
                        type="date"
                        value={paymentsFilters.from}
                        onChange={(event) => setPaymentsFilters((prev) => ({ ...prev, from: event.target.value }))}
                      />
                    </label>
                    <label>
                      To
                      <input
                        type="date"
                        value={paymentsFilters.to}
                        onChange={(event) => setPaymentsFilters((prev) => ({ ...prev, to: event.target.value }))}
                      />
                    </label>
                    <label>
                      Per page
                      <select
                        value={String(paymentsFilters.limit)}
                        onChange={(event) =>
                          setPaymentsFilters((prev) => ({ ...prev, limit: Number(event.target.value) || 25 }))
                        }
                      >
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                    </label>
                    <button className="btn" type="submit" disabled={paymentsLoading}>
                      {paymentsLoading ? "Loading..." : "Apply filters"}
                    </button>
                    <button
                      className="btn alt"
                      type="button"
                      onClick={() => loadStationPayments(paymentsFilters)}
                      disabled={paymentsLoading}
                    >
                      Refresh
                    </button>
                  </form>

                  {paymentsError && <span className="error-text">{paymentsError}</span>}

                  <div className="list" style={{ marginTop: "12px" }}>
                    {paymentsLoading && <span>Loading payments...</span>}
                    {!paymentsLoading && !paymentsSnapshot.items.length && <span>No payments found.</span>}
                    {!paymentsLoading &&
                      paymentsSnapshot.items.map((item) => {
                        const currency = item.currency || "ETB";
                        const status = String(item.status || "");
                        const pillClass = status === "success" ? "pill" : "pill warn";
                        return (
                          <div className="list-item" key={item.id}>
                            <div>
                              <strong>{formatMoney(item.stationPayout, currency)} payout</strong>
                              <span>
                                {formatMoney(item.amount, currency)} gross - {formatMoney(item.platformFee, currency)} fee -{" "}
                                {String(item.provider || "").toUpperCase()} - {formatDateTime(item.createdAt)}
                              </span>
                            </div>
                            <span className={pillClass}>{status || "unknown"}</span>
                          </div>
                        );
                      })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      marginTop: "12px"
                    }}
                  >
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => goToPaymentsPage(Number(paymentsSnapshot.page || 1) - 1)}
                      disabled={paymentsLoading || Number(paymentsSnapshot.page || 1) <= 1}
                    >
                      Prev
                    </button>
                    <span className="section-title" style={{ fontSize: "12px" }}>
                      Page {Number(paymentsSnapshot.page || 1)} of{" "}
                      {Math.max(1, Math.ceil(Number(paymentsSnapshot.total || 0) / Number(paymentsSnapshot.limit || 25)))} (
                      {Number(paymentsSnapshot.total || 0)} total)
                    </span>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => goToPaymentsPage(Number(paymentsSnapshot.page || 1) + 1)}
                      disabled={
                        paymentsLoading ||
                        Number(paymentsSnapshot.page || 1) * Number(paymentsSnapshot.limit || 25) >= Number(paymentsSnapshot.total || 0)
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="card narrow">
                  <h3>Summary</h3>
                  <p className="section-title">Filtered totals</p>
                  <div className="metrics">
                    <div className="metric">
                      <span>Gross</span>
                      <strong>{formatMoney(paymentsSnapshot.summary?.amount || 0, "ETB")}</strong>
                    </div>
                    <div className="metric">
                      <span>Platform fee</span>
                      <strong>{formatMoney(paymentsSnapshot.summary?.platformFee || 0, "ETB")}</strong>
                    </div>
                    <div className="metric">
                      <span>Station payout</span>
                      <strong>{formatMoney(paymentsSnapshot.summary?.stationPayout || 0, "ETB")}</strong>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {active === "pricing" && (
          <div className="grid">
            <div className="card wide">
              <h3>Customer visibility controls</h3>
              <p className="section-title">
                Use this section to control what customers see for the selected assigned station.
              </p>
              <div className="metrics">
                <div className="metric">
                  <span>Station status</span>
                  <strong>{station?.isActive ? "Open" : "Inactive"}</strong>
                </div>
                <div className="metric">
                  <span>Fuel status</span>
                  <strong>{formatFuelStatusLabel(station?.fuelStatus)}</strong>
                </div>
                <div className="metric">
                  <span>Payment provider</span>
                  <strong>{station?.paymentDetails?.providerName || "Not set"}</strong>
                </div>
                <div className="metric">
                  <span>Live promotions</span>
                  <strong>{activePromotionCount}</strong>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn alt" type="button" onClick={() => setActive("inventory")}>
                  Update fuel availability
                </button>
                <button className="btn" type="button" onClick={() => setActive("settings")}>
                  Review public station profile
                </button>
              </div>
            </div>
            <div className="card narrow">
              <h3>Live carousel promos</h3>
              <p className="section-title">
                Published for {station?.name || "the selected station"}.
              </p>
              {promotionsError && <span className="status-banner">{promotionsError}</span>}
              {promotionStatus && <span className="status-banner">{promotionStatus}</span>}
              {promotionsLoading ? (
                <p className="section-title">Loading promotions...</p>
              ) : promotions.length ? (
                <div className="list">
                  {promotions.map((promotion) => {
                    const hasSchedule = promotion.startsAt || promotion.endsAt;
                    const pillLabel = promotion.isActive ? "Published" : "Hidden";
                    return (
                      <div className="list-item" key={promotion.id}>
                        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", width: "100%" }}>
                          {promotion.previewUrl ? (
                            <img
                              src={promotion.previewUrl}
                              alt={promotion.title}
                              style={{
                                width: "96px",
                                height: "72px",
                                objectFit: "cover",
                                borderRadius: "12px",
                                border: "1px solid rgba(148, 163, 184, 0.35)"
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "96px",
                                height: "72px",
                                borderRadius: "12px",
                                border: "1px solid rgba(148, 163, 184, 0.35)",
                                background: "linear-gradient(135deg, #dbeafe 0%, #fef3c7 100%)",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 800,
                                color: "#0f172a"
                              }}
                            >
                              {String(promotion.mediaType || "image").toUpperCase()}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong>{promotion.title}</strong>
                            <span>
                              {promotion.mediaType === "video" ? "Video promo" : "Image promo"}
                              {promotion.description ? ` - ${promotion.description}` : ""}
                            </span>
                            <span>
                              {hasSchedule
                                ? `Schedule: ${promotion.startsAt ? formatDateTime(promotion.startsAt) : "Now"} -> ${
                                    promotion.endsAt ? formatDateTime(promotion.endsAt) : "Until disabled"
                                  }`
                                : "Schedule: live immediately until you hide it"}
                            </span>
                            <span>
                              Sort order {Number(promotion.sortOrder || 0)}
                              {promotion.ctaLabel ? ` - CTA: ${promotion.ctaLabel}` : ""}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                            <span className="pill">{pillLabel}</span>
                            <button className="btn small" type="button" onClick={() => startEditPromotion(promotion)}>
                              Edit
                            </button>
                            <button
                              className="btn alt small"
                              type="button"
                              onClick={() => togglePromotionActive(promotion)}
                              disabled={isSavingPromotion}
                            >
                              {promotion.isActive ? "Hide" : "Publish"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="section-title">
                  No promotions yet. The customer home carousel stays hidden until you publish one here.
                </p>
              )}
            </div>
            <div className="card full">
              <h3>{promotionForm.id ? "Edit promotion" : "Create promotion"}</h3>
              <p className="section-title">
                Use a lightweight image URL for best speed. For video promotions, add a thumbnail URL so the home carousel stays fast.
              </p>
              <form onSubmit={handlePromotionSubmit}>
                <div className="form-row">
                  <label>
                    Promotion title
                    <input
                      value={promotionForm.title}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Weekend fuel deal"
                      required
                    />
                  </label>
                  <label>
                    Media type
                    <select
                      value={promotionForm.mediaType}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, mediaType: event.target.value }))}
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </label>
                  <label>
                    Media URL
                    <input
                      value={promotionForm.mediaUrl}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, mediaUrl: event.target.value }))}
                      placeholder="https://..."
                      required
                    />
                  </label>
                  <label>
                    Preview image URL
                    <input
                      value={promotionForm.thumbnailUrl}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, thumbnailUrl: event.target.value }))}
                      placeholder="Recommended for video"
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    CTA label
                    <input
                      value={promotionForm.ctaLabel}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, ctaLabel: event.target.value }))}
                      placeholder="View station"
                    />
                  </label>
                  <label>
                    CTA URL
                    <input
                      value={promotionForm.ctaUrl}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, ctaUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                  </label>
                  <label>
                    Starts at
                    <input
                      type="datetime-local"
                      value={promotionForm.startsAt}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, startsAt: event.target.value }))}
                    />
                  </label>
                  <label>
                    Ends at
                    <input
                      type="datetime-local"
                      value={promotionForm.endsAt}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Sort order
                    <input
                      type="number"
                      value={promotionForm.sortOrder}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                      placeholder="100"
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "26px" }}>
                    <input
                      type="checkbox"
                      checked={promotionForm.isActive}
                      onChange={(event) => setPromotionForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    Publish immediately
                  </label>
                </div>
                <label>
                  Promotion description
                  <textarea
                    value={promotionForm.description}
                    onChange={(event) => setPromotionForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Shown above the nearby station list in the customer app."
                  />
                </label>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "12px" }}>
                  <button className="btn" type="submit" disabled={isSavingPromotion || !stationId}>
                    {isSavingPromotion
                      ? "Saving..."
                      : promotionForm.id
                        ? "Save promotion"
                        : "Publish to customer home"}
                  </button>
                  <button className="btn alt" type="button" onClick={resetPromotionForm} disabled={isSavingPromotion}>
                    Clear form
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {active === "reports" && (
          <div className="grid">
            <div className="card wide">
              <h3>Operations report</h3>
              <p className="section-title">Live metrics for the selected station</p>
              <div className="metrics">
                <div className="metric">
                  <span>Assigned stations</span>
                  <strong>{stations.length}</strong>
                </div>
                <div className="metric">
                  <span>Queue backlog</span>
                  <strong>{queueSnapshot?.waitingCount || 0}</strong>
                </div>
                <div className="metric">
                  <span>Pending payments</span>
                  <strong>{queueSnapshot?.pendingCount || 0}</strong>
                </div>
                <div className="metric">
                  <span>Gross payments</span>
                  <strong>{formatMoney(paymentsSnapshot.summary?.amount || 0, "ETB")}</strong>
                </div>
                <div className="metric">
                  <span>Station payout</span>
                  <strong>{formatMoney(paymentsSnapshot.summary?.stationPayout || 0, "ETB")}</strong>
                </div>
                <div className="metric">
                  <span>Active promotions</span>
                  <strong>{activePromotionCount}</strong>
                </div>
                <div className="metric">
                  <span>Team accounts</span>
                  <strong>{teamUsers.length}</strong>
                </div>
                <div className="metric">
                  <span>Last fuel update</span>
                  <strong>{formatDateTime(station?.fuelInventory?.updatedAt)}</strong>
                </div>
              </div>
            </div>
            <div className="card narrow">
              <h3>Export</h3>
              <p className="section-title">Download current operational data</p>
              <button className="btn alt" type="button" onClick={handleDownloadQueueCsv}>
                Download queue CSV
              </button>
              <button className="btn" type="button" onClick={handleDownloadPaymentsCsv}>
                Download payments CSV
              </button>
              <button className="btn" type="button" onClick={handleDownloadTeamCsv}>
                Download team CSV
              </button>
            </div>
            <div className="card full">
              <h3>Operational alerts and standards</h3>
              <div className="list">
                {operationalAlerts.map((alert) => (
                  <div className="list-item" key={alert.title}>
                    <div>
                      <strong>{alert.title}</strong>
                      <span>{alert.detail}</span>
                    </div>
                    <button className={alert.warn ? "btn small" : "btn alt small"} type="button" onClick={() => setActive(alert.section)}>
                      Open {alert.pill}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {active === "staff" && (
          <div className="grid">
            {isSuperAdmin ? (
              <>
                <div className="card wide">
                  <h3>Users & roles</h3>
                  <p className="section-title">Create and manage owner accounts</p>

                  <div className="form-row">
                    <label>
                      Search
                      <input
                        value={userSearch}
                        onChange={(event) => setUserSearch(event.target.value)}
                        placeholder="Name, email, or phone"
                      />
                    </label>
                    <label>
                      Role
                      <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                        <option value="all">All roles</option>
                        <option value="staff">Staff</option>
                        <option value="station_manager">Station manager</option>
                        <option value="city_manager">City manager</option>
                        <option value="org_admin">Org admin</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </label>
                    <label>
                      Scope
                      <select
                        value={limitToCurrentStation ? "station" : "all"}
                        onChange={(event) => setLimitToCurrentStation(event.target.value === "station")}
                      >
                        <option value="station">This station</option>
                        <option value="all">All stations</option>
                      </select>
                    </label>
                    <button className="btn" onClick={loadAdminDirectory} disabled={adminUsersLoading}>
                      {adminUsersLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {adminUsersError && <span className="error-text">{adminUsersError}</span>}

                  <div className="list">
                    {adminUsersLoading && <span>Loading users...</span>}
                    {!adminUsersLoading && !filteredAdminUsers.length && (
                      <span>No users found for this filter.</span>
                    )}
                    {!adminUsersLoading &&
                      filteredAdminUsers.map((user) => (
                        <div className="list-item" key={user.id}>
                          <div>
                            <strong>{user.name || user.email}</strong>
                            <span>
                              {(roleLabels[user.role] || user.role) + " - " + String(user.email || "")}
                              {user.isBlocked ? " - Blocked" : ""}
                            </span>
                          </div>
                          <button className="btn" onClick={() => startEditUser(user)}>
                            Manage
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="card narrow">
                  <h3>Create user</h3>
                  <p className="section-title">Super admin only</p>
                  <form onSubmit={handleCreateUser} className="login-form">
                    <label>
                      Name
                      <input
                        value={createUserForm.name}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Full name"
                        required
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={createUserForm.email}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, email: event.target.value }))}
                        type="email"
                        placeholder="user@station.com"
                        required
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        value={createUserForm.phone}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="+2519... (optional)"
                      />
                    </label>
                    <label>
                      Password
                      <input
                        value={createUserForm.password}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, password: event.target.value }))}
                        type="password"
                        placeholder="StrongP@ssw0rd"
                        required
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={createUserForm.role}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, role: event.target.value }))}
                      >
                        <option value="staff">Staff</option>
                        <option value="station_manager">Station manager</option>
                        <option value="city_manager">City manager</option>
                        <option value="org_admin">Org admin</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </label>
                    <label>
                      Organization ID
                      <input
                        value={createUserForm.organizationId}
                        onChange={(event) =>
                          setCreateUserForm((prev) => ({ ...prev, organizationId: event.target.value }))
                        }
                        list="org-options"
                        placeholder="Optional ObjectId"
                      />
                    </label>
                    <label>
                      Assign to selected station
                      <select
                        value={createUserForm.assignToSelectedStation ? "yes" : "no"}
                        onChange={(event) =>
                          setCreateUserForm((prev) => ({
                            ...prev,
                            assignToSelectedStation: event.target.value === "yes"
                          }))
                        }
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    <label>
                      Station IDs
                      <input
                        value={
                          createUserForm.assignToSelectedStation && stationId
                            ? String(stationId)
                            : createUserForm.stationIds
                        }
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, stationIds: event.target.value }))}
                        placeholder="Comma-separated ObjectIds"
                        disabled={createUserForm.assignToSelectedStation && Boolean(stationId)}
                      />
                    </label>
                    <label>
                      City IDs
                      <input
                        value={createUserForm.cityIds}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, cityIds: event.target.value }))}
                        placeholder="Comma-separated ObjectIds"
                      />
                    </label>
                    <label>
                      Branch IDs
                      <input
                        value={createUserForm.branchIds}
                        onChange={(event) => setCreateUserForm((prev) => ({ ...prev, branchIds: event.target.value }))}
                        placeholder="Comma-separated ObjectIds"
                      />
                    </label>

                    <datalist id="org-options">
                      {organizationOptions.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.label}
                        </option>
                      ))}
                    </datalist>

                    {createUserError && <span className="error-text">{createUserError}</span>}
                    {createUserStatus && <span className="status-banner">{createUserStatus}</span>}

                    <button className="btn alt" type="submit" disabled={isCreatingUser}>
                      {isCreatingUser ? "Creating..." : "Create user"}
                    </button>
                    <small>Password must include upper/lower/number/special and be 8+ chars.</small>
                  </form>
                </div>

                {editUserForm && (
                  <div className="card full">
                    <div className="topbar">
                      <div>
                        <h3>Manage user</h3>
                        <p className="section-title">{editUserForm.email || editUserId}</p>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="btn" type="button" onClick={handleForceLogout} disabled={isSavingUser}>
                          Force logout
                        </button>
                        <button className="btn alt" type="button" onClick={handleToggleBlock} disabled={isSavingUser}>
                          {editUserForm.isBlocked ? "Unblock user" : "Block user"}
                        </button>
                        <button className="btn" type="button" onClick={stopEditUser} disabled={isSavingUser}>
                          Close
                        </button>
                      </div>
                    </div>

                    <form onSubmit={handleSaveUser} className="form-row" style={{ alignItems: "end" }}>
                      <label>
                        Name
                        <input
                          value={editUserForm.name}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, name: event.target.value }))}
                          required
                        />
                      </label>
                      <label>
                        Email
                        <input
                          value={editUserForm.email}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, email: event.target.value }))}
                          type="email"
                          required
                        />
                      </label>
                      <label>
                        Phone
                        <input
                          value={editUserForm.phone}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, phone: event.target.value }))}
                        />
                      </label>
                      <label>
                        Role
                        <select
                          value={editUserForm.role}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, role: event.target.value }))}
                        >
                          <option value="staff">Staff</option>
                          <option value="station_manager">Station manager</option>
                          <option value="city_manager">City manager</option>
                          <option value="org_admin">Org admin</option>
                          <option value="super_admin">Super admin</option>
                        </select>
                      </label>
                      <label>
                        Organization ID
                        <input
                          value={editUserForm.organizationId}
                          onChange={(event) =>
                            setEditUserForm((prev) => ({ ...prev, organizationId: event.target.value }))
                          }
                          list="org-options"
                          placeholder="Optional ObjectId"
                        />
                      </label>
                      <label>
                        City IDs
                        <input
                          value={editUserForm.cityIds}
                          onChange={(event) => setEditUserForm((prev) => ({ ...prev, cityIds: event.target.value }))}
                          placeholder="Comma-separated ObjectIds"
                        />
                      </label>
                      <label>
                        Station IDs
                        <input
                          value={editUserForm.stationIds}
                          onChange={(event) =>
                            setEditUserForm((prev) => ({ ...prev, stationIds: event.target.value }))
                          }
                          placeholder="Comma-separated ObjectIds"
                        />
                      </label>
                      <label>
                        Branch IDs
                        <input
                          value={editUserForm.branchIds}
                          onChange={(event) =>
                            setEditUserForm((prev) => ({ ...prev, branchIds: event.target.value }))
                          }
                          placeholder="Comma-separated ObjectIds"
                        />
                      </label>
                      <button className="btn alt" type="submit" disabled={isSavingUser}>
                        {isSavingUser ? "Saving..." : "Save changes"}
                      </button>
                    </form>

                    {editUserError && <span className="error-text">{editUserError}</span>}
                    {editUserStatus && <span className="status-banner">{editUserStatus}</span>}
                  </div>
                )}
              </>
            ) : !isStationExec ? (
              <div className="card full">
                <h3>Team</h3>
                <p className="section-title">Station manager or higher</p>
                <p>You do not have permission to manage station users.</p>
              </div>
            ) : (
              <>
                <div className="card wide">
                  <h3>Team roster</h3>
                  <p className="section-title">Accounts assigned to this station</p>

                  <div className="form-row" style={{ alignItems: "end" }}>
                    <button className="btn" type="button" onClick={loadStationTeam} disabled={teamLoading}>
                      {teamLoading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {teamError && <span className="error-text">{teamError}</span>}

                  <div className="list">
                    {teamLoading && <span>Loading team...</span>}
                    {!teamLoading && !teamUsers.length && <span>No team members yet.</span>}
                    {!teamLoading &&
                      teamUsers.map((user) => (
                        <div className="list-item" key={user.id}>
                          <div>
                            <strong>{user.name || user.email}</strong>
                            <span>
                              {(roleLabels[user.role] || user.role) + " - " + String(user.email || "")}
                              {user.phone ? " - " + String(user.phone) : ""}
                              {user.isBlocked ? " - Blocked" : ""}
                            </span>
                            <div className="station-browser-meta" style={{ marginTop: "8px" }}>
                              <span>
                                {Number(user?.verificationSummary?.verifiedCustomers || 0)} verified customers
                              </span>
                              <span>{formatLiters(user?.verificationSummary?.liters || 0)}</span>
                              <span>{formatMoney(user?.verificationSummary?.amount || 0, "ETB")}</span>
                              {(Array.isArray(user?.verificationSummary?.fuelBreakdown)
                                ? user.verificationSummary.fuelBreakdown
                                : []
                              )
                                .filter((item) => Number(item?.verifiedCustomers || 0) > 0)
                                .map((item) => (
                                  <span key={`${user.id}-${item.fuelType}`}>
                                    {formatFuelTypeLabel(item?.fuelType)}: {formatLiters(item?.liters || 0)} /
                                    {formatMoney(item?.amount || 0, "ETB")} /
                                    {formatPricePerLiter(item?.averageUnitPrice || 0, "ETB")}
                                  </span>
                                ))}
                              {user?.verificationSummary?.lastVerifiedAt ? (
                                <span>
                                  Last verified: {formatDateTime(user.verificationSummary.lastVerifiedAt)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <button className="btn small" type="button" onClick={() => startEditTeamUser(user)}>
                            Manage
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="card narrow">
                  <h3>Add team member</h3>
                  <p className="section-title">Station-scoped access</p>
                  <form onSubmit={handleCreateTeamUser} className="login-form">
                    <label>
                      Name
                      <input
                        value={createTeamForm.name}
                        onChange={(event) => setCreateTeamForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Full name"
                        required
                      />
                    </label>
                    <label>
                      Email
                      <input
                        value={createTeamForm.email}
                        onChange={(event) => setCreateTeamForm((prev) => ({ ...prev, email: event.target.value }))}
                        type="email"
                        placeholder="staff@station.com"
                        required
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        value={createTeamForm.phone}
                        onChange={(event) => setCreateTeamForm((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="+2519... (optional)"
                      />
                    </label>
                    <label>
                      Password
                      <input
                        value={createTeamForm.password}
                        onChange={(event) => setCreateTeamForm((prev) => ({ ...prev, password: event.target.value }))}
                        type="password"
                        placeholder="StrongP@ssw0rd"
                        required
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={createTeamForm.role}
                        onChange={(event) => setCreateTeamForm((prev) => ({ ...prev, role: event.target.value }))}
                      >
                        {allowedTeamRoles.includes("staff") && <option value="staff">Staff</option>}
                        {allowedTeamRoles.includes("station_manager") && (
                          <option value="station_manager">Station Manager</option>
                        )}
                      </select>
                    </label>

                    {createTeamError && <span className="error-text">{createTeamError}</span>}
                    {createTeamStatus && <span className="status-banner">{createTeamStatus}</span>}

                    <button className="btn alt" type="submit" disabled={isCreatingTeam}>
                      {isCreatingTeam ? "Creating..." : "Create user"}
                    </button>
                    <small>Password must include upper/lower/number/special and be 8+ chars.</small>
                  </form>
                </div>

                {editTeamForm && (
                  <div className="card full">
                    <div className="topbar">
                      <div>
                        <h3>Manage team member</h3>
                        <p className="section-title">{editTeamForm.email || editTeamUserId}</p>
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button
                          className="btn"
                          type="button"
                          onClick={handleForceLogoutTeamUser}
                          disabled={isSavingTeam}
                        >
                          Force logout
                        </button>
                        <button className="btn alt" type="button" onClick={handleToggleTeamBlock} disabled={isSavingTeam}>
                          {editTeamForm.isBlocked ? "Unblock user" : "Block user"}
                        </button>
                        <button className="btn" type="button" onClick={stopEditTeamUser} disabled={isSavingTeam}>
                          Close
                        </button>
                      </div>
                    </div>

                    {selectedTeamUser ? (
                      <div className="metrics">
                        <div className="metric">
                          <span>Verified customers</span>
                          <strong>{Number(selectedTeamUser?.verificationSummary?.verifiedCustomers || 0)}</strong>
                        </div>
                        <div className="metric">
                          <span>Total liters</span>
                          <strong>{formatLiters(selectedTeamUser?.verificationSummary?.liters || 0)}</strong>
                        </div>
                        <div className="metric">
                          <span>Total amount</span>
                          <strong>{formatMoney(selectedTeamUser?.verificationSummary?.amount || 0, "ETB")}</strong>
                        </div>
                        <div className="metric">
                          <span>Last verified</span>
                          <strong>{formatDateTime(selectedTeamUser?.verificationSummary?.lastVerifiedAt)}</strong>
                        </div>
                      </div>
                    ) : null}

                    <form onSubmit={handleSaveTeamUser} className="form-row" style={{ alignItems: "end" }}>
                      <label>
                        Name
                        <input
                          value={editTeamForm.name}
                          onChange={(event) =>
                            setEditTeamForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                          }
                          required
                        />
                      </label>
                      <label>
                        Email
                        <input
                          value={editTeamForm.email}
                          onChange={(event) =>
                            setEditTeamForm((prev) => (prev ? { ...prev, email: event.target.value } : prev))
                          }
                          type="email"
                          required
                        />
                      </label>
                      <label>
                        Phone
                        <input
                          value={editTeamForm.phone}
                          onChange={(event) =>
                            setEditTeamForm((prev) => (prev ? { ...prev, phone: event.target.value } : prev))
                          }
                        />
                      </label>
                      <label>
                        Role
                        <select
                          value={editTeamForm.role}
                          onChange={(event) =>
                            setEditTeamForm((prev) => (prev ? { ...prev, role: event.target.value } : prev))
                          }
                        >
                          {allowedTeamRoles.includes("staff") && <option value="staff">Staff</option>}
                          {allowedTeamRoles.includes("station_manager") && (
                            <option value="station_manager">Station Manager</option>
                          )}
                        </select>
                      </label>
                      <button className="btn alt" type="submit" disabled={isSavingTeam}>
                        {isSavingTeam ? "Saving..." : "Save changes"}
                      </button>
                    </form>

                    {editTeamError && <span className="error-text">{editTeamError}</span>}
                    {editTeamStatus && <span className="status-banner">{editTeamStatus}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {active === "settings" && (
          <div className="grid">
            {!isStationExec ? (
              <div className="card full">
                <h3>Station settings</h3>
                <p className="section-title">Station manager or higher</p>
                <p>You do not have permission to edit station profile settings.</p>
              </div>
            ) : (
              <>
                {canManageStations && (
                  <div className="card full">
                    <h3>Create station</h3>
                    <p className="section-title">Admin station creation + fuel price, payout, and payment setup</p>

                    <form onSubmit={handleCreateStation}>
                      <div className="form-row">
                        <label>
                          Station name
                          <input
                            type="text"
                            value={createStationForm.name}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, name: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          Address
                          <input
                            type="text"
                            value={createStationForm.address}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, address: event.target.value }))
                            }
                            required
                          />
                        </label>
                        <label>
                          Manager contact
                          <input
                            type="text"
                            value={createStationForm.contact}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, contact: event.target.value }))
                            }
                            placeholder="+2519... (optional)"
                          />
                        </label>
                        <label>
                          Latitude
                          <input
                            type="number"
                            step="any"
                            value={createStationForm.latitude}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, latitude: event.target.value }))
                            }
                            placeholder="8.9806"
                            required
                          />
                        </label>
                        <label>
                          Longitude
                          <input
                            type="number"
                            step="any"
                            value={createStationForm.longitude}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, longitude: event.target.value }))
                            }
                            placeholder="38.7578"
                            required
                          />
                        </label>
                        <label>
                          Station type
                          <select
                            value={createStationForm.stationType}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, stationType: event.target.value }))
                            }
                          >
                            <option value="fuel">Fuel station</option>
                            <option value="electric">Electric station</option>
                          </select>
                        </label>
                        <label>
                          Fuel status
                          <select
                            value={createStationForm.fuelStatus}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, fuelStatus: event.target.value }))
                            }
                          >
                            <option value="full">Full</option>
                            <option value="partial">Partial</option>
                            <option value="empty">Empty</option>
                          </select>
                        </label>
                        <label>
                          Gasoline price (ETB/L)
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={createStationForm.gasolinePrice}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, gasolinePrice: event.target.value }))
                            }
                            placeholder="95.00"
                          />
                        </label>
                        <label>
                          Diesel price (ETB/L)
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={createStationForm.dieselPrice}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, dieselPrice: event.target.value }))
                            }
                            placeholder="92.00"
                          />
                        </label>
                        <label>
                          Other fuel price (ETB/L)
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={createStationForm.otherPrice}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, otherPrice: event.target.value }))
                            }
                            placeholder="90.00"
                          />
                        </label>
                        <label>
                          Station status
                          <select
                            value={createStationForm.isActive ? "open" : "inactive"}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({
                                ...prev,
                                isActive: event.target.value === "open"
                              }))
                            }
                          >
                            <option value="open">Open</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                        {isSuperAdmin ? (
                          organizationOptions.length ? (
                            <label>
                              Organization
                              <select
                                value={createStationForm.organizationId}
                                onChange={(event) =>
                                  setCreateStationForm((prev) => ({
                                    ...prev,
                                    organizationId: event.target.value
                                  }))
                                }
                              >
                                <option value="">No organization</option>
                                {organizationOptions.map((item) => (
                                  <option key={String(item.id || item._id || item.value)} value={String(item.id || item._id || item.value)}>
                                    {item.name || item.label || item.email || String(item.id || item._id || item.value)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label>
                              Organization ID
                              <input
                                type="text"
                                value={createStationForm.organizationId}
                                onChange={(event) =>
                                  setCreateStationForm((prev) => ({
                                    ...prev,
                                    organizationId: event.target.value
                                  }))
                                }
                                placeholder="Optional organization ObjectId"
                              />
                            </label>
                          )
                        ) : null}
                        <label>
                          Region
                          {createStationRegionOptions.length ? (
                            <select
                              value={createStationForm.regionId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({
                                  ...prev,
                                  regionId: event.target.value,
                                  cityId: "",
                                  woredaId: ""
                                }))
                              }
                            >
                              <option value="">Select region</option>
                              {createStationRegionOptions.map((item) => (
                                <option key={String(item.id || item._id || "")} value={String(item.id || item._id || "")}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={createStationForm.regionId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({ ...prev, regionId: event.target.value }))
                              }
                              placeholder="Optional region ObjectId"
                            />
                          )}
                        </label>
                        <label>
                          City
                          {createStationCityOptions.length ? (
                            <select
                              value={createStationForm.cityId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({
                                  ...prev,
                                  cityId: event.target.value,
                                  woredaId: ""
                                }))
                              }
                              disabled={!createStationForm.regionId}
                            >
                              <option value="">
                                {createStationForm.regionId ? "Select city" : "Select region first"}
                              </option>
                              {createStationCityOptions.map((item) => (
                                <option key={String(item.id || item._id || "")} value={String(item.id || item._id || "")}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={createStationForm.cityId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({ ...prev, cityId: event.target.value }))
                              }
                              placeholder="Optional city ObjectId"
                            />
                          )}
                        </label>
                        <label>
                          Woreda
                          {createStationWoredaOptions.length ? (
                            <select
                              value={createStationForm.woredaId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({ ...prev, woredaId: event.target.value }))
                              }
                              disabled={!createStationForm.cityId}
                            >
                              <option value="">
                                {createStationForm.cityId ? "Select woreda" : "Select city first"}
                              </option>
                              {createStationWoredaOptions.map((item) => (
                                <option key={String(item.id || item._id || "")} value={String(item.id || item._id || "")}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={createStationForm.woredaId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({ ...prev, woredaId: event.target.value }))
                              }
                              placeholder="Optional woreda ObjectId"
                            />
                          )}
                        </label>
                        <label>
                          Branch ID
                          <input
                            type="text"
                            value={createStationForm.branchId}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({ ...prev, branchId: event.target.value }))
                            }
                            placeholder="Optional branch ObjectId"
                          />
                        </label>
                        {isSuperAdmin ? (
                          <label>
                            Chapa subaccount ID
                            <input
                              type="text"
                              value={createStationForm.chapaSubaccountId}
                              onChange={(event) =>
                                setCreateStationForm((prev) => ({
                                  ...prev,
                                  chapaSubaccountId: event.target.value
                                }))
                              }
                              placeholder="2561547c-0464-4359-9f82-4d6b28d66276"
                            />
                          </label>
                        ) : null}
                        <label>
                          Payment provider
                          <input
                            type="text"
                            value={createStationForm.paymentProviderName}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({
                                ...prev,
                                paymentProviderName: event.target.value
                              }))
                            }
                            placeholder="Telebirr, CBE Birr, bank name..."
                          />
                        </label>
                        <label>
                          Payment phone
                          <input
                            type="text"
                            value={createStationForm.paymentPhoneNumber}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({
                                ...prev,
                                paymentPhoneNumber: event.target.value
                              }))
                            }
                            placeholder="+2519... (optional)"
                          />
                        </label>
                        <label>
                          Account name
                          <input
                            type="text"
                            value={createStationForm.paymentAccountName}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({
                                ...prev,
                                paymentAccountName: event.target.value
                              }))
                            }
                            placeholder="Station or business account name"
                          />
                        </label>
                        <label>
                          Account number
                          <input
                            type="text"
                            value={createStationForm.paymentAccountNumber}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({
                                ...prev,
                                paymentAccountNumber: event.target.value
                              }))
                            }
                            placeholder="Bank or wallet account number"
                          />
                        </label>
                        <label>
                          Customer payment note
                          <textarea
                            value={createStationForm.paymentInstructions}
                            onChange={(event) =>
                              setCreateStationForm((prev) => ({
                                ...prev,
                                paymentInstructions: event.target.value
                              }))
                            }
                            placeholder="Shown on the customer page so they do not need to remember station payment details."
                          />
                        </label>
                      </div>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                        <button className="btn alt" type="submit" disabled={isCreatingStation}>
                          {isCreatingStation ? "Creating..." : "Create station"}
                        </button>
                        <button className="btn" type="button" onClick={resetCreateStationForm} disabled={isCreatingStation}>
                          Reset
                        </button>
                      </div>
                    </form>

                    {createStationError && <span className="error-text">{createStationError}</span>}
                    {createStationStatus && <span className="status-banner">{createStationStatus}</span>}
                  </div>
                )}

                <div className="card wide">
                  <h3>{canManageStations ? "Edit selected station" : "Station profile"}</h3>
                  <p className="section-title">Public details, customer fuel prices, payment details, and Chapa setup</p>

                  {!stationForm ? (
                    <span>Loading station profile...</span>
                  ) : (
                    <>
                      <form onSubmit={handleSaveStationProfile}>
                        <div className="form-row">
                          <label>
                            Station name
                            <input
                              type="text"
                              value={stationForm.name}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) => (prev ? { ...prev, name: event.target.value } : prev));
                              }}
                              required
                            />
                          </label>
                          <label>
                            Address
                            <input
                              type="text"
                              value={stationForm.address}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) => (prev ? { ...prev, address: event.target.value } : prev));
                              }}
                              required
                            />
                          </label>
                          <label>
                            Manager contact
                            <input
                              type="text"
                              value={stationForm.contact}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) => (prev ? { ...prev, contact: event.target.value } : prev));
                              }}
                              placeholder="+2519... (optional)"
                            />
                          </label>
                          <label>
                            Station type
                            <select
                              value={stationForm.stationType}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, stationType: event.target.value } : prev
                                );
                              }}
                            >
                              <option value="fuel">Fuel station</option>
                              <option value="electric">Electric station</option>
                            </select>
                          </label>
                          <label>
                            Gasoline price (ETB/L)
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={stationForm.gasolinePrice}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, gasolinePrice: event.target.value } : prev
                                );
                              }}
                              placeholder="95.00"
                            />
                          </label>
                          <label>
                            Diesel price (ETB/L)
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={stationForm.dieselPrice}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, dieselPrice: event.target.value } : prev
                                );
                              }}
                              placeholder="92.00"
                            />
                          </label>
                          <label>
                            Other fuel price (ETB/L)
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={stationForm.otherPrice}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, otherPrice: event.target.value } : prev
                                );
                              }}
                              placeholder="90.00"
                            />
                          </label>
                          {canEditChapaSubaccount ? (
                            <label>
                              Chapa subaccount ID
                              <input
                                type="text"
                                value={stationForm.chapaSubaccountId}
                                onChange={(event) => {
                                  setStationFormDirty(true);
                                  setStationForm((prev) =>
                                    prev ? { ...prev, chapaSubaccountId: event.target.value } : prev
                                  );
                                }}
                                placeholder="2561547c-0464-4359-9f82-4d6b28d66276"
                              />
                            </label>
                          ) : null}
                          <label>
                            Payment provider
                            <input
                              type="text"
                              value={stationForm.paymentProviderName}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, paymentProviderName: event.target.value } : prev
                                );
                              }}
                              placeholder="Telebirr, CBE Birr, bank name..."
                            />
                          </label>
                          <label>
                            Payment phone
                            <input
                              type="text"
                              value={stationForm.paymentPhoneNumber}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, paymentPhoneNumber: event.target.value } : prev
                                );
                              }}
                              placeholder="+2519... (optional)"
                            />
                          </label>
                          <label>
                            Account name
                            <input
                              type="text"
                              value={stationForm.paymentAccountName}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, paymentAccountName: event.target.value } : prev
                                );
                              }}
                              placeholder="Station or business account name"
                            />
                          </label>
                          <label>
                            Account number
                            <input
                              type="text"
                              value={stationForm.paymentAccountNumber}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, paymentAccountNumber: event.target.value } : prev
                                );
                              }}
                              placeholder="Bank or wallet account number"
                            />
                          </label>
                          <label>
                            Customer payment note
                            <textarea
                              value={stationForm.paymentInstructions}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, paymentInstructions: event.target.value } : prev
                                );
                              }}
                              placeholder="Shown on the customer page so they do not need to remember station payment details."
                            />
                          </label>
                          <label>
                            Station status
                            <select
                              value={stationForm.isActive ? "open" : "inactive"}
                              onChange={(event) => {
                                setStationFormDirty(true);
                                setStationForm((prev) =>
                                  prev ? { ...prev, isActive: event.target.value === "open" } : prev
                                );
                              }}
                            >
                              <option value="open">Open</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </label>
                        </div>

                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                          <button className="btn alt" type="submit" disabled={isSavingStation || !stationFormDirty}>
                            {isSavingStation ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={resetStationProfileForm}
                            disabled={isSavingStation || !stationFormDirty}
                          >
                            Reset
                          </button>
                        </div>
                      </form>

                      {stationFormError && <span className="error-text">{stationFormError}</span>}
                      {stationFormStatus && <span className="status-banner">{stationFormStatus}</span>}
                    </>
                  )}
                </div>

                <div className="card narrow">
                  <h3>Station info</h3>
                  <p className="section-title">Read-only</p>
                  <div className="list">
                    <div className="list-item">
                      <div>
                        <strong>Station ID</strong>
                        <span>{station?.id || stationId || "--"}</span>
                      </div>
                    </div>
                    <div className="list-item">
                      <div>
                        <strong>Chapa subaccount ID</strong>
                        <span>{station?.chapaSubaccountId || "Not set"}</span>
                      </div>
                    </div>
                    <div className="list-item">
                      <div>
                        <strong>Profile updated</strong>
                        <span>{formatDateTime(station?.updatedAt)}</span>
                      </div>
                    </div>
                    <div className="list-item">
                      <div>
                        <strong>Gasoline price</strong>
                        <span>{formatPricePerLiter(station?.fuelPrices?.gasoline ?? station?.gasolinePrice)}</span>
                      </div>
                    </div>
                    <div className="list-item">
                      <div>
                        <strong>Diesel price</strong>
                        <span>{formatPricePerLiter(station?.fuelPrices?.diesel ?? station?.dieselPrice)}</span>
                      </div>
                    </div>
                    <div className="list-item">
                      <div>
                        <strong>Other fuel price</strong>
                        <span>{formatPricePerLiter(station?.fuelPrices?.other ?? station?.otherPrice)}</span>
                      </div>
                    </div>
                    <div className="list-item">
                      <div>
                        <strong>Fuel updated</strong>
                        <span>{formatDateTime(station?.fuelInventory?.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card full">
                  <h3>Integrations</h3>
                  <div className="list">
                    {[
                      { name: "POS system", status: "Planned with enterprise rollout" },
                      { name: "Pump telemetry", status: "Use after telemetry hardware onboarding" },
                      { name: "Sentry alerts", status: "Managed at platform level" }
                    ].map((item) => (
                      <div className="list-item" key={item.name}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.status}</span>
                        </div>
                        <span className="pill">Roadmap</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
