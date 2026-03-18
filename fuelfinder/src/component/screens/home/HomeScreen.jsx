import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../services/api";
import { loadSavedStations, toggleSavedStation } from "../../services/accountStorage";

const DEFAULT_REGION = {
  latitude: 8.9806,
  longitude: 38.7578,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Translations are handled by i18next (`src/i18n/locales/*.json`).

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

export default function HomeScreen({ navigation }) {
  const { t } = useLanguage();

  const mapRef = useRef(null);
  const listRef = useRef(null);
  const watcherRef = useRef(null);
  const loadedRef = useRef(false);

  const [location, setLocation] = useState(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
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
  const [savedStationIds, setSavedStationIds] = useState({});

  const refreshSavedStations = useCallback(async () => {
    try {
      const nextSavedStations = await loadSavedStations();
      setSavedStationIds(
        nextSavedStations.reduce((accumulator, station) => {
          accumulator[String(station.id || "")] = true;
          return accumulator;
        }, {})
      );
    } catch (_error) {
      // Ignore local saved-station refresh failures and keep the screen usable.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSavedStations();
      return undefined;
    }, [refreshSavedStations])
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (mounted) setHasLocationPermission(false);
          if (mounted) setLocationError(t("homeScreen.location.denied"));
          return;
        }

        if (mounted) setHasLocationPermission(true);
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted) setLocation(current.coords);

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

  const loadNearbyStations = useCallback(async () => {
    const basePoint = location;
    if (!basePoint) {
      setStations([]);
      setStationsError(t("homeScreen.location.denied"));
      return;
    }

    setLoadingStations(true);
    setStationsError("");
    try {
      const next = await fetchNearbyFuelStations(basePoint, 12000);
      setStations(next);
    } catch (error) {
      setStationsError(t("homeScreen.stations.loadFail"));
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
    setCenterNotice(t("homeScreen.mapCentered"));
    setTimeout(() => setCenterNotice(""), 1200);
  }, [location, t]);

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
        setActiveRouteStationId(String(station.id || ""));

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

    const scored = next.map((station) => {
      const statusPenalty =
        station.fuel_status === "available" ? 0 : station.fuel_status === "limited" ? 12 : 30;
      const distancePenalty = station.distanceKm != null ? station.distanceKm * 3 : 8;
      const queuePenalty = Number(station.queue_length || 0) * 1.8;
      const score = 100 - (statusPenalty + distancePenalty + queuePenalty);

      let reason = t("homeScreen.balancedOption");
      if (station.fuel_status === "available" && Number(station.queue_length || 0) <= 6) {
        reason = t("homeScreen.fastLineReason");
      } else if (station.fuel_status === "limited") {
        reason = t("homeScreen.limitedReason");
      } else if (Number(station.queue_length || 0) >= 15) {
        reason = t("homeScreen.highDemandReason");
      }

      return {
        ...station,
        smartScore: Math.max(1, Math.round(score)),
        reason,
      };
    });

    const topId = scored.reduce((bestId, current) => {
      if (!bestId) return current.id;
      const best = scored.find((item) => item.id === bestId);
      return current.smartScore > best.smartScore ? current.id : bestId;
    }, null);

    return scored.map((station) => ({
      ...station,
      isTopPick: station.id === topId,
    }));
  }, [stations, location, mapCenter, searchText, statusFilter, fuelFilter, sortBy, t]);

  const onToggleSavedStation = useCallback(
    async (station) => {
      try {
        const nextSavedStations = await toggleSavedStation(station);
        setSavedStationIds(
          nextSavedStations.reduce((accumulator, savedStation) => {
            accumulator[String(savedStation.id || "")] = true;
            return accumulator;
          }, {})
        );
      } catch (_error) {
        setStationsError(t("somethingWentWrong"));
      }
    },
    [t]
  );

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
            <Text style={styles.subtitle}>{t("homeScreen.subtitle")}</Text>

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
                    : DEFAULT_REGION
                }
                showsUserLocation={hasLocationPermission}
                onRegionChangeComplete={(region) => setMapCenter({ latitude: region.latitude, longitude: region.longitude })}
              >
                {routeCoords.length ? <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#2563EB" /> : null}
                {filteredStations.map((s) => (
                  <Marker
                    key={String(s.id)}
                    coordinate={{ latitude: Number(s.latitude), longitude: Number(s.longitude) }}
                    title={s.name}
                    description={`${t("homeScreen.queue")}: ${s.queue_length} ${t("homeScreen.units.cars")}`}
                  />
                ))}
              </MapView>
            </View>

            <View style={styles.row}>
              {location ? (
                <Pressable style={[styles.button, styles.primary]} onPress={onCenterMap}>
                  <Text style={styles.buttonText}>{t("homeScreen.centerOnMe")}</Text>
                </Pressable>
              ) : (
                <View style={[styles.button, styles.disabled]}>
                  <Text style={styles.buttonText}>{t("homeScreen.centerUnavailable")}</Text>
                </View>
              )}
              {location ? (
                <Pressable style={[styles.button, styles.secondary]} onPress={loadNearbyStations}>
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
            <TextInput value={searchText} onChangeText={setSearchText} placeholder={t("homeScreen.search")} style={styles.search} />

            <Text style={styles.section}>{t("homeScreen.filter")}</Text>
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

            <Text style={styles.section}>{t("homeScreen.fuel.label")}</Text>
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

            <Text style={styles.section}>{t("homeScreen.sort.sortBy")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {["distance", "queue", "name"].map((value) => (
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
                      savedStationIds[String(item.id || "")] && styles.saveStationButtonActive,
                    ]}
                    onPress={(event) => {
                      event.stopPropagation?.();
                      onToggleSavedStation(item);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      savedStationIds[String(item.id || "")]
                        ? t("unsaveStationLabel", { defaultValue: "Remove station from saved list" })
                        : t("saveStationLabel", { defaultValue: "Save station" })
                    }
                  >
                    <Ionicons
                      name={savedStationIds[String(item.id || "")] ? "bookmark" : "bookmark-outline"}
                      size={16}
                      color={savedStationIds[String(item.id || "")] ? "#0F766E" : "#475569"}
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
                  {activeRouteStationId === String(item.id || "")
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
