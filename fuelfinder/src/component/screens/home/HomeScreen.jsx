import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  Image,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#F4F7FB",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  primary: "#0F766E",
  primaryPressed: "#0B5F59",
  accent: "#2563EB",
  accentPressed: "#1D4ED8",
  danger: "#DC2626",
  warning: "#D97706",
  success: "#16A34A",
  border: "#E5E7EB",
};

const DEFAULT_REGION = {
  latitude: 8.9806,
  longitude: 38.7578,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Available", value: "available" },
  { label: "Limited", value: "limited" },
  { label: "Empty", value: "empty" },
];

const SORT_OPTIONS = [
  { label: "Nearest", value: "distance" },
  { label: "Shortest Queue", value: "queue" },
  { label: "A-Z", value: "name" },
];

const IMPORTANT_NOTICES = [
  {
    id: "n1",
    title: "Enable location access",
    detail: "Location helps rank nearby stations and improves recommendations.",
    tone: "info",
  },
  {
    id: "n2",
    title: "Fuel data can change fast",
    detail: "Queue and fuel status may change in minutes during peak demand.",
    tone: "warning",
  },
  {
    id: "n3",
    title: "Always verify on arrival",
    detail: "Use this app as guidance and confirm pump status at the station.",
    tone: "danger",
  },
];

// Mock API
const fetchStations = async () => {
  await new Promise((res) => setTimeout(res, 500));
  return [
    {
      id: 1,
      stationId: "65f0c8a1b02d6a5e9f410001",
      name: "Total Station",
      latitude: 8.9806,
      longitude: 38.7578,
      fuel_status: "available",
      queue_length: 5,
      image: "https://example.com/total.jpg",
    },
    {
      id: 2,
      stationId: "65f0c8a1b02d6a5e9f410002",
      name: "Oil Libya",
      latitude: 8.998,
      longitude: 38.788,
      fuel_status: "available",
      queue_length: 12,
      image: "https://example.com/libya.jpg",
    },
    {
      id: 3,
      stationId: "65f0c8a1b02d6a5e9f410003",
      name: "NP Station",
      latitude: 8.985,
      longitude: 38.765,
      fuel_status: "limited",
      queue_length: 20,
      image: "https://example.com/np.jpg",
    },
  ];
};

const getDistanceKm = (from, to) => {
  if (!from || !to) return null;
  const R = 6371;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const formatDistance = (distanceKm) => {
  if (distanceKm == null) return "N/A";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(1)} km`;
};

const getWaitEstimateMinutes = (queueLength) => {
  // Approximate fueling flow: ~3 min per car in queue.
  return Math.max(2, queueLength * 3);
};

export default function HomeScreen({ navigation }) {
  const mapRef = useRef(null);
  const listRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [mapCenter, setMapCenter] = useState({
    latitude: DEFAULT_REGION.latitude,
    longitude: DEFAULT_REGION.longitude,
  });
  const [locationError, setLocationError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortBy, setSortBy] = useState("distance");
  const [centerNotice, setCenterNotice] = useState("");

  const { data: stations = [], refetch, isFetching, error } = useQuery({
    queryKey: ["stations"],
    queryFn: fetchStations,
    staleTime: 1000 * 60 * 5,
  });

  // Get location
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (mounted) setLocationError("Location access denied. Showing stations only.");
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted) setLocation(currentLocation.coords);

        // Keep distance live by tracking user movement.
        locationWatcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 8000,
            distanceInterval: 30,
          },
          (pos) => {
            if (mounted) setLocation(pos.coords);
          }
        );
      } catch (e) {
        if (mounted) setLocationError("Could not fetch current location.");
        console.error(e);
      }
    })();

    return () => {
      mounted = false;
      locationWatcherRef.current?.remove?.();
      locationWatcherRef.current = null;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const onCenterMap = useCallback(() => {
    if (!mapRef.current || !location) return;
    mapRef.current.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      },
      500
    );
    setCenterNotice("Map centered to your location");
    setTimeout(() => setCenterNotice(""), 1200);
  }, [location]);

  const onSelectStatusFilter = useCallback(
    (statusValue) => {
      setSelectedStatus(statusValue);

      // Jump user directly to station cards area after picking a status filter.
      setTimeout(() => {
        listRef.current?.scrollToIndex?.({ index: 0, animated: true });
      }, 120);
    },
    [setSelectedStatus]
  );

  const getMarkerColor = (status) => {
    switch (status) {
      case "available":
        return "green";
      case "limited":
        return "orange";
      case "empty":
        return "red";
      default:
        return "gray";
    }
  };

  const getStatusChipColors = (value, active) => {
    if (!active) {
      return { bg: "#EEF2FF", text: "#4338CA" };
    }
    if (value === "available") return { bg: "#DCFCE7", text: "#166534" };
    if (value === "limited") return { bg: "#FEF3C7", text: "#92400E" };
    if (value === "empty") return { bg: "#FEE2E2", text: "#991B1B" };
    return { bg: "#DBEAFE", text: "#1E3A8A" };
  };

  const getNoticeToneStyles = (tone) => {
    if (tone === "warning") {
      return { bg: "#FFFBEB", border: "#F59E0B", title: "#92400E", body: "#B45309" };
    }
    if (tone === "danger") {
      return { bg: "#FEF2F2", border: "#EF4444", title: "#991B1B", body: "#B91C1C" };
    }
    return { bg: "#EFF6FF", border: "#3B82F6", title: "#1E3A8A", body: "#1D4ED8" };
  };

  const filteredStations = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    const distanceBase = location || mapCenter;

    const results = stations
      .filter((s) => s.name.toLowerCase().includes(normalizedSearch))
      .filter((s) => selectedStatus === "all" || s.fuel_status === selectedStatus)
      .map((s) => ({
        ...s,
        distanceKm: getDistanceKm(distanceBase, {
          latitude: s.latitude,
          longitude: s.longitude,
        }),
      }));

    if (sortBy === "queue") {
      results.sort((a, b) => a.queue_length - b.queue_length);
    } else if (sortBy === "name") {
      results.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "distance") {
      results.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    const scored = results.map((station) => {
      const statusPenalty =
        station.fuel_status === "available"
          ? 0
          : station.fuel_status === "limited"
            ? 12
            : 30;
      const distancePenalty = station.distanceKm != null ? station.distanceKm * 3 : 8;
      const queuePenalty = station.queue_length * 1.8;
      const score = 100 - (statusPenalty + distancePenalty + queuePenalty);

      const waitMins = getWaitEstimateMinutes(station.queue_length);
      let reason = "Balanced option";
      if (station.fuel_status === "available" && station.queue_length <= 6) {
        reason = "Fast line and stable fuel availability";
      } else if (station.fuel_status === "limited") {
        reason = "Fuel is limited, go soon if needed";
      } else if (station.queue_length >= 15) {
        reason = "High demand now, expect longer wait";
      }

      return {
        ...station,
        smartScore: Math.max(1, Math.round(score)),
        waitMins,
        reason,
      };
    });

    const topId = scored.reduce(
      (bestId, current) => {
        if (!bestId) return current.id;
        const best = scored.find((item) => item.id === bestId);
        return current.smartScore > best.smartScore ? current.id : bestId;
      },
      null
    );

    return scored.map((station) => ({
      ...station,
      isTopPick: station.id === topId,
    }));
  }, [stations, searchText, selectedStatus, sortBy, location, mapCenter]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={filteredStations}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContentContainer}
          onScrollToIndexFailed={() => {
            listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing || isFetching} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View>
              <View style={styles.brandRow}>
                <View style={styles.logoWrap}>
                  <Text style={styles.logoText}>FF</Text>
                </View>
                <View style={styles.brandTextWrap}>
                  <Text style={styles.pageTitle}>FuelFinder</Text>
                  <Text style={styles.pageSubtitle}>Live stations, queue status, and nearby options</Text>
                </View>
              </View>

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
                  onRegionChangeComplete={(region) =>
                    setMapCenter({ latitude: region.latitude, longitude: region.longitude })
                  }
                >
                  {filteredStations.map((station) => (
                    <Marker
                      key={station.id}
                      coordinate={{ latitude: station.latitude, longitude: station.longitude }}
                      pinColor={getMarkerColor(station.fuel_status)}
                      title={station.name}
                      description={`Queue: ${station.queue_length} cars`}
                    />
                  ))}
                </MapView>
              </View>

              <View style={styles.actionRow}>
                {location ? (
                  <Pressable
                    onPress={onCenterMap}
                    style={({ pressed }) => [
                      styles.primaryActionButton,
                      pressed && styles.primaryActionButtonPressed,
                    ]}
                  >
                    <Text style={styles.actionButtonText}>Center on me</Text>
                  </Pressable>
                ) : (
                  <View style={styles.primaryActionButtonDisabled}>
                    <Text style={styles.actionButtonText}>Center unavailable</Text>
                  </View>
                )}
                <Pressable
                  onPress={onRefresh}
                  style={({ pressed }) => [
                    styles.secondaryActionButton,
                    pressed && styles.secondaryActionButtonPressed,
                  ]}
                >
                  <Text style={styles.actionButtonText}>Refresh</Text>
                </Pressable>
              </View>
              {centerNotice ? <Text style={styles.centerNotice}>{centerNotice}</Text> : null}
              {locationError ? (
                <Text style={styles.inlineNotice}>
                  {locationError} Distances are estimated from map center.
                </Text>
              ) : null}
              {error ? <Text style={styles.inlineError}>Could not load stations.</Text> : null}

              <View style={styles.searchContainer}>
                <TextInput
                  placeholder="Search station"
                  value={searchText}
                  onChangeText={setSearchText}
                  style={styles.searchInput}
                />
              </View>

              <Text style={styles.sectionTitle}>Filter by fuel status</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {STATUS_OPTIONS.map((option) => {
                  const isActive = selectedStatus === option.value;
                  const chipColors = getStatusChipColors(option.value, isActive);
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.chip,
                        { backgroundColor: chipColors.bg, borderColor: chipColors.text },
                      ]}
                      onPress={() => onSelectStatusFilter(option.value)}
                    >
                      <Text style={[styles.chipText, { color: chipColors.text }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.sectionTitle}>Sort stations</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {SORT_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.chip,
                      sortBy === option.value ? styles.sortChipActive : styles.sortChip,
                    ]}
                    onPress={() => setSortBy(option.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        sortBy === option.value ? styles.sortChipTextActive : styles.sortChipText,
                      ]}
                    >
                      Sort: {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.countText}>{filteredStations.length} stations found</Text>

              <Text style={styles.sectionTitle}>Important notices</Text>
              <View style={styles.noticeList}>
                {IMPORTANT_NOTICES.map((notice) => {
                  const toneStyle = getNoticeToneStyles(notice.tone);
                  return (
                    <View
                      key={notice.id}
                      style={[
                        styles.noticeCard,
                        { backgroundColor: toneStyle.bg, borderColor: toneStyle.border },
                      ]}
                    >
                      <Text style={[styles.noticeTitle, { color: toneStyle.title }]}>
                        {notice.title}
                      </Text>
                      <Text style={[styles.noticeBody, { color: toneStyle.body }]}>
                        {notice.detail}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No stations match your filters.</Text>
              <Text style={styles.emptySubTitle}>Try a different search, status, or sort option.</Text>
            </View>
          }
          renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => navigation?.navigate?.("StationDetails", { station: item })}
              >
                <Image source={{ uri: item.image }} style={styles.stationImage} />
                <View style={styles.cardContent}>
                  {item.isTopPick ? (
                    <View style={styles.topPickBadge}>
                      <Text style={styles.topPickText}>BEST OPTION</Text>
                    </View>
                  ) : null}
                  <View style={styles.headerRow}>
                    <Text style={styles.stationName}>{item.name}</Text>
                    <Pressable
                      style={[
                        styles.statusPill,
                        { borderColor: getMarkerColor(item.fuel_status) },
                      ]}
                      onPress={() => navigation?.navigate?.("StationDetails", { station: item })}
                    >
                      <Text style={[styles.statusText, { color: getMarkerColor(item.fuel_status) }]}>
                        {item.fuel_status.toUpperCase()}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.factsWrap}>
                    <View style={styles.factPill}>
                      <Text style={styles.factLabel}>Queue</Text>
                      <Text style={styles.factValue}>{item.queue_length} cars</Text>
                    </View>
                    <View style={styles.factPill}>
                      <Text style={styles.factLabel}>Wait</Text>
                      <Text style={styles.factValue}>{item.waitMins} min</Text>
                    </View>
                    <View style={styles.factPill}>
                      <Text style={styles.factLabel}>Distance (live)</Text>
                      <Text style={styles.factValue}>
                        {formatDistance(item.distanceKm)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.insightRow}>
                    <Text style={styles.insightReason}>{item.reason}</Text>
                  </View>
                  <View style={styles.smartScoreBottom}>
                    <Text style={styles.smartScoreBottomLabel}>Smart score</Text>
                    <Text style={styles.smartScoreBottomValue}>{item.smartScore}/100</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, paddingHorizontal: 14 },
  brandRow: { marginTop: 6, marginBottom: 6, flexDirection: "row", alignItems: "center" },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.6 },
  brandTextWrap: { flex: 1 },
  pageTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  pageSubtitle: {
    marginTop: 2,
    marginBottom: 10,
    color: COLORS.muted,
    fontSize: 13,
    textAlign: "left",
  },
  mapCard: {
    marginTop: 8,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 5,
    backgroundColor: COLORS.surface,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  map: { height: 230, width: "100%" },
  actionRow: {
    marginTop: 10,
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  primaryActionButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionButtonPressed: { backgroundColor: COLORS.primaryPressed, transform: [{ scale: 0.99 }] },
  primaryActionButtonDisabled: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionButtonPressed: { backgroundColor: COLORS.accentPressed, transform: [{ scale: 0.99 }] },
  actionButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  centerNotice: {
    marginTop: 8,
    marginBottom: 6,
    color: COLORS.success,
    fontSize: 12,
    fontWeight: "600",
  },
  inlineNotice: { color: COLORS.muted, marginTop: 4, marginBottom: 4, fontWeight: "500" },
  inlineError: { color: COLORS.danger, marginTop: 2, marginBottom: 4, fontWeight: "600" },
  searchContainer: { paddingVertical: 8, backgroundColor: "transparent" },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
  },
  sectionTitle: {
    marginTop: 4,
    marginBottom: 6,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  filterRow: { paddingRight: 8, paddingBottom: 10 },
  chip: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
  },
  chipText: { fontWeight: "700", fontSize: 12 },
  sortChip: { backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" },
  sortChipActive: { backgroundColor: "#DBEAFE", borderColor: "#1D4ED8" },
  sortChipText: { color: "#374151" },
  sortChipTextActive: { color: "#1D4ED8" },
  countText: { marginBottom: 8, color: COLORS.muted, fontWeight: "600" },
  noticeList: { marginBottom: 10 },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  noticeTitle: { fontSize: 13, fontWeight: "800", marginBottom: 4 },
  noticeBody: { fontSize: 12, fontWeight: "600", lineHeight: 17 },
  listContentContainer: { paddingBottom: 24 },
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  stationImage: { width: 56, height: 56, borderRadius: 8, marginRight: 8 },
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
  stationName: {
    flex: 1,
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 3,
    color: COLORS.text,
    marginRight: 8,
    textAlign: "left",
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
  factLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    marginBottom: 1,
    textAlign: "left",
  },
  factValue: { color: "#0F172A", fontSize: 11, fontWeight: "800", textAlign: "left" },
  insightRow: {
    marginTop: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  insightReason: {
    marginTop: 1,
    color: "#334155",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "left",
  },
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
  emptyState: { paddingTop: 36, alignItems: "center", paddingHorizontal: 16 },
  emptyTitle: { fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  emptySubTitle: { color: COLORS.muted, textAlign: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
