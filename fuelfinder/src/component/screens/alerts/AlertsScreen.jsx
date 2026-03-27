import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useLanguage } from "../../context/LanguageContext";
import { getPublicStationDetails } from "../../services/queueService";
import {
  clearFuelAlertHistory,
  loadFuelAlertHistory,
  markFuelAlertsRead,
} from "../../services/fuelAlertService";

function formatAlertTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function formatFuelLabel(value) {
  if (value === "diesel") return "Diesel";
  if (value === "electric") return "Electric";
  if (value === "other") return "Other";
  return "Gasoline";
}

function canShowRoute(alert) {
  const availability = String(alert?.availability || "").trim().toLowerCase();
  if (availability === "empty") return false;

  const latitude = Number(alert?.latitude);
  const longitude = Number(alert?.longitude);
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  const hasStationId = Boolean(String(alert?.stationId || "").trim());
  return hasCoords || hasStationId;
}

function buildRouteStationPayload(source, fallbackAlert) {
  const latitude = Number(source?.latitude);
  const longitude = Number(source?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const stationId = String(
    source?.stationId || source?._id || source?.id || fallbackAlert?.stationId || ""
  ).trim();
  const queueLength = Number(
    source?.queue_length ?? source?.queueLength ?? fallbackAlert?.queueLength ?? 0
  );

  return {
    stationId,
    id: stationId,
    name: String(source?.name || fallbackAlert?.stationName || "Fuel Station").trim() || "Fuel Station",
    address: String(source?.address || fallbackAlert?.address || "").trim(),
    latitude,
    longitude,
    queueLength: Number.isFinite(queueLength) && queueLength >= 0 ? queueLength : 0,
    fuel_status: String(
      source?.fuel_status || source?.fuelStatus || fallbackAlert?.availability || ""
    ).trim(),
  };
}

export default function AlertsScreen({ navigation }) {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [routingAlertId, setRoutingAlertId] = useState("");

  const refreshAlerts = useCallback(async (markRead = false) => {
    const nextAlerts = markRead ? await markFuelAlertsRead() : await loadFuelAlertHistory();
    setAlerts(nextAlerts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        const nextAlerts = await markFuelAlertsRead();
        if (mounted) {
          setAlerts(nextAlerts);
        }
      })();

      return () => {
        mounted = false;
      };
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAlerts(false);
    } finally {
      setRefreshing(false);
    }
  }, [refreshAlerts]);

  const onClear = useCallback(async () => {
    await clearFuelAlertHistory();
    setAlerts([]);
  }, []);

  const openAlertRoute = useCallback(
    async (alertItem) => {
      setRoutingAlertId(alertItem?.id || "");
      try {
        let routeStation = buildRouteStationPayload(alertItem, alertItem);
        if (!routeStation) {
          const stationId = String(alertItem?.stationId || "").trim();
          if (!stationId) {
            Alert.alert(
              t("routeUnavailableTitle", { defaultValue: "Route unavailable" }),
              t("routeUnavailableBody", {
                defaultValue: "This station does not have valid map coordinates yet.",
              })
            );
            return;
          }

          const stationDetail = await getPublicStationDetails(stationId);
          routeStation = buildRouteStationPayload(stationDetail, alertItem);
        }

        if (!routeStation) {
          Alert.alert(
            t("routeUnavailableTitle", { defaultValue: "Route unavailable" }),
            t("routeUnavailableBody", {
              defaultValue: "This station does not have valid map coordinates yet.",
            })
          );
          return;
        }

        navigation.navigate("Map", {
          routeRequest: {
            requestedAt: Date.now(),
            station: routeStation,
          },
        });
      } catch (_error) {
        Alert.alert(
          t("routeUnavailableTitle", { defaultValue: "Route unavailable" }),
          t("routeUnavailableBody", {
            defaultValue: "This station does not have valid map coordinates yet.",
          })
        );
      } finally {
        setRoutingAlertId("");
      }
    },
    [navigation, t]
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{t("alerts")}</Text>
          <Text style={styles.subtitle}>
            {t("alertsInboxSubtitle", {
              defaultValue: "Fuel and queue alerts appear here with live station details when something needs your attention.",
            })}
          </Text>
        </View>
        {alerts.length ? (
          <Pressable style={styles.clearButton} onPress={onClear}>
            <Text style={styles.clearButtonText}>
              {t("clearAllActionLabel", { defaultValue: "Clear all" })}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {!alerts.length ? (
        <View style={styles.emptyCard}>
          <Ionicons name="notifications-off-outline" size={26} color="#0F766E" />
          <Text style={styles.emptyTitle}>
            {t("alertsEmptyTitle", { defaultValue: "No alerts yet" })}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t("alertsEmptyBody", {
              defaultValue:
                "Turn on nearby fuel alerts, keep location sharing enabled, and FuelFinder will notify you when your preferred fuel is available nearby.",
            })}
          </Text>
        </View>
      ) : null}

      {alerts.map((alert) => (
        <View key={alert.id} style={[styles.alertCard, !alert.readAt && styles.alertCardUnread]}>
          <View style={styles.alertIconWrap}>
            <Ionicons name="flash-outline" size={18} color="#0F766E" />
          </View>
          <View style={styles.alertBody}>
            <View style={styles.alertTopRow}>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertTime}>{formatAlertTime(alert.triggeredAt)}</Text>
            </View>
            <Text style={styles.alertText}>{alert.body}</Text>

            <View style={styles.metaRow}>
              {alert.stationName ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{alert.stationName}</Text>
                </View>
              ) : null}
              {alert.preferredFuel ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{formatFuelLabel(alert.preferredFuel)}</Text>
                </View>
              ) : null}
              {alert.distanceLabel ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{alert.distanceLabel}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.detailStack}>
              {alert.reservationCode ? (
                <Text style={styles.detailText}>
                  {t("stationDetails.reservationCodeLabel", { defaultValue: "Reservation Code" })}: {alert.reservationCode}
                </Text>
              ) : null}
              {alert.availabilityLabel ? (
                <Text style={styles.detailText}>
                  {t("alertsAvailabilityLabel", { defaultValue: "Availability" })}: {alert.availabilityLabel}
                </Text>
              ) : null}
              {alert.inventorySummary ? (
                <Text style={styles.detailText}>
                  {t("alertsInventoryLabel", { defaultValue: "Fuel details" })}: {alert.inventorySummary}
                </Text>
              ) : null}
              {alert.queueSummary ? (
                <Text style={styles.detailText}>
                  {t("alertsQueueLabel", { defaultValue: "Queue" })}: {alert.queueSummary}
                </Text>
              ) : null}
              {alert.address ? (
                <Text style={styles.detailText}>
                  {t("alertsAddressLabel", { defaultValue: "Address" })}: {alert.address}
                </Text>
              ) : null}
            </View>

            {canShowRoute(alert) ? (
              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.routeButton, routingAlertId === alert.id && styles.routeButtonDisabled]}
                  onPress={() => openAlertRoute(alert)}
                  disabled={routingAlertId === alert.id}
                >
                  {routingAlertId === alert.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.routeButtonText}>{t("homeScreen.route.show")}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    color: "#64748B",
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  clearButtonText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  emptySubtitle: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: "#64748B",
  },
  alertCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 20,
    padding: 14,
  },
  alertCardUnread: {
    borderColor: "#5EEAD4",
    backgroundColor: "#F0FDFA",
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CCFBF1",
  },
  alertBody: {
    flex: 1,
  },
  alertTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  alertTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  alertTime: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "700",
  },
  alertText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  metaChipText: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "800",
  },
  detailStack: {
    marginTop: 10,
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
    fontWeight: "700",
  },
  actionRow: {
    marginTop: 12,
    flexDirection: "row",
  },
  routeButton: {
    minWidth: 112,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  routeButtonDisabled: {
    opacity: 0.7,
  },
  routeButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
});
