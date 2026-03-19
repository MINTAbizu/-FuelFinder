import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";

import { useLanguage } from "../../context/LanguageContext";
import api from "../../services/api";

const DEFAULT_REGION = {
  latitude: 8.9806,
  longitude: 38.7578,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const MOVING_SPEED_THRESHOLD_MPS = 1.4;
const ROUTE_REFRESH_DISTANCE_METERS = 70;
const ROUTE_REFRESH_INTERVAL_MS = 25000;

function getStationIdentity(station) {
  return String(station?.stationId || station?._id || station?.id || "").trim();
}

function getDestinationKey(station) {
  const identity = getStationIdentity(station);
  if (identity) return identity;
  const latitude = Number(station?.latitude);
  const longitude = Number(station?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
}

function normalizeRouteStation(station) {
  const latitude = Number(station?.latitude);
  const longitude = Number(station?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    ...station,
    id: getStationIdentity(station) || String(station?.id || "").trim(),
    name: String(station?.name || "Fuel Station").trim() || "Fuel Station",
    address: String(station?.address || "").trim(),
    latitude,
    longitude,
  };
}

function distanceMetersBetween(from, to) {
  if (!from || !to) return null;
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const earthRadiusMeters = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getMovementStatus(coords, previousLocation) {
  const speed = Number(coords?.speed);
  if (Number.isFinite(speed) && speed >= MOVING_SPEED_THRESHOLD_MPS) {
    return "moving";
  }

  if (!previousLocation) return "stopped";

  const distanceMeters = distanceMetersBetween(
    {
      latitude: Number(coords?.latitude),
      longitude: Number(coords?.longitude),
    },
    previousLocation
  );
  const nextTimestamp = Number(coords?.timestamp || Date.now());
  const previousTimestamp = Number(previousLocation?.timestamp || nextTimestamp);
  const secondsElapsed = Math.max(1, (nextTimestamp - previousTimestamp) / 1000);
  if (distanceMeters != null && distanceMeters / secondsElapsed >= MOVING_SPEED_THRESHOLD_MPS) {
    return "moving";
  }

  return "stopped";
}

function formatDistanceLabel(distanceMeters, t) {
  if (!Number.isFinite(distanceMeters)) return "--";
  if (distanceMeters < 1000) {
    return `${Math.max(1, Math.round(distanceMeters))} ${t("homeScreen.units.meters")}`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} ${t("homeScreen.units.km")}`;
}

function formatSpeedLabel(speedMps) {
  const speed = Number(speedMps);
  if (!Number.isFinite(speed) || speed <= 0) return "0 km/h";
  return `${Math.round(speed * 3.6)} km/h`;
}

export default function MapScreen({ route }) {
  const { t } = useLanguage();

  const mapRef = useRef(null);
  const watcherRef = useRef(null);
  const handledRouteRequestRef = useRef("");
  const previousLocationRef = useRef(null);
  const lastRouteOriginRef = useRef(null);
  const lastRouteRefreshAtRef = useRef(0);
  const lastDestinationKeyRef = useRef("");
  const routeRequestIdRef = useRef(0);

  const [location, setLocation] = useState(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [trackingLocation, setTrackingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [destinationStation, setDestinationStation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);
  const [movementStatus, setMovementStatus] = useState("stopped");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [isRouting, setIsRouting] = useState(false);

  const applyLocationSnapshot = useCallback((coords, timestamp = Date.now()) => {
    const nextLocation = {
      latitude: Number(coords?.latitude || 0),
      longitude: Number(coords?.longitude || 0),
      speed: Number.isFinite(Number(coords?.speed)) ? Number(coords.speed) : 0,
      heading: Number.isFinite(Number(coords?.heading)) ? Number(coords.heading) : 0,
      accuracy: Number.isFinite(Number(coords?.accuracy)) ? Number(coords.accuracy) : null,
      timestamp,
    };

    if (!Number.isFinite(nextLocation.latitude) || !Number.isFinite(nextLocation.longitude)) {
      return;
    }

    setLocation(nextLocation);
    setMovementStatus(getMovementStatus(nextLocation, previousLocationRef.current));
    setLastUpdatedAt(timestamp);
    previousLocationRef.current = nextLocation;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const startTracking = async () => {
        setTrackingLocation(true);
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!mounted) return;

          if (permission.status !== "granted") {
            setHasLocationPermission(false);
            setLocationError(
              t("mapLocationDenied", {
                defaultValue: "Location access is required for live route tracking.",
              })
            );
            return;
          }

          setHasLocationPermission(true);
          setLocationError("");

          const lastKnown = await Location.getLastKnownPositionAsync({
            maxAge: 1000 * 60 * 10,
            requiredAccuracy: 250,
          });
          if (mounted && lastKnown?.coords) {
            applyLocationSnapshot(lastKnown.coords, lastKnown.timestamp || Date.now());
          }

          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          if (mounted && current?.coords) {
            applyLocationSnapshot(current.coords, current.timestamp || Date.now());
          }

          watcherRef.current = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 3000,
              distanceInterval: 5,
            },
            (position) => {
              if (!mounted) return;
              applyLocationSnapshot(position.coords, position.timestamp || Date.now());
            }
          );
        } catch (_error) {
          if (!mounted) return;
          setHasLocationPermission(false);
          setLocationError(
            t("mapLocationUnavailable", {
              defaultValue: "We could not read your live location right now.",
            })
          );
        } finally {
          if (mounted) {
            setTrackingLocation(false);
          }
        }
      };

      startTracking();

      return () => {
        mounted = false;
        watcherRef.current?.remove?.();
        watcherRef.current = null;
      };
    }, [applyLocationSnapshot, t])
  );

  const requestRoute = useCallback(
    async (origin, station, { fitToRoute = false } = {}) => {
      const fromLat = Number(origin?.latitude);
      const fromLon = Number(origin?.longitude);
      const toLat = Number(station?.latitude);
      const toLon = Number(station?.longitude);
      if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
        setRouteError(
          t("homeScreen.route.invalidCoords")
        );
        return;
      }

      const requestId = routeRequestIdRef.current + 1;
      routeRequestIdRef.current = requestId;
      lastRouteRefreshAtRef.current = Date.now();
      setIsRouting(true);
      setRouteError("");

      try {
        const { data } = await api.get("/map/route", {
          params: { fromLat, fromLon, toLat, toLon },
        });
        if (routeRequestIdRef.current !== requestId) return;

        const coords = Array.isArray(data?.coordinates) ? data.coordinates : [];
        if (!coords.length) {
          setRouteCoords([]);
          setRouteSummary(null);
          setRouteError(t("homeScreen.route.unavailable"));
          return;
        }

        setRouteCoords(coords);
        setRouteSummary({
          distanceKm: Number(data?.distanceKm || 0),
          durationMin: Number(data?.durationMin || 0),
        });
        lastRouteOriginRef.current = {
          latitude: fromLat,
          longitude: fromLon,
        };

        if (fitToRoute) {
          mapRef.current?.fitToCoordinates(
            [
              { latitude: fromLat, longitude: fromLon },
              { latitude: toLat, longitude: toLon },
            ],
            {
              edgePadding: { top: 120, right: 40, bottom: 180, left: 40 },
              animated: true,
            }
          );
        }
      } catch (error) {
        if (routeRequestIdRef.current !== requestId) return;
        setRouteCoords([]);
        setRouteSummary(null);
        setRouteError(t("homeScreen.route.fail"));
        console.error("[MapScreen:requestRoute]", error?.message || error);
      } finally {
        if (routeRequestIdRef.current === requestId) {
          setIsRouting(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    const routeRequest = route?.params?.routeRequest;
    const requestId = String(routeRequest?.requestedAt || "").trim();
    if (!requestId || handledRouteRequestRef.current === requestId) return;

    handledRouteRequestRef.current = requestId;
    const nextStation = normalizeRouteStation(routeRequest?.station);
    if (!nextStation) {
      setRouteError(
        t("routeUnavailableBody", {
          defaultValue: "This station does not have valid map coordinates yet.",
        })
      );
      return;
    }

    lastDestinationKeyRef.current = "";
    setDestinationStation(nextStation);
    setRouteError("");
    mapRef.current?.animateToRegion?.(
      {
        latitude: nextStation.latitude,
        longitude: nextStation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      500
    );
  }, [route?.params?.routeRequest, t]);

  useEffect(() => {
    const destinationKey = getDestinationKey(destinationStation);
    if (!destinationKey || !location) return;
    if (lastDestinationKeyRef.current === destinationKey) return;

    lastDestinationKeyRef.current = destinationKey;
    void requestRoute(location, destinationStation, { fitToRoute: true });
  }, [destinationStation, location, requestRoute]);

  useEffect(() => {
    const destinationKey = getDestinationKey(destinationStation);
    if (!destinationKey || !location || !lastRouteOriginRef.current) return;

    const distanceFromLastOrigin = distanceMetersBetween(location, lastRouteOriginRef.current);
    const msSinceLastRoute = Date.now() - lastRouteRefreshAtRef.current;
    if (
      distanceFromLastOrigin != null &&
      distanceFromLastOrigin >= ROUTE_REFRESH_DISTANCE_METERS &&
      msSinceLastRoute >= ROUTE_REFRESH_INTERVAL_MS
    ) {
      void requestRoute(location, destinationStation, { fitToRoute: false });
    }
  }, [destinationStation, location, requestRoute]);

  const onCenterUser = useCallback(() => {
    if (!location) return;
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      400
    );
  }, [location]);

  const onFitRoute = useCallback(() => {
    if (!destinationStation) return;
    if (location) {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: location.latitude, longitude: location.longitude },
          {
            latitude: destinationStation.latitude,
            longitude: destinationStation.longitude,
          },
        ],
        {
          edgePadding: { top: 120, right: 40, bottom: 180, left: 40 },
          animated: true,
        }
      );
      return;
    }

    mapRef.current?.animateToRegion(
      {
        latitude: destinationStation.latitude,
        longitude: destinationStation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      400
    );
  }, [destinationStation, location]);

  const onClearRoute = useCallback(() => {
    routeRequestIdRef.current += 1;
    lastDestinationKeyRef.current = "";
    lastRouteOriginRef.current = null;
    lastRouteRefreshAtRef.current = 0;
    setDestinationStation(null);
    setRouteCoords([]);
    setRouteSummary(null);
    setRouteError("");
    setIsRouting(false);
  }, []);

  const remainingDistanceMeters = useMemo(() => {
    if (!location || !destinationStation) return null;
    return distanceMetersBetween(location, destinationStation);
  }, [destinationStation, location]);

  const vehicleMarkerColor =
    movementStatus === "moving" ? "#0F766E" : "#F59E0B";
  const destinationName = destinationStation?.name || t("mapDestinationFallback", {
    defaultValue: "Selected destination",
  });
  const etaLabel =
    routeSummary?.durationMin != null
      ? `${Math.max(1, Math.round(routeSummary.durationMin))} ${t("homeScreen.route.min")}`
      : "--";
  const routeDistanceLabel =
    routeSummary?.distanceKm != null
      ? `${routeSummary.distanceKm.toFixed(1)} ${t("homeScreen.units.km")}`
      : formatDistanceLabel(remainingDistanceMeters, t);
  const locationSpeedLabel = formatSpeedLabel(location?.speed);
  const locationAccuracyLabel = Number.isFinite(Number(location?.accuracy))
    ? `${Math.round(Number(location.accuracy))} m`
    : "--";
  const liveStatusLabel = movementStatus === "moving"
    ? t("mapMovingLabel", { defaultValue: "Moving" })
    : t("mapStoppedLabel", { defaultValue: "Stopped" });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerCard}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>{t("map")}</Text>
          <Text style={styles.title}>
            {t("mapLiveTitle", { defaultValue: "Live Route Tracking" })}
          </Text>
          <Text style={styles.subtitle}>
            {destinationStation
              ? t("mapLiveSubtitleActive", {
                  defaultValue:
                    "Track movement, keep the route updated, and help users stay on course while they travel.",
                })
              : t("mapLiveSubtitleIdle", {
                  defaultValue:
                    "Open a route from Home, Alerts, or Saved Stations to start live navigation here.",
                })}
          </Text>
        </View>

        <View
          style={[
            styles.statusChip,
            movementStatus === "moving" ? styles.statusChipMoving : styles.statusChipStopped,
          ]}
        >
          <Ionicons
            name={movementStatus === "moving" ? "navigate" : "pause"}
            size={14}
            color={movementStatus === "moving" ? "#065F46" : "#92400E"}
          />
          <Text
            style={[
              styles.statusChipText,
              movementStatus === "moving" ? styles.statusChipTextMoving : styles.statusChipTextStopped,
            ]}
          >
            {liveStatusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.mapShell}>
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
              : destinationStation
                ? {
                    latitude: destinationStation.latitude,
                    longitude: destinationStation.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }
                : DEFAULT_REGION
          }
          showsUserLocation={false}
          showsCompass
          showsTraffic
        >
          {routeCoords.length ? (
            <Polyline coordinates={routeCoords} strokeWidth={6} strokeColor="#2563EB" />
          ) : null}

          {destinationStation ? (
            <Marker
              coordinate={{
                latitude: destinationStation.latitude,
                longitude: destinationStation.longitude,
              }}
              title={destinationName}
              description={destinationStation.address || ""}
              pinColor="#2563EB"
              tracksViewChanges={false}
            />
          ) : null}

          {location ? (
            <Marker
              coordinate={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.vehicleMarker,
                  { backgroundColor: vehicleMarkerColor },
                  Number.isFinite(Number(location.heading)) && location.heading > 0
                    ? { transform: [{ rotate: `${location.heading}deg` }] }
                    : null,
                ]}
              >
                <Ionicons name="car-sport" size={18} color="#FFFFFF" />
              </View>
            </Marker>
          ) : null}
        </MapView>

        <View style={styles.mapActions}>
          <Pressable style={styles.mapActionButton} onPress={onCenterUser} disabled={!location}>
            <Ionicons name="locate-outline" size={16} color="#0F172A" />
            <Text style={styles.mapActionText}>
              {t("mapCenterAction", { defaultValue: "Center" })}
            </Text>
          </Pressable>
          <Pressable style={styles.mapActionButton} onPress={onFitRoute} disabled={!destinationStation}>
            <Ionicons name="resize-outline" size={16} color="#0F172A" />
            <Text style={styles.mapActionText}>
              {t("mapFitRouteAction", { defaultValue: "Fit route" })}
            </Text>
          </Pressable>
          <Pressable style={styles.mapActionButtonDanger} onPress={onClearRoute} disabled={!destinationStation}>
            <Ionicons name="close-outline" size={16} color="#B91C1C" />
            <Text style={styles.mapActionTextDanger}>
              {t("mapClearAction", { defaultValue: "Clear" })}
            </Text>
          </Pressable>
        </View>

        {(trackingLocation || isRouting) ? (
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color="#0F766E" />
            <Text style={styles.loadingBadgeText}>
              {trackingLocation
                ? t("mapTrackingLoading", { defaultValue: "Starting live tracking..." })
                : t("mapRoutingLoading", { defaultValue: "Refreshing route..." })}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.infoCard}>
        {destinationStation ? (
          <>
            <Text style={styles.infoEyebrow}>
              {t("mapDestinationLabel", { defaultValue: "Destination" })}
            </Text>
            <Text style={styles.destinationName}>{destinationName}</Text>
            {destinationStation.address ? (
              <Text style={styles.destinationAddress}>{destinationStation.address}</Text>
            ) : null}

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>
                  {t("mapDistanceLabel", { defaultValue: "Distance left" })}
                </Text>
                <Text style={styles.metricValue}>{routeDistanceLabel}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>
                  {t("mapEtaLabel", { defaultValue: "ETA" })}
                </Text>
                <Text style={styles.metricValue}>{etaLabel}</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>
                  {t("mapSpeedLabel", { defaultValue: "Speed" })}
                </Text>
                <Text style={styles.metricValue}>{locationSpeedLabel}</Text>
              </View>
            </View>

            <View style={styles.helperRow}>
              <Text style={styles.helperText}>
                {t("mapAccuracyLabel", { defaultValue: "Accuracy" })}: {locationAccuracyLabel}
              </Text>
              <Text style={styles.helperText}>
                {t("mapUpdatedLabel", { defaultValue: "Updated" })}:{" "}
                {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "--"}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="map-outline" size={24} color="#0F766E" />
            </View>
            <Text style={styles.emptyTitle}>
              {t("mapReadyTitle", { defaultValue: "Map tab ready" })}
            </Text>
            <Text style={styles.emptySubtitle}>
              {t("mapReadyBody", {
                defaultValue:
                  "Pick a station route from Home, Alerts, or Saved Stations and this tab will switch into live tracking mode.",
              })}
            </Text>
          </View>
        )}

        {locationError ? <Text style={styles.noticeText}>{locationError}</Text> : null}
        {routeError ? <Text style={styles.errorText}>{routeError}</Text> : null}
        {!hasLocationPermission && !trackingLocation ? (
          <Text style={styles.noticeText}>
            {t("mapPermissionHint", {
              defaultValue: "Allow foreground location for moving route updates and live travel status.",
            })}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#EEF6FF",
  },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E7F7",
    gap: 12,
  },
  headerTextWrap: {
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#0F766E",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    color: "#64748B",
  },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  statusChipMoving: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  statusChipStopped: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "900",
  },
  statusChipTextMoving: {
    color: "#065F46",
  },
  statusChipTextStopped: {
    color: "#92400E",
  },
  mapShell: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E7F7",
    backgroundColor: "#FFFFFF",
  },
  map: {
    flex: 1,
  },
  mapActions: {
    position: "absolute",
    top: 14,
    right: 14,
    gap: 8,
  },
  mapActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#D9E7F7",
  },
  mapActionButtonDanger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  mapActionText: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
  },
  mapActionTextDanger: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
  },
  loadingBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#D9E7F7",
  },
  loadingBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  vehicleMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 14,
    padding: 16,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E7F7",
    gap: 10,
  },
  infoEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#1D4ED8",
  },
  destinationName: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0F172A",
  },
  destinationAddress: {
    marginTop: -2,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#64748B",
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D9E7F7",
    backgroundColor: "#F8FBFF",
    padding: 12,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
  },
  helperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  helperText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  emptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
  },
  emptySubtitle: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "700",
    color: "#64748B",
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#475569",
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
    color: "#B91C1C",
  },
});
