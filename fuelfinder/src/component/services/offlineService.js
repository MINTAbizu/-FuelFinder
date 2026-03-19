import AsyncStorage from "@react-native-async-storage/async-storage";

const OFFLINE_ACTIONS_KEY = "ff_offline_actions_v1";
const OFFLINE_CACHE_INDEX_KEY = "ff_offline_cache_index_v1";
const OFFLINE_CACHE_KEY_PREFIX = "ff_offline_cache:";

const offlineStatusListeners = new Set();
const pendingActionsListeners = new Set();

let currentOfflineState = false;
let flushPromise = null;

function safeParse(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function normalizeForKey(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForKey(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = normalizeForKey(value[key]);
        return accumulator;
      }, {});
  }

  return value ?? null;
}

function buildActionId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadOfflineCacheIndex() {
  const raw = await AsyncStorage.getItem(OFFLINE_CACHE_INDEX_KEY);
  const index = safeParse(raw, []);
  return Array.isArray(index) ? index : [];
}

async function saveOfflineCacheIndex(index) {
  await AsyncStorage.setItem(OFFLINE_CACHE_INDEX_KEY, JSON.stringify(Array.from(new Set(index))));
}

async function registerOfflineCacheKey(cacheKey) {
  if (!cacheKey) return;

  const index = await loadOfflineCacheIndex();
  if (index.includes(cacheKey)) return;
  await saveOfflineCacheIndex([...index, cacheKey]);
}

function notifyOfflineStatusListeners() {
  offlineStatusListeners.forEach((listener) => {
    try {
      listener(currentOfflineState);
    } catch {
      // Ignore listener failures so offline state stays usable.
    }
  });
}

async function notifyPendingActionsListeners() {
  const actions = await getPendingOfflineActions();
  pendingActionsListeners.forEach((listener) => {
    try {
      listener(actions);
    } catch {
      // Ignore listener failures so pending action updates still flow to others.
    }
  });
}

export function isNetworkError(error) {
  if (!error) return false;
  if (error.response) return false;

  const code = String(error.code || "").toUpperCase();
  if (["ECONNABORTED", "ERR_NETWORK", "ENOTFOUND"].includes(code)) {
    return true;
  }

  if (error.request) {
    return true;
  }

  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("network error") ||
    message.includes("network request failed") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("socket")
  );
}

export function getCurrentOfflineState() {
  return currentOfflineState;
}

export function markOffline() {
  if (currentOfflineState) return;
  currentOfflineState = true;
  notifyOfflineStatusListeners();
}

export function markOnline() {
  if (!currentOfflineState) return;
  currentOfflineState = false;
  notifyOfflineStatusListeners();
}

export function subscribeToOfflineStatus(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  offlineStatusListeners.add(listener);
  return () => {
    offlineStatusListeners.delete(listener);
  };
}

export function subscribeToPendingOfflineActions(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  pendingActionsListeners.add(listener);
  return () => {
    pendingActionsListeners.delete(listener);
  };
}

export function buildOfflineCacheKey(namespace, params = {}) {
  return `${OFFLINE_CACHE_KEY_PREFIX}${String(namespace || "request").trim()}:${JSON.stringify(
    normalizeForKey(params)
  )}`;
}

export async function writeCachedOfflineData(cacheKey, data) {
  if (!cacheKey) return data;

  await AsyncStorage.setItem(
    cacheKey,
    JSON.stringify({
      savedAt: Date.now(),
      data,
    })
  );
  await registerOfflineCacheKey(cacheKey);
  return data;
}

export async function readCachedOfflineData(cacheKey, maxAgeMs = 0) {
  if (!cacheKey) return null;

  const raw = await AsyncStorage.getItem(cacheKey);
  const parsed = safeParse(raw, null);
  if (!parsed || parsed.data === undefined) return null;

  if (maxAgeMs > 0 && Number(parsed.savedAt || 0) <= Date.now() - maxAgeMs) {
    return null;
  }

  return parsed.data;
}

export async function requestWithOfflineCache({ cacheKey, maxAgeMs = 0, request }) {
  try {
    const data = await request();
    await writeCachedOfflineData(cacheKey, data);
    markOnline();
    return data;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    markOffline();
    const cached = await readCachedOfflineData(cacheKey, maxAgeMs);
    if (cached !== null) {
      return cached;
    }

    throw error;
  }
}

export async function getPendingOfflineActions() {
  const raw = await AsyncStorage.getItem(OFFLINE_ACTIONS_KEY);
  const actions = safeParse(raw, []);
  return Array.isArray(actions) ? actions : [];
}

async function savePendingOfflineActions(actions) {
  await AsyncStorage.setItem(
    OFFLINE_ACTIONS_KEY,
    JSON.stringify(Array.isArray(actions) ? actions : [])
  );
  await notifyPendingActionsListeners();
}

export async function enqueueOfflineAction(action) {
  const actions = await getPendingOfflineActions();
  const nextAction = {
    id: buildActionId(),
    type: String(action?.type || "").trim(),
    payload: action?.payload ?? null,
    createdAt: new Date().toISOString(),
  };

  await savePendingOfflineActions([...actions, nextAction]);
  markOffline();
  return nextAction;
}

export async function clearOfflineStorage() {
  const cacheKeys = await loadOfflineCacheIndex();
  const keysToRemove = [OFFLINE_ACTIONS_KEY, OFFLINE_CACHE_INDEX_KEY, ...cacheKeys].filter(Boolean);
  if (keysToRemove.length) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
  await notifyPendingActionsListeners();
  markOnline();
}

export async function flushPendingOfflineActions(processors = {}) {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    const actions = await getPendingOfflineActions();
    if (!actions.length) {
      markOnline();
      return { processed: 0, remaining: 0 };
    }

    const remaining = [];
    let processed = 0;
    let stopOnNetworkFailure = false;

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const processor = processors[String(action?.type || "").trim()];

      if (stopOnNetworkFailure) {
        remaining.push(action);
        continue;
      }

      if (typeof processor !== "function") {
        remaining.push(action);
        continue;
      }

      try {
        await processor(action);
        processed += 1;
        markOnline();
      } catch (error) {
        if (isNetworkError(error)) {
          markOffline();
          stopOnNetworkFailure = true;
          remaining.push(action);
          continue;
        }

        processed += 1;
      }
    }

    await savePendingOfflineActions(remaining);
    return { processed, remaining: remaining.length };
  })();

  try {
    return await flushPromise;
  } finally {
    flushPromise = null;
  }
}
