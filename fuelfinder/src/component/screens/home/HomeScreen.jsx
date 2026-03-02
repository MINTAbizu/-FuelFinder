import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../services/api";

const DEFAULT_REGION = {
  latitude: 8.9806,
  longitude: 38.7578,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const I18N = {
  en: {
    subtitle: "Live stations, queue status, and nearby options",
    all: "All",
    available: "Available",
    limited: "Limited",
    empty: "Empty",
    nearest: "Nearest",
    shortestQueue: "Shortest Queue",
    az: "A-Z",
    anyFuel: "Any Fuel",
    gasoline: "Gasoline",
    diesel: "Diesel",
    other: "Other",
    centerOnMe: "Center on me",
    centerUnavailable: "Center unavailable",
    findNearby: "Find Nearby Stations",
    mapCentered: "Map centered to your location",
    denied: "Location access denied. Showing stations only.",
    locationFail: "Could not fetch current location.",
    loadStationFail: "Failed to load nearby real fuel stations.",
    routeNeedLocation: "Current location is required to draw directions.",
    routeInvalidCoords: "Invalid location coordinates for route.",
    routeUnavailable: "Live road route unavailable right now. Please try again.",
    routeFail: "Network routing failed. Could not load road path.",
    route: "Route",
    about: "about",
    min: "min",
    search: "Search station",
    filter: "Filter by fuel status",
    fuelPref: "Fuel preference",
    sortBy: "Sort stations",
    sort: "Sort",
    found: "stations found",
    queue: "Queue",
    wait: "Wait",
    distance: "Distance",
    showRoute: "Show Route",
    routeShown: "Route Shown",
    details: "Details",
    noMatch: "No stations match your filters.",
    noMatchSub: "Try a different search, status, or sort option.",
    meters: "m",
    km: "km",
    cars: "cars",
  },
  am: {
    subtitle: "\u12e8\u1240\u1325\u1273 \u121b\u12f0\u12eb\u12ce\u127d\u1363 \u1230\u120d\u134d \u1201\u1294\u1273 \u12a5\u1293 \u12a0\u1245\u122b\u1262\u12eb \u121d\u122d\u132b\u12ce\u127d",
    all: "\u1201\u1209\u121d",
    available: "\u12eb\u1208",
    limited: "\u1260\u12a8\u134a\u120d",
    empty: "\u1263\u12f6",
    nearest: "\u1245\u122d\u1265",
    shortestQueue: "\u12a0\u132d\u122d \u1230\u120d\u134d",
    az: "\u1260\u134a\u12f0\u120d \u1270\u122d\u1273",
    anyFuel: "\u121b\u1295\u129b\u12cd\u121d \u1290\u12f3\u1305",
    gasoline: "\u1264\u1295\u12da\u1295",
    diesel: "\u12f2\u12bc\u120d",
    other: "\u120c\u120b",
    centerOnMe: "\u12c8\u12f0 \u12a5\u1294 \u12ab\u122d\u1273 \u12a0\u12e8",
    centerUnavailable: "\u1218\u1210\u120d \u1218\u1240\u1218\u1325 \u12a0\u12ed\u127b\u120d\u121d",
    findNearby: "\u1245\u122d\u1265 \u121b\u12f0\u12eb\u12ce\u127d \u1348\u120d\u130d",
    mapCentered: "\u12ab\u122d\u1273\u12cd \u12c8\u12f0 \u12a0\u12ab\u1263\u1262\u12ce \u1270\u1240\u121d\u1327\u120d",
    denied: "\u12e8\u12a0\u12ab\u1263\u1262 \u134d\u1243\u12f5 \u12a0\u120d\u1270\u1348\u1240\u12f0\u121d\u1362 \u121b\u12f0\u12eb\u12ce\u127d \u1265\u127b \u12ed\u1273\u12eb\u1209\u1362",
    locationFail: "\u12e8\u12a0\u1201\u1291 \u12a0\u12ab\u1263\u1262 \u1218\u1228\u1303 \u1218\u12cd\u1230\u12f5 \u12a0\u120d\u1270\u127b\u1208\u121d\u1362",
    loadStationFail: "\u1245\u122d\u1265 \u12eb\u1209 \u121b\u12f0\u12eb\u12ce\u127d\u1295 \u1218\u132b\u1295 \u12a0\u120d\u1270\u127b\u1208\u121d\u1362",
    routeNeedLocation: "\u1218\u1295\u1308\u12f5 \u1208\u1218\u1233\u12e8\u1275 \u12e8\u12a0\u1201\u1291 \u12a0\u12ab\u1263\u1262 \u12eb\u1235\u1348\u120d\u130b\u120d\u1362",
    routeInvalidCoords: "\u12e8\u1270\u1233\u1233\u1270 \u12ae\u12a6\u122d\u12f2\u1294\u1275 \u1218\u1228\u1303",
    routeUnavailable: "\u12e8\u1240\u1325\u1273 \u1218\u1295\u1308\u12f5 \u1260\u12da\u1205 \u130a\u12dc \u12a0\u120d\u1270\u1308\u1298\u121d\u1362",
    routeFail: "\u12e8\u1294\u1275\u12c8\u122d\u12ad \u1218\u1295\u1308\u12f5 \u1325\u122a \u12a0\u120d\u1270\u127b\u1208\u121d\u1362",
    route: "\u1218\u1295\u1308\u12f5",
    about: "\u12c8\u12f0",
    min: "\u12f0\u1242\u1243",
    search: "\u121b\u12f0\u12eb \u1348\u120d\u130d",
    filter: "\u1260\u1290\u12f3\u1305 \u1201\u1294\u1273 \u12a0\u1323\u122b",
    fuelPref: "\u12e8\u1290\u12f3\u1305 \u121d\u122d\u132b",
    sortBy: "\u121b\u12f0\u12eb\u12ce\u127d \u12f0\u122d\u12f5\u122d",
    sort: "\u12f0\u122d\u12f5\u122d",
    found: "\u121b\u12f0\u12eb\u12ce\u127d \u1270\u1308\u1299",
    queue: "\u1230\u120d\u134d",
    wait: "\u1246\u12ed\u1273",
    distance: "\u122d\u1240\u1275",
    showRoute: "\u1218\u1295\u1308\u12f5 \u12a0\u1233\u12ed",
    routeShown: "\u1218\u1295\u1308\u12f5 \u1273\u12ed\u1277\u120d",
    details: "\u12dd\u122d\u12dd\u122d",
    noMatch: "\u1270\u1218\u1323\u1323\u129d \u121b\u12f0\u12eb \u12a0\u120d\u1270\u1308\u1298\u121d\u1362",
    noMatchSub: "\u120c\u120b \u134d\u1208\u130b \u12c8\u12ed\u121d \u121b\u1323\u122a\u12eb \u12ed\u121e\u12ad\u1229\u1362",
    meters: "\u121c",
    km: "\u12aa.\u121c",
    cars: "\u1218\u12aa\u1293",
  },
};

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

async function fetchNearbyFuelStations(basePoint, radiusMeters = 12000) {
  const lat = Number(basePoint?.latitude);
  const lon = Number(basePoint?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const { data } = await api.get("/map/nearby-fuel", { params: { lat, lon, radius: radiusMeters } });
  return Array.isArray(data?.stations) ? data.stations : [];
}

function statusLabel(t, status) {
  if (status === "available") return t.available;
  if (status === "limited") return t.limited;
  if (status === "empty") return t.empty;
  return t.all;
}

function sortLabel(t, value) {
  if (value === "queue") return t.shortestQueue;
  if (value === "name") return t.az;
  return t.nearest;
}

function fuelLabel(t, value) {
  if (value === "gasoline") return t.gasoline;
  if (value === "diesel") return t.diesel;
  if (value === "other") return t.other;
  return t.anyFuel;
}

function formatDistance(t, distanceKm) {
  if (distanceKm == null) return "N/A";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} ${t.meters}`;
  return `${distanceKm.toFixed(1)} ${t.km}`;
}

export default function HomeScreen({ navigation }) {
  const { language } = useLanguage();
  const t = I18N[language] || I18N.en;

  const mapRef = useRef(null);
  const listRef = useRef(null);
  const watcherRef = useRef(null);
  const loadedRef = useRef(false);

  const [location, setLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState({
    latitude: DEFAULT_REGION.latitude,
    longitude: DEFAULT_REGION.longitude,
  });
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (mounted) setLocationError(t.denied);
          return;
        }

        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted) setLocation(current.coords);

        watcherRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 30 },
          (pos) => mounted && setLocation(pos.coords)
        );
      } catch (_error) {
        if (mounted) setLocationError(t.locationFail);
      }
    })();

    return () => {
      mounted = false;
      watcherRef.current?.remove?.();
      watcherRef.current = null;
    };
  }, [t.denied, t.locationFail]);

  const loadNearbyStations = useCallback(async () => {
    const basePoint = location || mapCenter;
    if (!basePoint) return;

    setLoadingStations(true);
    setStationsError("");
    try {
      const next = await fetchNearbyFuelStations(basePoint, 12000);
      setStations(next);
    } catch (error) {
      setStationsError(t.loadStationFail);
      console.error(
        "[Stations:loadNearbyStations:debug]",
        error?.response?.status,
        error?.response?.data,
        error?.message
      );
    } finally {
      setLoadingStations(false);
    }
  }, [location, mapCenter, t.loadStationFail]);

  useEffect(() => {
    if (!location || loadedRef.current) return;
    loadedRef.current = true;
    loadNearbyStations();
  }, [location, loadNearbyStations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadNearbyStations();
    } finally {
      setRefreshing(false);
    }
  }, [loadNearbyStations]);

  const onCenterMap = useCallback(() => {
    if (!mapRef.current || !location) return;
    mapRef.current.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 },
      500
    );
    setCenterNotice(t.mapCentered);
    setTimeout(() => setCenterNotice(""), 1200);
  }, [location, t.mapCentered]);

  const drawRouteToStation = useCallback(
    async (station) => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });

      if (!location) {
        setRoutingError(t.routeNeedLocation);
        return;
      }
      const fromLat = Number(location.latitude);
      const fromLon = Number(location.longitude);
      const toLat = Number(station?.latitude);
      const toLon = Number(station?.longitude);
      if (!Number.isFinite(fromLat) || !Number.isFinite(fromLon) || !Number.isFinite(toLat) || !Number.isFinite(toLon)) {
        setRoutingError(t.routeInvalidCoords);
        return;
      }

      setRoutingError("");
      try {
        const { data } = await api.get("/map/route", { params: { fromLat, fromLon, toLat, toLon } });
        const coords = Array.isArray(data?.coordinates) ? data.coordinates : [];
        if (!coords.length) {
          setRouteCoords([]);
          setRouteSummary(null);
          setActiveRouteStationId("");
          setRoutingError(t.routeUnavailable);
          return;
        }

        setRouteCoords(coords);
        setRouteSummary({
          distanceKm: Number(data?.distanceKm || 0),
          durationMin: Number(data?.durationMin || 0),
        });
        setActiveRouteStationId(String(station.id || ""));

        mapRef.current?.fitToCoordinates(
          [{ latitude: fromLat, longitude: fromLon }, { latitude: toLat, longitude: toLon }],
          { edgePadding: { top: 70, right: 30, bottom: 70, left: 30 }, animated: true }
        );
      } catch (error) {
        setRouteCoords([]);
        setRouteSummary(null);
        setActiveRouteStationId("");
        setRoutingError(t.routeFail);
        console.error("[Directions:drawRouteToStation]", error?.message || error);
      }
    },
    [location, t]
  );

  const filteredStations = useMemo(() => {
    const base = location || mapCenter;
    const query = searchText.trim().toLowerCase();

    const next = stations
      .filter((s) => String(s.name || "").toLowerCase().includes(query))
      .filter((s) => statusFilter === "all" || s.fuel_status === statusFilter)
      .filter(
        (s) =>
          fuelFilter === "any" ||
          s?.supportedFuels?.[fuelFilter] === true ||
          s?.supportedFuels?.unknown === true
      )
      .map((s) => ({
        ...s,
        distanceKm: toDistanceKm(base, { latitude: s.latitude, longitude: s.longitude }),
        waitMins: Math.max(2, Number(s.queue_length || 0) * 3),
      }));

    if (sortBy === "queue") {
      next.sort((a, b) => Number(a.queue_length || 0) - Number(b.queue_length || 0));
    } else if (sortBy === "name") {
      next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else {
      next.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
    }

    return next;
  }, [stations, location, mapCenter, searchText, statusFilter, fuelFilter, sortBy]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        ref={listRef}
        data={filteredStations}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing || loadingStations} onRefresh={onRefresh} />}
        onScrollToIndexFailed={() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true })}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>FuelFinder</Text>
            <Text style={styles.subtitle}>{t.subtitle}</Text>

            <View style={styles.mapCard}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={
                  location
                    ? {
                        latitude: location.latitude,
                        longitude: location.longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                      }
                    : DEFAULT_REGION
                }
                showsUserLocation
                onRegionChangeComplete={(region) => setMapCenter({ latitude: region.latitude, longitude: region.longitude })}
              >
                {routeCoords.length ? <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#2563EB" /> : null}
                {filteredStations.map((s) => (
                  <Marker
                    key={String(s.id)}
                    coordinate={{ latitude: Number(s.latitude), longitude: Number(s.longitude) }}
                    title={s.name}
                    description={`${t.queue}: ${s.queue_length} ${t.cars}`}
                  />
                ))}
              </MapView>
            </View>

            <View style={styles.row}>
              {location ? (
                <Pressable style={[styles.button, styles.primary]} onPress={onCenterMap}>
                  <Text style={styles.buttonText}>{t.centerOnMe}</Text>
                </Pressable>
              ) : (
                <View style={[styles.button, styles.disabled]}>
                  <Text style={styles.buttonText}>{t.centerUnavailable}</Text>
                </View>
              )}
              <Pressable style={[styles.button, styles.secondary]} onPress={loadNearbyStations}>
                <Text style={styles.buttonText}>{t.findNearby}</Text>
              </Pressable>
            </View>

            {routeSummary ? (
              <Text style={styles.routeText}>
                {t.route}: {routeSummary.distanceKm.toFixed(1)} {t.km}, {t.about} {Math.max(1, Math.round(routeSummary.durationMin))} {t.min}
              </Text>
            ) : null}
            {centerNotice ? <Text style={styles.ok}>{centerNotice}</Text> : null}
            {locationError ? <Text style={styles.notice}>{locationError}</Text> : null}
            {stationsError ? <Text style={styles.error}>{stationsError}</Text> : null}
            {routingError ? <Text style={styles.error}>{routingError}</Text> : null}

            <TextInput value={searchText} onChangeText={setSearchText} placeholder={t.search} style={styles.search} />

            <Text style={styles.section}>{t.filter}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {["all", "available", "limited", "empty"].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, statusFilter === value && styles.chipActive]}
                  onPress={() => setStatusFilter(value)}
                >
                  <Text style={[styles.chipText, statusFilter === value && styles.chipTextActive]}>{statusLabel(t, value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.section}>{t.fuelPref}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {["any", "gasoline", "diesel", "other"].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, fuelFilter === value && styles.chipActive]}
                  onPress={() => setFuelFilter(value)}
                >
                  <Text style={[styles.chipText, fuelFilter === value && styles.chipTextActive]}>{fuelLabel(t, value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.section}>{t.sortBy}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {["distance", "queue", "name"].map((value) => (
                <TouchableOpacity key={value} style={[styles.chip, sortBy === value && styles.chipActive]} onPress={() => setSortBy(value)}>
                  <Text style={[styles.chipText, sortBy === value && styles.chipTextActive]}>{t.sort}: {sortLabel(t, value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.count}>{filteredStations.length} {t.found}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t.noMatch}</Text>
            <Text style={styles.emptySub}>{t.noMatchSub}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardLine}>{statusLabel(t, item.fuel_status)}</Text>
            <Text style={styles.cardLine}>{t.queue}: {item.queue_length} {t.cars}</Text>
            <Text style={styles.cardLine}>{t.wait}: {item.waitMins} {t.min}</Text>
            <Text style={styles.cardLine}>{t.distance}: {formatDistance(t, item.distanceKm)}</Text>
            <Pressable style={styles.routeBtn} onPress={() => drawRouteToStation(item)}>
              <Text style={styles.routeBtnText}>
                {activeRouteStationId === String(item.id || "") ? t.routeShown : t.showRoute}
              </Text>
            </Pressable>
            <Pressable onPress={() => navigation?.navigate?.("StationDetails", { station: item })}>
              <Text style={styles.detailsLink}>{t.details}</Text>
            </Pressable>
          </View>
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
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  cardTitle: { color: "#0F172A", fontWeight: "900", fontSize: 15, marginBottom: 3 },
  cardLine: { color: "#334155", fontWeight: "600", marginBottom: 2 },
  routeBtn: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#0F766E", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  routeBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  detailsLink: { marginTop: 8, color: "#1D4ED8", fontWeight: "800" },
  empty: { alignItems: "center", paddingTop: 30 },
  emptyTitle: { color: "#0F172A", fontWeight: "800", marginBottom: 4 },
  emptySub: { color: "#64748B", textAlign: "center" },
});
