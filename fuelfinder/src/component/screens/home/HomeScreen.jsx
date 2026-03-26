import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../services/api";
import { loadSavedStations, toggleSavedStation } from "../../services/accountStorage";
import PromotionCarousel from "./PromotionCarousel";

const DEFAULT_REGION = {
  latitude: 8.9806,
  longitude: 38.7578,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};
const STATUS_FILTERS = ["all", "available", "limited", "empty"];
const FUEL_FILTERS = ["any", "gasoline", "diesel", "other"];
const SORT_OPTIONS = ["distance", "queue", "name"];
const HOME_STATIONS_CACHE_KEY = "ff_home_nearby_stations_v1";
const HOME_STATIONS_CACHE_TTL_MS = 1000 * 60 * 10;
const HOME_STATIONS_MEMORY_TTL_MS = 1000 * 45;
const HOME_MANAGER_FUEL_TTL_MS = 1000 * 15;
const LOCATION_REFRESH_THRESHOLD_DEGREES = 0.01;
const nearbyStationsMemoryCache = new Map();
const nearbyStationsInflightRequests = new Map();
const managerFuelSnapshotCache = new Map();

// Translations are handled by i18next (`src/i18n/locales/*.json`).

function buildNearbyStationsCacheKey(basePoint, radiusMeters = 12000) {
  const lat = Number(basePoint?.latitude);
  const lon = Number(basePoint?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";

  return [lat.toFixed(3), lon.toFixed(3), Math.round(Number(radiusMeters) || 0)].join(":");
}

function getNearbyStationsFromMemory(cacheKey) {
  const entry = nearbyStationsMemoryCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    nearbyStationsMemoryCache.delete(cacheKey);
    return null;
  }
  return entry.stations;
}

function setNearbyStationsInMemory(cacheKey, stations) {
  if (!cacheKey) return;

  nearbyStationsMemoryCache.set(cacheKey, {
    stations,
    expiresAt: Date.now() + HOME_STATIONS_MEMORY_TTL_MS,
  });
}

async function readCachedNearbyStations() {
  try {
    const raw = await AsyncStorage.getItem(HOME_STATIONS_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.savedAt <= Date.now() - HOME_STATIONS_CACHE_TTL_MS) {
      return null;
    }

    if (!Array.isArray(parsed.stations)) {
      return null;
    }

    if (parsed.cacheKey) {
      setNearbyStationsInMemory(parsed.cacheKey, parsed.stations);
    }

    return parsed;
  } catch {
    return null;
  }
}

async function saveCachedNearbyStations(basePoint, stations, radiusMeters = 12000) {
  const cacheKey = buildNearbyStationsCacheKey(basePoint, radiusMeters);
  if (!cacheKey || !Array.isArray(stations)) return;

  setNearbyStationsInMemory(cacheKey, stations);

  try {
    await AsyncStorage.setItem(
      HOME_STATIONS_CACHE_KEY,
      JSON.stringify({
        cacheKey,
        savedAt: Date.now(),
        center: {
          latitude: Number(basePoint?.latitude || 0),
          longitude: Number(basePoint?.longitude || 0),
        },
        radiusMeters,
        stations,
      })
    );
  } catch {
    // Ignore cache persistence failures and keep the live request path responsive.
  }
}

const toDistanceKm = (from, to) => {
  if (!from || !to) return null;
  const R = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

async function fetchNearbyFuelStations(basePoint, radiusMeters = 12000, { forceRefresh = false } = {}) {
  const lat = Number(basePoint?.latitude);
  const lon = Number(basePoint?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const cacheKey = buildNearbyStationsCacheKey(basePoint, radiusMeters);
  if (!forceRefresh) {
    const cachedStations = getNearbyStationsFromMemory(cacheKey);
    if (cachedStations) {
      return cachedStations;
    }
  }

  if (nearbyStationsInflightRequests.has(cacheKey)) {
    return nearbyStationsInflightRequests.get(cacheKey);
  }

  const requestPromise = api
    .get("/map/nearby-fuel", { params: { lat, lon, radius: radiusMeters } })
    .then(({ data }) => {
      const nextStations = Array.isArray(data?.stations) ? data.stations : [];
      setNearbyStationsInMemory(cacheKey, nextStations);
      return nextStations;
    });

  nearbyStationsInflightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    nearbyStationsInflightRequests.delete(cacheKey);
  }
}

async function fetchStationPromotions(stationIds, limit = 6) {
  const filteredIds = Array.from(
    new Set(
      (stationIds || [])
        .map((value) => String(value || "").trim())
        .filter((value) => /^[a-fA-F0-9]{24}$/.test(value))
    )
  );

  if (!filteredIds.length) return [];

  const { data } = await api.get("/map/promotions", {
    params: {
      stationIds: filteredIds.join(","),
      limit
    }
  });
  return Array.isArray(data?.promotions) ? data.promotions : [];
}

async function fetchBrowseCities(params = {}) {
  const { data } = await api.get("/map/cities", {
    params: {
      q: String(params?.q || "").trim() || undefined,
      limit: params?.limit || 20
    }
  });
  return Array.isArray(data?.cities) ? data.cities : [];
}

async function fetchDirectoryStations(params = {}) {
  const { data } = await api.get("/map/stations", {
    params: {
      cityId: String(params?.cityId || "").trim() || undefined,
      regionId: String(params?.regionId || "").trim() || undefined,
      q: String(params?.q || "").trim() || undefined,
      limit: params?.limit || 120
    }
  });
  return Array.isArray(data?.stations) ? data.stations : [];
}

function statusLabel(t, status) {
  if (status === "available") return t("homeScreen.status.available");
  if (status === "limited") return t("homeScreen.status.limited");
  if (status === "empty") return t("homeScreen.status.empty");
  return t("homeScreen.status.all");
}

function sortLabel(t, value) {
  if (value === "queue") return t("homeScreen.sort.shortestQueue");
  if (value === "name") return t("homeScreen.sort.az");
  return t("homeScreen.sort.nearest");
}

function fuelLabel(t, value) {
  if (value === "gasoline") return t("homeScreen.fuel.gasoline");
  if (value === "diesel") return t("homeScreen.fuel.diesel");
  if (value === "other") return t("homeScreen.fuel.other");
  return t("homeScreen.fuel.any");
}

function formatDistance(t, distanceKm) {
  if (distanceKm == null) return "N/A";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} ${t("homeScreen.units.meters")}`;
  return `${distanceKm.toFixed(1)} ${t("homeScreen.units.km")}`;
}

function markerColor(status) {
  if (status === "available") return "green";
  if (status === "limited") return "orange";
  if (status === "empty") return "red";
  return "gray";
}

function isObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());
}

function normalizeManagerFuelStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "full" || status === "available") return "available";
  if (status === "partial" || status === "limited") return "limited";
  if (status === "empty") return "empty";
  return "";
}

function getStationIdentity(station) {
  return String(station?.stationId || station?._id || station?.id || "").trim();
}

function getStationRenderKey(station) {
  const identity = getStationIdentity(station);
  const externalId = String(station?.id || "").trim();
  if (identity && externalId && identity !== externalId) {
    return `${identity}:${externalId}`;
  }
  return identity;
}

function toSavedStationMap(stations) {
  return (stations || []).reduce((accumulator, station) => {
    const key = String(station?.id || "").trim();
    if (key) {
      accumulator[key] = true;
    }
    return accumulator;
  }, {});
}

function getStationQueueLength(station) {
  const queueLength = Number(station?.queue_length ?? station?.queueLength ?? 0);
  return Number.isFinite(queueLength) && queueLength >= 0 ? queueLength : 0;
}

function normalizeRouteStation(station) {
  const latitude = Number(station?.latitude);
  const longitude = Number(station?.longitude);
  return {
    ...station,
    id: getStationIdentity(station) || String(station?.id || "").trim(),
    name: String(station?.name || "Fuel Station").trim() || "Fuel Station",
    address: String(station?.address || "").trim(),
    fuel_status: String(station?.fuel_status || station?.fuelStatus || "").trim(),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    queue_length: getStationQueueLength(station),
  };
}

function getCachedManagerFuelSnapshot(stationId) {
  const key = String(stationId || "").trim();
  if (!key) return null;

  const entry = managerFuelSnapshotCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    managerFuelSnapshotCache.delete(key);
    return null;
  }
  return entry.snapshot;
}

function setCachedManagerFuelSnapshot(stationId, snapshot) {
  const key = String(stationId || "").trim();
  if (!key || !snapshot) return;

  managerFuelSnapshotCache.set(key, {
    snapshot,
    expiresAt: Date.now() + HOME_MANAGER_FUEL_TTL_MS,
  });
}

async function fetchStationManagerFuelSnapshot(stationId, { forceRefresh = false } = {}) {
  const normalizedStationId = String(stationId || "").trim();
  if (!isObjectId(normalizedStationId)) return null;

  if (!forceRefresh) {
    const cached = getCachedManagerFuelSnapshot(normalizedStationId);
    if (cached) return cached;
  }

  const { data } = await api.get(`/queue/station/${normalizedStationId}/fuel-status`);
  const snapshot = {
    stationId: normalizedStationId,
    fuel_status: normalizeManagerFuelStatus(data?.fuelStatus),
    fuelInventory: {
      gasolineLiters: Number(data?.fuelInventory?.gasolineLiters || 0),
      dieselLiters: Number(data?.fuelInventory?.dieselLiters || 0),
      otherLiters: Number(data?.fuelInventory?.otherLiters || 0),
      updatedAt: data?.fuelInventory?.updatedAt || null,
    },
  };

  setCachedManagerFuelSnapshot(normalizedStationId, snapshot);
  return snapshot;
}

function applyManagerFuelSnapshot(station, snapshot) {
  if (!snapshot) return station;

  return {
    ...station,
    fuel_status: snapshot.fuel_status || String(station?.fuel_status || "").trim(),
    fuelInventory: {
      ...(station?.fuelInventory || {}),
      ...(snapshot?.fuelInventory || {}),
    },
  };
}

export default function HomeScreen({ navigation, route }) {
  const { t } = useLanguage();

  const mapRef = useRef(null);
  const listRef = useRef(null);
  const watcherRef = useRef(null);
  const loadedRef = useRef(false);
  const handledRouteRequestRef = useRef("");

  const [location, setLocation] = useState(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [mapCenter, setMapCenter] = useState({
    latitude: DEFAULT_REGION.latitude,
    longitude: DEFAULT_REGION.longitude,
  });
  const [browseMode, setBrowseMode] = useState("nearby");
  const [cityQuery, setCityQuery] = useState("");
  const [cityOptions, setCityOptions] = useState([]);
  const [cityOptionsLoading, setCityOptionsLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fuelFilter, setFuelFilter] = useState("any");
  const [sortBy, setSortBy] = useState("distance");
  const [stations, setStations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingStations, setLoadingStations] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [stationsError, setStationsError] = useState("");
  const [centerNotice, setCenterNotice] = useState("");
  const [routingError, setRoutingError] = useState("");
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const [activeRouteStationId, setActiveRouteStationId] = useState("");
  const [routeDestinationStation, setRouteDestinationStation] = useState(null);
  const [pendingRouteStation, setPendingRouteStation] = useState(null);
  const [savedStationIds, setSavedStationIds] = useState({});
  const [promotions, setPromotions] = useState([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [promotionIndex, setPromotionIndex] = useState(0);
  const [liveStationSnapshots, setLiveStationSnapshots] = useState({});
  const deferredCityQuery = useDeferredValue(cityQuery);
  const deferredSearchText = useDeferredValue(searchText);

  const refreshSavedStations = useCallback(async () => {
    try {
      const nextSavedStations = await loadSavedStations();
      setSavedStationIds(toSavedStationMap(nextSavedStations));
    } catch (_error) {
      // Ignore local saved-station refresh failures and keep the screen usable.
    }
  }, []);

  const loadBrowseCities = useCallback(
    async (query = "") => {
      setCityOptionsLoading(true);
      try {
        const nextCities = await fetchBrowseCities({
          q: query,
          limit: query ? 30 : 18
        });
        setCityOptions(nextCities);
      } catch (error) {
        console.error("[Stations:loadBrowseCities]", error?.response?.status, error?.response?.data, error?.message);
      } finally {
        setCityOptionsLoading(false);
      }
    },
    []
  );

  const loadCityStations = useCallback(
    async (city) => {
      const cityId = String(city?.id || "").trim();
      if (!cityId) {
        setStations([]);
        return;
      }

      setLoadingStations(true);
      setStationsError("");
      try {
        const nextStations = await fetchDirectoryStations({
          cityId,
          limit: 220
        });
        setStations(nextStations);

        const centroid = buildCoordinateCentroid(nextStations);
        const cityLatitude = Number(city?.latitude);
        const cityLongitude = Number(city?.longitude);
        if (centroid) {
          setMapCenter({
            latitude: centroid.latitude,
            longitude: centroid.longitude
          });
        } else if (Number.isFinite(cityLatitude) && Number.isFinite(cityLongitude)) {
          setMapCenter({
            latitude: cityLatitude,
            longitude: cityLongitude
          });
        }

        if (!nextStations.length) {
          setStationsError(
            t("cityStationsEmpty", {
              defaultValue: "No stations are assigned to this city yet."
            })
          );
        }
      } catch (error) {
        setStationsError(
          t("cityStationsLoadFail", {
            defaultValue: "Failed to load stations for the selected city."
          })
        );
        console.error("[Stations:loadCityStations]", error?.response?.status, error?.response?.data, error?.message);
      } finally {
        setLoadingStations(false);
      }
    },
    [t]
  );

  const handleSelectCity = useCallback(
    async (city) => {
      setSelectedCity(city);
      setRouteCoords([]);
      setRouteSummary(null);
      setActiveRouteStationId("");
      setRouteDestinationStation(null);
      setPendingRouteStation(null);
      setRoutingError("");
      await loadCityStations(city);
    },
    [loadCityStations]
  );

  useFocusEffect(
    useCallback(() => {
      refreshSavedStations();
      return undefined;
    }, [refreshSavedStations])
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = await readCachedNearbyStations();
      if (!active || !cached?.stations?.length) return;

      setStations((current) => (current.length ? current : cached.stations));
      const cachedLat = Number(cached?.center?.latitude);
      const cachedLon = Number(cached?.center?.longitude);
      if (Number.isFinite(cachedLat) && Number.isFinite(cachedLon)) {
        setMapCenter({
          latitude: cachedLat,
          longitude: cachedLon,
        });
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadBrowseCities(deferredCityQuery);
  }, [deferredCityQuery, loadBrowseCities]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (mounted) setHasLocationPermission(false);
          if (mounted) setBrowseMode("city");
          if (mounted) setLocationError(t("homeScreen.location.denied"));
          return;
        }

        if (mounted) setHasLocationPermission(true);
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 1000 * 60 * 15,
          requiredAccuracy: 250,
        });
        if (mounted && lastKnown?.coords) {
          setLocation(lastKnown.coords);
          setMapCenter({
            latitude: Number(lastKnown.coords.latitude || DEFAULT_REGION.latitude),
            longitude: Number(lastKnown.coords.longitude || DEFAULT_REGION.longitude),
          });
        }

        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted) {
          const shouldRefreshFromCurrent =
            !lastKnown?.coords ||
            Math.abs(Number(lastKnown.coords.latitude || 0) - Number(current.coords.latitude || 0)) >
              LOCATION_REFRESH_THRESHOLD_DEGREES ||
            Math.abs(Number(lastKnown.coords.longitude || 0) - Number(current.coords.longitude || 0)) >
              LOCATION_REFRESH_THRESHOLD_DEGREES;

          if (shouldRefreshFromCurrent) {
            loadedRef.current = false;
          }

          setLocation(current.coords);
          setMapCenter({
            latitude: Number(current.coords.latitude || DEFAULT_REGION.latitude),
            longitude: Number(current.coords.longitude || DEFAULT_REGION.longitude),
          });
        }

        watcherRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 30 },
          (pos) => mounted && setLocation(pos.coords)
        );
      } catch (_error) {
        if (mounted) {
          setHasLocationPermission(false);
          setLocationError(t("homeScreen.location.fail"));
        }
      }
    })();

    return () => {
      mounted = false;
      watcherRef.current?.remove?.();
      watcherRef.current = null;
    };
  }, [t]);

  const loadNearbyStations = useCallback(async ({ forceRefresh = false } = {}) => {
    const basePoint = location;
    if (!basePoint) {
      const cached = await readCachedNearbyStations();
      if (cached?.stations?.length) {
        setStations(cached.stations);
        setStationsError("");
        return;
      }

      setStations([]);
      setStationsError(t("homeScreen.location.denied"));
      return;
    }

    setLoadingStations(true);
    setStationsError("");
    try {
      const next = await fetchNearbyFuelStations(basePoint, 12000, { forceRefresh });
      setStations(next);
      void saveCachedNearbyStations(basePoint, next, 12000);
    } catch (error) {
      const cached = await readCachedNearbyStations();
      if (cached?.stations?.length) {
        setStations(cached.stations);
        setStationsError("");
      } else {
        setStationsError(t("homeScreen.stations.loadFail"));
      }
      console.error(
        "[Stations:loadNearbyStations:debug]",
        error?.response?.status,
        error?.response?.data,
        error?.message
      );
    } finally {
      setLoadingStations(false);
    }
  }, [location, t]);

  const handleBrowseModeChange = useCallback(
    async (nextMode) => {
      setBrowseMode(nextMode);
      setStationsError("");

      if (nextMode === "nearby") {
        if (location) {
          await loadNearbyStations({ forceRefresh: true });
        } else {
          setStations([]);
        }
        return;
      }

      if (selectedCity?.id) {
        await loadCityStations(selectedCity);
        return;
      }

      const fallbackCity = cityOptions[0];
      if (fallbackCity) {
        await handleSelectCity(fallbackCity);
      }
    },
    [cityOptions, handleSelectCity, loadCityStations, loadNearbyStations, location, selectedCity]
  );

  useEffect(() => {
    if (browseMode !== "nearby" || !location || loadedRef.current) return;
    loadedRef.current = true;
    loadNearbyStations();
  }, [browseMode, location, loadNearbyStations]);

  useEffect(() => {
    if (browseMode !== "city" || selectedCity || !cityOptions.length) return;
    void handleSelectCity(cityOptions[0]);
  }, [browseMode, cityOptions, handleSelectCity, selectedCity]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (browseMode === "city") {
        if (selectedCity?.id) {
          await loadCityStations(selectedCity);
        }
      } else {
        await loadNearbyStations({ forceRefresh: true });
      }
    } finally {
      setRefreshing(false);
    }
  }, [browseMode, loadCityStations, loadNearbyStations, selectedCity]);

  useEffect(() => {
    let active = true;
    const nextStationIds = stations
      .map((item) => String(item.stationId || item._id || "").trim())
      .filter(Boolean);

    if (!nextStationIds.length) {
      setPromotions([]);
      setPromotionsLoading(false);
      setPromotionIndex(0);
      return undefined;
    }

    const loadPromotions = async () => {
      setPromotionsLoading(true);
      try {
        const nextPromotions = await fetchStationPromotions(nextStationIds, 8);
        if (!active) return;
        setPromotions(nextPromotions);
        setPromotionIndex(0);
      } catch (error) {
        if (!active) return;
        setPromotions([]);
        console.error("[Promotions:load]", error?.response?.status, error?.response?.data, error?.message);
      } finally {
        if (active) setPromotionsLoading(false);
      }
    };

    loadPromotions();
    return () => {
      active = false;
    };
  }, [stations]);

  const onCenterMap = useCallback(() => {
    if (!mapRef.current) return;
    const centerSource = browseMode === "city" ? mapCenter : location;
    if (!centerSource) return;
    mapRef.current.animateToRegion(
      {
        latitude: Number(centerSource.latitude || DEFAULT_REGION.latitude),
        longitude: Number(centerSource.longitude || DEFAULT_REGION.longitude),
        latitudeDelta: 0.025,
        longitudeDelta: 0.025
      },
      500
    );
    setCenterNotice(
      browseMode === "city"
        ? t("cityMapCentered", { defaultValue: "Map centered to the selected city" })
        : t("homeScreen.mapCentered")
    );
    setTimeout(() => setCenterNotice(""), 1200);
  }, [browseMode, location, mapCenter, t]);

  const onMapRegionChangeComplete = useCallback(
    (region) => {
      if (location) return;

      setMapCenter((current) => {
        const nextCenter = {
          latitude: Number(region?.latitude || DEFAULT_REGION.latitude),
          longitude: Number(region?.longitude || DEFAULT_REGION.longitude),
        };

        if (
          Math.abs(current.latitude - nextCenter.latitude) < 0.0005 &&
          Math.abs(current.longitude - nextCenter.longitude) < 0.0005
        ) {
          return current;
        }

        return nextCenter;
      });
    },
    [location]
  );

  const drawRouteToStation = useCallback(
    async (station) => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });

      if (!location) {
        setRoutingError(t("homeScreen.route.needLocation"));
        return;
      }
      const fromLat = Number(location.latitude);
      const fromLon = Number(location.longitude);
      const toLat = Number(station?.latitude);
      const toLon = Number(station?.longitude);
      if (!Number.isFinite(fromLat) || !Number.isFinite(fromLon) || !Number.isFinite(toLat) || !Number.isFinite(toLon)) {
        setRoutingError(t("homeScreen.route.invalidCoords"));
        return;
      }

      setRouteDestinationStation(normalizeRouteStation(station));
      setRoutingError("");
      try {
        const { data } = await api.get("/map/route", { params: { fromLat, fromLon, toLat, toLon } });
        const coords = Array.isArray(data?.coordinates) ? data.coordinates : [];
        if (!coords.length) {
          setRouteCoords([]);
          setRouteSummary(null);
          setActiveRouteStationId("");
          setRoutingError(t("homeScreen.route.unavailable"));
          return;
        }

        setRouteCoords(coords);
        setRouteSummary({
          distanceKm: Number(data?.distanceKm || 0),
          durationMin: Number(data?.durationMin || 0),
        });
        setActiveRouteStationId(getStationIdentity(station));

        mapRef.current?.fitToCoordinates(
          [{ latitude: fromLat, longitude: fromLon }, { latitude: toLat, longitude: toLon }],
          { edgePadding: { top: 70, right: 30, bottom: 70, left: 30 }, animated: true }
        );
      } catch (error) {
        setRouteCoords([]);
        setRouteSummary(null);
        setActiveRouteStationId("");
        setRoutingError(t("homeScreen.route.fail"));
        console.error("[Directions:drawRouteToStation]", error?.message || error);
      }
    },
    [location, t]
  );

  useEffect(() => {
    const routeRequest = route?.params?.routeRequest;
    const requestId = String(routeRequest?.requestedAt || "").trim();
    if (!requestId || handledRouteRequestRef.current === requestId) return;

    handledRouteRequestRef.current = requestId;
    const nextStation = normalizeRouteStation(routeRequest?.station);
    const latitude = Number(nextStation?.latitude);
    const longitude = Number(nextStation?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setRoutingError(t("homeScreen.route.invalidCoords"));
      return;
    }

    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    setRouteDestinationStation(nextStation);
    setPendingRouteStation(nextStation);
    setMapCenter({ latitude, longitude });
    setRoutingError("");
    mapRef.current?.animateToRegion?.(
      {
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      500
    );
  }, [route?.params?.routeRequest, t]);

  useEffect(() => {
    if (!pendingRouteStation) return;

    if (location) {
      drawRouteToStation(pendingRouteStation);
      setPendingRouteStation(null);
      return;
    }

    if (!hasLocationPermission && locationError) {
      setRoutingError(t("homeScreen.route.needLocation"));
      setPendingRouteStation(null);
    }
  }, [drawRouteToStation, hasLocationPermission, location, locationError, pendingRouteStation, t]);

  const filteredStations = useMemo(() => {
    const base = browseMode === "city" ? mapCenter : (location || mapCenter);
    const query = deferredSearchText.trim().toLowerCase();
    const next = [];
    let topStationId = "";
    let topStationScore = Number.NEGATIVE_INFINITY;

    for (const stationEntry of stations) {
      const station = applyManagerFuelSnapshot(
        stationEntry,
        liveStationSnapshots[getStationIdentity(stationEntry)]
      );
      const stationName = String(station?.name || "").toLowerCase();
      const stationAddress = String(station?.address || "").toLowerCase();
      const stationSubcity = String(station?.subcity || "").toLowerCase();
      const stationWoreda = String(station?.woreda || "").toLowerCase();
      if (
        query &&
        !stationName.includes(query) &&
        !stationAddress.includes(query) &&
        !stationSubcity.includes(query) &&
        !stationWoreda.includes(query)
      ) {
        continue;
      }
      if (statusFilter !== "all" && station?.fuel_status !== statusFilter) continue;
      if (
        fuelFilter !== "any" &&
        station?.supportedFuels?.[fuelFilter] !== true &&
        station?.supportedFuels?.unknown !== true
      ) {
        continue;
      }

      const distanceKm = toDistanceKm(base, {
        latitude: Number(station?.latitude),
        longitude: Number(station?.longitude),
      });
      const queueLength = Number(station?.queue_length || 0);
      const waitMins = Math.max(2, queueLength * 3);
      const statusPenalty =
        station?.fuel_status === "available" ? 0 : station?.fuel_status === "limited" ? 12 : 30;
      const distancePenalty = distanceKm != null ? distanceKm * 3 : 8;
      const queuePenalty = queueLength * 1.8;
      const smartScore = Math.max(1, Math.round(100 - (statusPenalty + distancePenalty + queuePenalty)));

      let reason = t("homeScreen.balancedOption");
      if (station?.fuel_status === "available" && queueLength <= 6) {
        reason = t("homeScreen.fastLineReason");
      } else if (station?.fuel_status === "limited") {
        reason = t("homeScreen.limitedReason");
      } else if (queueLength >= 15) {
        reason = t("homeScreen.highDemandReason");
      }

      const enrichedStation = {
        ...station,
        distanceKm,
        waitMins,
        smartScore,
        reason,
      };

      next.push(enrichedStation);

      const stationKey = getStationIdentity(enrichedStation);
      if (stationKey && smartScore > topStationScore) {
        topStationScore = smartScore;
        topStationId = stationKey;
      }
    }

    if (sortBy === "queue") {
      next.sort((a, b) => Number(a.queue_length || 0) - Number(b.queue_length || 0));
    } else if (sortBy === "name") {
      next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else {
      next.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
    }

    return next.map((station) => ({
      ...station,
      isTopPick: getStationIdentity(station) === topStationId,
    }));
  }, [
    browseMode,
    deferredSearchText,
    fuelFilter,
    liveStationSnapshots,
    location,
    mapCenter,
    sortBy,
    stations,
    statusFilter,
    t
  ]);

  const trackedStationIds = useMemo(() => {
    const nextIds = [];
    const seen = new Set();

    for (const station of filteredStations) {
      if (nextIds.length >= 60) break;

      const stationId = getStationIdentity(station);
      if (!isObjectId(stationId) || seen.has(stationId)) continue;

      seen.add(stationId);
      nextIds.push(stationId);
    }

    return nextIds;
  }, [filteredStations]);

  const trackedStationIdsSignature = useMemo(
    () => trackedStationIds.join("|"),
    [trackedStationIds]
  );

  useEffect(() => {
    let active = true;
    const stationIds = trackedStationIdsSignature
      .split("|")
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!stationIds.length) {
      return undefined;
    }

    const refreshManagerFuelStatuses = async (forceRefresh = false) => {
      const results = await Promise.allSettled(
        stationIds.map((stationId) =>
          fetchStationManagerFuelSnapshot(stationId, { forceRefresh })
        )
      );

      if (!active) return;

      const nextSnapshots = {};
      results.forEach((result) => {
        if (result.status !== "fulfilled" || !result.value?.stationId) return;
        nextSnapshots[result.value.stationId] = result.value;
      });

      if (!Object.keys(nextSnapshots).length) return;

      setLiveStationSnapshots((current) => ({
        ...current,
        ...nextSnapshots,
      }));
    };

    void refreshManagerFuelStatuses();
    const intervalId = setInterval(() => {
      void refreshManagerFuelStatuses(true);
    }, 15000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [trackedStationIdsSignature]);

  const onToggleSavedStation = useCallback(
    async (station) => {
      try {
        const nextSavedStations = await toggleSavedStation(station);
        setSavedStationIds(toSavedStationMap(nextSavedStations));
      } catch (_error) {
        setStationsError(t("somethingWentWrong"));
      }
    },
    [t]
  );

  const stationByBackendId = useMemo(() => {
    return stations.reduce((accumulator, item) => {
      const key = String(item.stationId || item._id || "").trim();
      if (key) {
        accumulator[key] = item;
      }
      return accumulator;
    }, {});
  }, [stations]);

  const visibleMapStations = useMemo(() => filteredStations.slice(0, 40), [filteredStations]);
  const showRouteDestinationMarker = useMemo(() => {
    const latitude = Number(routeDestinationStation?.latitude);
    const longitude = Number(routeDestinationStation?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

    const destinationId = getStationIdentity(routeDestinationStation);
    if (!destinationId) return true;

    return !visibleMapStations.some((station) => getStationIdentity(station) === destinationId);
  }, [routeDestinationStation, visibleMapStations]);

  const openPromotion = useCallback(
    async (promotion) => {
      const externalUrl = String(
        promotion?.ctaUrl || (promotion?.mediaType === "video" ? promotion?.mediaUrl : "")
      ).trim();

      if (externalUrl) {
        try {
          await WebBrowser.openBrowserAsync(externalUrl);
          return;
        } catch (error) {
          console.error("[Promotions:openExternal]", error?.message || error);
        }
      }

      const linkedStation = stationByBackendId[String(promotion?.stationId || "").trim()];
      if (linkedStation) {
        navigation?.navigate?.("StationDetails", { station: linkedStation });
      }
    },
    [navigation, stationByBackendId]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        ref={listRef}
        data={filteredStations}
        keyExtractor={(item) => getStationRenderKey(item)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS === "android"}
        refreshControl={<RefreshControl refreshing={refreshing || loadingStations} onRefresh={onRefresh} />}
        onScrollToIndexFailed={() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true })}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>FuelFinder</Text>
            <Text style={styles.subtitle}>{t("homeScreen.subtitle")}</Text>

            <Text style={styles.section}>
              {t("stationDiscoveryMode", { defaultValue: "How to explore stations" })}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {[
                {
                  id: "nearby",
                  label: t("browseNearbyLabel", { defaultValue: "Nearby" })
                },
                {
                  id: "city",
                  label: t("browseCityLabel", { defaultValue: "Browse by city" })
                }
              ].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.chip, browseMode === option.id && styles.chipActive]}
                  onPress={() => handleBrowseModeChange(option.id)}
                >
                  <Text style={[styles.chipText, browseMode === option.id && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {browseMode === "city" ? (
              <>
                <TextInput
                  value={cityQuery}
                  onChangeText={setCityQuery}
                  placeholder={t("citySearchPlaceholder", { defaultValue: "Search city" })}
                  style={styles.search}
                />
                {selectedCity ? (
                  <Text style={styles.count}>
                    {selectedCity.name}
                    {selectedCity?.region?.name ? `, ${selectedCity.region.name}` : ""}
                    {" • "}
                    {Number(selectedCity.stationCount || 0)}{" "}
                    {t("cityStationsCount", { defaultValue: "stations" })}
                  </Text>
                ) : null}
                {cityOptionsLoading && !cityOptions.length ? (
                  <Text style={styles.notice}>
                    {t("cityOptionsLoading", { defaultValue: "Loading available cities..." })}
                  </Text>
                ) : null}
                {cityOptions.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {cityOptions.map((city) => {
                      const isActive = String(selectedCity?.id || "") === String(city?.id || "");
                      const regionLabel = String(city?.region?.name || "").trim();
                      return (
                        <TouchableOpacity
                          key={String(city?.id || city?.name || "")}
                          style={[styles.chip, isActive && styles.chipActive]}
                          onPress={() => handleSelectCity(city)}
                        >
                          <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                            {city.name}
                            {regionLabel ? ` • ${regionLabel}` : ""}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </>
            ) : null}

            <View style={styles.mapCard}>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                initialRegion={
                  location
                    ? {
                        latitude: location.latitude,
                        longitude: location.longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                      }
                    : {
                        latitude: mapCenter.latitude,
                        longitude: mapCenter.longitude,
                        latitudeDelta: DEFAULT_REGION.latitudeDelta,
                        longitudeDelta: DEFAULT_REGION.longitudeDelta,
                      }
                }
                showsUserLocation={hasLocationPermission}
                onRegionChangeComplete={onMapRegionChangeComplete}
              >
                {routeCoords.length ? <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#2563EB" /> : null}
                {visibleMapStations.map((s) => (
                  <Marker
                    key={getStationRenderKey(s)}
                    coordinate={{ latitude: Number(s.latitude), longitude: Number(s.longitude) }}
                    title={s.name}
                    description={`${t("homeScreen.queue")}: ${s.queue_length} ${t("homeScreen.units.cars")}`}
                    pinColor={markerColor(s.fuel_status)}
                    tracksViewChanges={false}
                  />
                ))}
                {showRouteDestinationMarker ? (
                  <Marker
                    coordinate={{
                      latitude: Number(routeDestinationStation.latitude),
                      longitude: Number(routeDestinationStation.longitude),
                    }}
                    title={routeDestinationStation.name}
                    description={`${t("homeScreen.queue")}: ${getStationQueueLength(routeDestinationStation)} ${t("homeScreen.units.cars")}`}
                    pinColor="#2563EB"
                    tracksViewChanges={false}
                  />
                ) : null}
              </MapView>
            </View>

            <View style={styles.row}>
              {browseMode === "city" || location ? (
                <Pressable style={[styles.button, styles.primary]} onPress={onCenterMap}>
                  <Text style={styles.buttonText}>
                    {browseMode === "city"
                      ? t("centerSelectedCity", { defaultValue: "Center selected city" })
                      : t("homeScreen.centerOnMe")}
                  </Text>
                </Pressable>
              ) : (
                <View style={[styles.button, styles.disabled]}>
                  <Text style={styles.buttonText}>{t("homeScreen.centerUnavailable")}</Text>
                </View>
              )}
              {browseMode === "city" ? (
                <Pressable
                  style={[styles.button, styles.secondary]}
                  onPress={() => (selectedCity?.id ? loadCityStations(selectedCity) : undefined)}
                >
                  <Text style={styles.buttonText}>
                    {t("reloadSelectedCity", { defaultValue: "Load city stations" })}
                  </Text>
                </Pressable>
              ) : location ? (
                <Pressable style={[styles.button, styles.secondary]} onPress={() => loadNearbyStations({ forceRefresh: true })}>
                  <Text style={styles.buttonText}>{t("homeScreen.findNearby")}</Text>
                </Pressable>
              ) : (
                <View style={[styles.button, styles.disabled]}>
                  <Text style={styles.buttonText}>{t("homeScreen.findNearby")}</Text>
                </View>
              )}
            </View>

            {routeSummary ? (
              <Text style={styles.routeText}>
                {t("homeScreen.route.label")}: {routeSummary.distanceKm.toFixed(1)} {t("homeScreen.units.km")},{" "}
                {t("homeScreen.route.about")} {Math.max(1, Math.round(routeSummary.durationMin))} {t("homeScreen.route.min")}
              </Text>
            ) : null}
            {centerNotice ? <Text style={styles.ok}>{centerNotice}</Text> : null}
            {locationError ? <Text style={styles.notice}>{locationError}</Text> : null}
            {stationsError ? <Text style={styles.error}>{stationsError}</Text> : null}
            {routingError ? <Text style={styles.error}>{routingError}</Text> : null}
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder={
                browseMode === "city"
                  ? t("stationSearchInCity", { defaultValue: "Search station in selected city" })
                  : t("homeScreen.search")
              }
              style={styles.search}
            />

            {promotionsLoading && !promotions.length ? (
              <View style={styles.promotionsLoading}>
                <ActivityIndicator size="small" color="#0F766E" />
              </View>
            ) : null}
            {promotions.length ? (
              <PromotionCarousel
                activeIndex={promotionIndex}
                onPressPromotion={openPromotion}
                onSnapToItem={setPromotionIndex}
                promotions={promotions}
                texts={{
                  eyebrow: t("homeScreen.promotions.eyebrow"),
                  title: t("homeScreen.promotions.title"),
                  subtitle: t("homeScreen.promotions.subtitle"),
                  videoLabel: t("homeScreen.promotions.videoLabel"),
                  watchVideo: t("homeScreen.promotions.watchVideo"),
                  viewStation: t("homeScreen.promotions.viewStation"),
                  endsLabel: t("homeScreen.promotions.endsLabel"),
                  stationFallback: t("homeScreen.promotions.stationFallback")
                }}
              />
            ) : null}

            <Text style={styles.section}>{t("homeScreen.filter")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {STATUS_FILTERS.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, statusFilter === value && styles.chipActive]}
                  onPress={() => setStatusFilter(value)}
                >
                  <Text style={[styles.chipText, statusFilter === value && styles.chipTextActive]}>{statusLabel(t, value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.section}>{t("homeScreen.fuel.label")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FUEL_FILTERS.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, fuelFilter === value && styles.chipActive]}
                  onPress={() => setFuelFilter(value)}
                >
                  <Text style={[styles.chipText, fuelFilter === value && styles.chipTextActive]}>{fuelLabel(t, value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.section}>{t("homeScreen.sort.sortBy")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {SORT_OPTIONS.map((value) => (
                <TouchableOpacity key={value} style={[styles.chip, sortBy === value && styles.chipActive]} onPress={() => setSortBy(value)}>
                  <Text style={[styles.chipText, sortBy === value && styles.chipTextActive]}>
                    {t("homeScreen.sort.label")}: {sortLabel(t, value)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.count}>{filteredStations.length} {t("homeScreen.found")}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {loadingStations ? (
              <>
                {[1, 2, 3].map((item) => (
                  <View key={`loading-card-${item}`} style={styles.loadingCard}>
                    <View style={styles.loadingImage} />
                    <View style={styles.loadingBody}>
                      <View style={styles.loadingLineWide} />
                      <View style={styles.loadingLine} />
                      <View style={styles.loadingLineShort} />
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>{t("homeScreen.noMatch")}</Text>
                <Text style={styles.emptySub}>{t("homeScreen.noMatchSub")}</Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation?.navigate?.("StationDetails", { station: item })}
          >
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.stationImage} />
            ) : (
              <View style={styles.stationImagePlaceholder}>
                <Text style={styles.stationImagePlaceholderText}>F</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              {item.isTopPick ? (
                <View style={styles.topPickBadge}>
                  <Text style={styles.topPickText}>{t("homeScreen.bestOption")}</Text>
                </View>
              ) : null}
              <View style={styles.headerRow}>
                <Text style={styles.stationName}>{item.name}</Text>
                <View style={styles.headerActions}>
                  <Pressable
                    style={[
                      styles.saveStationButton,
                      savedStationIds[getStationIdentity(item)] && styles.saveStationButtonActive,
                    ]}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      onToggleSavedStation(item);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      savedStationIds[getStationIdentity(item)]
                        ? t("unsaveStationLabel", { defaultValue: "Remove station from saved list" })
                        : t("saveStationLabel", { defaultValue: "Save station" })
                    }
                  >
                    <Ionicons
                      name={savedStationIds[getStationIdentity(item)] ? "bookmark" : "bookmark-outline"}
                      size={16}
                      color={savedStationIds[getStationIdentity(item)] ? "#0F766E" : "#475569"}
                    />
                  </Pressable>
                  <Pressable style={[styles.statusPill, { borderColor: markerColor(item.fuel_status) }]}>
                    <Text style={[styles.statusText, { color: markerColor(item.fuel_status) }]}>
                      {statusLabel(t, item.fuel_status)}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.factsWrap}>
                <View style={styles.factPill}>
                  <Text style={styles.factLabel}>{t("homeScreen.queue")}</Text>
                  <Text style={styles.factValue}>{item.queue_length} {t("homeScreen.units.cars")}</Text>
                </View>
                <View style={styles.factPill}>
                  <Text style={styles.factLabel}>{t("homeScreen.wait")}</Text>
                  <Text style={styles.factValue}>{item.waitMins} {t("homeScreen.route.min")}</Text>
                </View>
                <View style={styles.factPill}>
                  <Text style={styles.factLabel}>{t("homeScreen.distance")}</Text>
                  <Text style={styles.factValue}>{formatDistance(t, item.distanceKm)}</Text>
                </View>
              </View>
              <View style={styles.insightRow}>
                <Text style={styles.insightReason}>{item.reason}</Text>
              </View>
              <View style={styles.addressChip}>
                <Text style={styles.addressLabel}>Address</Text>
                <Text style={styles.metaAddress}>{item.address || t("homeScreen.addressMissing")}</Text>
              </View>
              <View style={styles.smartScoreBottom}>
                <Text style={styles.smartScoreBottomLabel}>{t("homeScreen.smartScore")}</Text>
                <Text style={styles.smartScoreBottomValue}>{item.smartScore}/100</Text>
              </View>
              <Pressable style={styles.routeBtn} onPress={() => drawRouteToStation(item)}>
                <Text style={styles.routeBtnText}>
                  {activeRouteStationId === getStationIdentity(item)
                    ? t("homeScreen.route.shown")
                    : t("homeScreen.route.show")}
                </Text>
              </Pressable>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F4F7FB" },
  content: { padding: 12, paddingBottom: 24 },
  title: { fontSize: 26, fontWeight: "900", color: "#0F172A" },
  subtitle: { marginTop: 4, marginBottom: 10, color: "#64748B", fontWeight: "600" },
  mapCard: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#E2E8F0" },
  map: { height: 220, width: "100%" },
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  button: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  primary: { backgroundColor: "#0F766E" },
  secondary: { backgroundColor: "#2563EB" },
  disabled: { backgroundColor: "#9CA3AF" },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  routeText: { marginTop: 8, color: "#1D4ED8", fontWeight: "700", fontSize: 12 },
  ok: { marginTop: 6, color: "#15803D", fontWeight: "700", fontSize: 12 },
  notice: { marginTop: 6, color: "#475569", fontWeight: "600", fontSize: 12 },
  error: { marginTop: 6, color: "#B91C1C", fontWeight: "700", fontSize: 12 },
  loadingCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    gap: 10,
  },
  loadingImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
  },
  loadingBody: { flex: 1, justifyContent: "center", gap: 8 },
  loadingLineWide: { height: 12, borderRadius: 8, backgroundColor: "#E2E8F0", width: "90%" },
  loadingLine: { height: 10, borderRadius: 8, backgroundColor: "#E2E8F0", width: "70%" },
  loadingLineShort: { height: 10, borderRadius: 8, backgroundColor: "#E2E8F0", width: "50%" },
  promotionsLoading: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  search: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  section: { marginTop: 10, marginBottom: 6, color: "#0F172A", fontWeight: "800" },
  chips: { paddingBottom: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chipActive: { borderColor: "#1D4ED8", backgroundColor: "#DBEAFE" },
  chipText: { color: "#334155", fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#1D4ED8" },
  count: { marginTop: 4, marginBottom: 8, color: "#475569", fontWeight: "700" },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },
  stationImage: { width: 56, height: 56, borderRadius: 8, marginRight: 8 },
  stationImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  stationImagePlaceholderText: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  cardContent: { flex: 1, justifyContent: "flex-start", alignItems: "flex-start" },
  topPickBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#FFEDD5",
    borderColor: "#F97316",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
  },
  topPickText: { color: "#C2410C", fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stationName: {
    flex: 1,
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 3,
    color: "#0F172A",
    marginRight: 8,
  },
  saveStationButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  saveStationButtonActive: {
    backgroundColor: "#CCFBF1",
    borderColor: "#5EEAD4",
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "#FFFFFF",
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  factsWrap: {
    marginTop: 4,
    marginBottom: 4,
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 5,
    alignItems: "flex-start",
    width: "100%",
  },
  factPill: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 0,
    flex: 1,
  },
  factLabel: { color: "#64748B", fontSize: 9, fontWeight: "700", marginBottom: 1 },
  factValue: { color: "#0F172A", fontSize: 11, fontWeight: "800" },
  insightRow: {
    marginTop: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  insightReason: { marginTop: 1, color: "#334155", fontSize: 10, fontWeight: "600" },
  addressChip: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  addressLabel: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  metaAddress: { color: "#1E3A8A", fontSize: 11, fontWeight: "700" },
  smartScoreBottom: {
    marginTop: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 6,
  },
  smartScoreBottomLabel: { color: "#334155", fontSize: 10, fontWeight: "700" },
  smartScoreBottomValue: { color: "#1D4ED8", fontSize: 12, fontWeight: "900" },
  routeBtn: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#0F766E", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  routeBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  empty: { alignItems: "center", paddingTop: 30 },
  emptyTitle: { color: "#0F172A", fontWeight: "800", marginBottom: 4 },
  emptySub: { color: "#64748B", textAlign: "center" },
});
