import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import QRCode from "react-native-qrcode-svg";

import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import {
  getMyQueueTicket,
  getPublicStationDetails,
  getReservationStatus,
  getStationQueue,
  leaveQueue,
  reserveQueueSlot,
  startChapaCheckout,
  startStationCheckIn,
  verifyChapaPayment,
} from "../../services/queueService";

const FALLBACK_NAME = "EV Charging Station";
const FALLBACK_VALUE = "Not provided";
const REQUESTED_BANDS = ["10-20", "20-40", "40+"];
const DEFAULT_EV_UNIT_PRICE = 25;
const DEFAULT_PLATFORM_FEE_PER_UNIT = 0.25;

function getStationIdentity(station) {
  return String(station?.stationId || station?._id || station?.id || "").trim();
}

function normalizePaymentDetails(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    providerName: String(source.providerName || "").trim(),
    accountName: String(source.accountName || "").trim(),
    accountNumber: String(source.accountNumber || "").trim(),
    phoneNumber: String(source.phoneNumber || "").trim(),
    instructions: String(source.instructions || "").trim(),
  };
}

function normalizeStationPayload(station) {
  if (!station || typeof station !== "object") {
    return {
      stationType: "electric",
      paymentDetails: normalizePaymentDetails(null),
      supportedFuels: { electric: true, unknown: false },
      locationCategories: [],
      queue_length: 0,
    };
  }

  const latitude = Number(station.latitude);
  const longitude = Number(station.longitude);

  return {
    ...station,
    id: String(station.id || getStationIdentity(station)).trim(),
    stationId: getStationIdentity(station),
    name: String(station.name || FALLBACK_NAME).trim() || FALLBACK_NAME,
    address: String(station.address || station.rawAddress || "").trim(),
    rawAddress: String(station.rawAddress || station.address || "").trim(),
    contact: String(station.contact || "").trim(),
    stationType: "electric",
    paymentDetails: normalizePaymentDetails(station.paymentDetails),
    supportedFuels: {
      ...(station.supportedFuels && typeof station.supportedFuels === "object"
        ? station.supportedFuels
        : {}),
      electric: true,
      unknown: false,
    },
    locationCategories: Array.isArray(station.locationCategories)
      ? station.locationCategories.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)
      : [],
    fuel_status: String(station.fuel_status || station.fuelStatus || "limited").trim().toLowerCase(),
    queue_length: Math.max(
      0,
      Number.isFinite(Number(station.queue_length ?? station.queueLength))
        ? Math.round(Number(station.queue_length ?? station.queueLength))
        : 0
    ),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    distanceMeters: Number.isFinite(Number(station.distanceMeters))
      ? Math.round(Number(station.distanceMeters))
      : null,
    isActive: station.isActive !== undefined ? Boolean(station.isActive) : true,
  };
}

function humanizeText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .split(/[-_]/g)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function formatDistance(distanceMeters, t) {
  if (!Number.isFinite(distanceMeters)) {
    return t("electricStationDetails.distanceUnknown", { defaultValue: "Distance unavailable" });
  }
  if (distanceMeters < 1000) {
    return `${Math.max(1, Math.round(distanceMeters))} ${t("homeScreen.units.meters", {
      defaultValue: "m",
    })}`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} ${t("homeScreen.units.km", { defaultValue: "km" })}`;
}

function formatCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return FALLBACK_VALUE;
  return numeric.toFixed(5);
}

function formatTimestamp(value) {
  if (!value) return FALLBACK_VALUE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return FALLBACK_VALUE;
  return date.toLocaleString();
}

function isObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());
}

function normalizeTicketPayload(ticket) {
  if (!ticket) return null;
  const position = Number(ticket.position || 0);
  return {
    ticketId: String(ticket.ticketId || ticket.reservationId || ""),
    reservationCode: String(ticket.reservationCode || ""),
    status: String(ticket.status || ""),
    position,
    etaMinutes: Number(ticket.etaMinutes ?? Math.max(0, position * 3)),
    fuelType: String(ticket.fuelType || ""),
    requestedLiters: Number(ticket.requestedLiters || 0),
    estimatedAmount: Number(ticket.estimatedAmount || 0),
    expiresAt: ticket.expiresAt || null,
  };
}

function logReservationError(scope, error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const message = error?.message;
  console.error(`[ElectricStationDetails:${scope}]`, {
    status,
    message,
    data,
  });
}

function getEvStatusMeta(status, isActive, t) {
  if (!isActive) {
    return {
      label: t("electricStationDetails.status.inactive", { defaultValue: "Inactive" }),
      title: t("electricStationDetails.statusTitle.inactive", { defaultValue: "Station is hidden right now" }),
      body: t("electricStationDetails.statusBody.inactive", {
        defaultValue: "This EV site is saved in the network, but it is not currently active for customers.",
      }),
      badgeStyle: styles.statusBadgeOffline,
      badgeTextStyle: styles.statusBadgeOfflineText,
      accentStyle: styles.heroStatusOffline,
    };
  }

  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "available" || normalized === "full") {
    return {
      label: t("electricStationDetails.status.ready", { defaultValue: "Ready" }),
      title: t("electricStationDetails.statusTitle.ready", { defaultValue: "Chargers look ready" }),
      body: t("electricStationDetails.statusBody.ready", {
        defaultValue: "This station is marked available, so it is a strong option for your next stop.",
      }),
      badgeStyle: styles.statusBadgeReady,
      badgeTextStyle: styles.statusBadgeReadyText,
      accentStyle: styles.heroStatusReady,
    };
  }

  if (normalized === "limited" || normalized === "partial") {
    return {
      label: t("electricStationDetails.status.busy", { defaultValue: "Busy" }),
      title: t("electricStationDetails.statusTitle.busy", { defaultValue: "Charging is available with some wait" }),
      body: t("electricStationDetails.statusBody.busy", {
        defaultValue: "Expect a short queue or reduced charger availability before a plug opens up.",
      }),
      badgeStyle: styles.statusBadgeBusy,
      badgeTextStyle: styles.statusBadgeBusyText,
      accentStyle: styles.heroStatusBusy,
    };
  }

  return {
    label: t("electricStationDetails.status.offline", { defaultValue: "Offline" }),
    title: t("electricStationDetails.statusTitle.offline", { defaultValue: "Charging is currently offline" }),
    body: t("electricStationDetails.statusBody.offline", {
      defaultValue: "This location is marked unavailable, so it is safer to route to another charger for now.",
    }),
    badgeStyle: styles.statusBadgeOffline,
    badgeTextStyle: styles.statusBadgeOfflineText,
    accentStyle: styles.heroStatusOffline,
  };
}

function getWaitEstimateMinutes(queueLength, status, isActive) {
  const queue = Math.max(0, Number(queueLength || 0));
  const normalized = String(status || "").trim().toLowerCase();
  if (!isActive || normalized === "empty" || normalized === "offline") return null;
  if (queue <= 0) return 0;
  return Math.max(10, queue * 15);
}

function buildSupportTags(station, t) {
  const tags = [];
  if (station?.supportedFuels?.electric) {
    tags.push(t("electricStationDetails.support.electric", { defaultValue: "EV charging" }));
  }
  for (const category of station?.locationCategories || []) {
    const humanized = humanizeText(category);
    if (humanized && !tags.includes(humanized)) {
      tags.push(humanized);
    }
  }
  return tags.length ? tags : [t("electricStationDetails.support.default", { defaultValue: "Charging network" })];
}

function getLocationRows(station, t) {
  return [
    {
      label: t("electricStationDetails.region", { defaultValue: "Region" }),
      value: station?.region?.name || FALLBACK_VALUE,
    },
    {
      label: t("electricStationDetails.city", { defaultValue: "City" }),
      value: station?.city?.name || FALLBACK_VALUE,
    },
    {
      label: t("electricStationDetails.subcity", { defaultValue: "Subcity" }),
      value: station?.subcity || FALLBACK_VALUE,
    },
    {
      label: t("electricStationDetails.woreda", { defaultValue: "Woreda" }),
      value: station?.woreda || station?.woredaDirectory?.name || FALLBACK_VALUE,
    },
    {
      label: t("electricStationDetails.landmark", { defaultValue: "Landmark" }),
      value: station?.landmark || FALLBACK_VALUE,
    },
  ];
}

function buildArrivalTips(station, waitMinutes, t) {
  const tips = [];

  if (waitMinutes === null) {
    tips.push(
      t("electricStationDetails.tip.offline", {
        defaultValue: "The charger is not ready right now, so confirm availability before you drive there.",
      })
    );
  } else if (waitMinutes === 0) {
    tips.push(
      t("electricStationDetails.tip.instant", {
        defaultValue: "Queue is clear at the moment, so this is a good time to leave and charge.",
      })
    );
  } else {
    tips.push(
      t("electricStationDetails.tip.wait", {
        defaultValue: "Expect a short wait before a charger becomes free.",
      })
    );
  }

  if (!station?.contact && !station?.paymentDetails?.phoneNumber) {
    tips.push(
      t("electricStationDetails.tip.contact", {
        defaultValue: "No direct contact number is saved yet, so use the map route and verify details on arrival.",
      })
    );
  } else {
    tips.push(
      t("electricStationDetails.tip.callAhead", {
        defaultValue: "Call ahead if you want to confirm charger readiness before you start driving.",
      })
    );
  }

  if (!station?.paymentDetails?.providerName && !station?.paymentDetails?.accountNumber) {
    tips.push(
      t("electricStationDetails.tip.payment", {
        defaultValue: "Digital payment instructions are not listed, so be ready to confirm payment at the site.",
      })
    );
  } else {
    tips.push(
      t("electricStationDetails.tip.paymentReady", {
        defaultValue: "Payment details are stored for this station, which makes arrival and charging smoother.",
      })
    );
  }

  return tips;
}

function hasPaymentInfo(paymentDetails) {
  return Boolean(
    paymentDetails?.providerName ||
      paymentDetails?.accountName ||
      paymentDetails?.accountNumber ||
      paymentDetails?.phoneNumber ||
      paymentDetails?.instructions
  );
}

function formatChargeType(value, t) {
  if (String(value || "").trim().toLowerCase() === "electric") {
    return t("electricStationDetails.chargeTypeValue", { defaultValue: "EV charging" });
  }
  return humanizeText(value) || t("electricStationDetails.chargeTypeValue", { defaultValue: "EV charging" });
}

function SectionCard({ icon, title, subtitle, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={18} color="#0f766e" />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.metricHint}>{hint}</Text> : null}
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || FALLBACK_VALUE}</Text>
    </View>
  );
}

function ActionButton({ icon, label, onPress, variant = "secondary", disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "primary" ? styles.actionButtonPrimary : styles.actionButtonSecondary,
        disabled ? styles.actionButtonDisabled : null,
        pressed && !disabled ? styles.actionButtonPressed : null,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={variant === "primary" ? "#ffffff" : "#0f766e"}
      />
      <Text
        style={[
          styles.actionButtonLabel,
          variant === "primary" ? styles.actionButtonLabelPrimary : styles.actionButtonLabelSecondary,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ElectricStationDetails({ navigation, route }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const seedStation = route?.params?.station || null;
  const seedStationId = getStationIdentity(seedStation);
  const [station, setStation] = useState(() => normalizeStationPayload(seedStation));
  const [loading, setLoading] = useState(Boolean(seedStationId));
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(seedStation ? Date.now() : null);
  const [requestedBand, setRequestedBand] = useState("10-20");
  const [requestedCharge, setRequestedCharge] = useState("20");
  const [reservationId, setReservationId] = useState("");
  const [reservationCode, setReservationCode] = useState("");
  const [txRef, setTxRef] = useState("");
  const [myTicket, setMyTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [paymentPhase, setPaymentPhase] = useState("idle");
  const [liveQueueCount, setLiveQueueCount] = useState(null);
  const [checkInSession, setCheckInSession] = useState(null);
  const [checkInStatusText, setCheckInStatusText] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const copyTimerRef = useRef(null);

  useEffect(() => {
    setStation(normalizeStationPayload(seedStation));
    setLoading(Boolean(seedStationId));
    setRefreshing(false);
  }, [seedStation, seedStationId]);

  const stationId = useMemo(
    () => getStationIdentity(station) || seedStationId,
    [seedStationId, station]
  );
  const queueEnabled = isObjectId(stationId);
  const queueCount = useMemo(
    () =>
      Number(
        liveQueueCount !== null && liveQueueCount !== undefined
          ? liveQueueCount
          : station?.queue_length || 0
      ),
    [liveQueueCount, station?.queue_length]
  );
  const evUnitPrice = useMemo(() => {
    const raw =
      station?.fuelPrices?.other ??
      station?.fuel_prices?.other ??
      station?.otherPrice ??
      station?.other_price ??
      process.env.EXPO_PUBLIC_EV_PRICE_PER_KWH_ETB ??
      DEFAULT_EV_UNIT_PRICE;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return DEFAULT_EV_UNIT_PRICE;
    return Number(value.toFixed(2));
  }, [station]);
  const platformFeeRate = useMemo(() => {
    const raw =
      process.env.EXPO_PUBLIC_CHAPA_PLATFORM_FEE_PER_KWH_ETB ??
      process.env.EXPO_PUBLIC_CHAPA_PLATFORM_FEE_PER_LITER_BIRR ??
      DEFAULT_PLATFORM_FEE_PER_UNIT;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return DEFAULT_PLATFORM_FEE_PER_UNIT;
    return Number(value.toFixed(2));
  }, []);
  const requestedChargeValue = Number(requestedCharge);
  const estimatedAmount =
    Number.isFinite(requestedChargeValue) && requestedChargeValue > 0
      ? Number((requestedChargeValue * evUnitPrice).toFixed(2))
      : 0;
  const platformFeeAmount =
    Number.isFinite(requestedChargeValue) && requestedChargeValue > 0
      ? Number((requestedChargeValue * platformFeeRate).toFixed(2))
      : 0;
  const amountToPay =
    estimatedAmount > 0 ? Number((estimatedAmount + platformFeeAmount).toFixed(2)) : 0;
  const hasManualPaymentDetails = useMemo(
    () => hasPaymentInfo(station?.paymentDetails),
    [station?.paymentDetails]
  );
  const paymentDetailRows = useMemo(
    () =>
      [
        {
          key: "providerName",
          label: t("stationDetails.paymentProvider", { defaultValue: "Provider" }),
          value: station?.paymentDetails?.providerName || "",
          copyable: false,
        },
        {
          key: "phoneNumber",
          label: t("stationDetails.paymentPhone", { defaultValue: "Phone" }),
          value: station?.paymentDetails?.phoneNumber || "",
          copyable: true,
        },
        {
          key: "accountName",
          label: t("stationDetails.paymentAccountName", { defaultValue: "Account name" }),
          value: station?.paymentDetails?.accountName || "",
          copyable: true,
        },
        {
          key: "accountNumber",
          label: t("stationDetails.paymentAccountNumber", { defaultValue: "Account number" }),
          value: station?.paymentDetails?.accountNumber || "",
          copyable: true,
        },
        {
          key: "instructions",
          label: t("stationDetails.paymentInstructions", { defaultValue: "Instructions" }),
          value: station?.paymentDetails?.instructions || "",
          copyable: false,
        },
      ].filter((item) => item.value),
    [station?.paymentDetails, t]
  );

  const statusMeta = useMemo(
    () => getEvStatusMeta(station?.fuel_status, station?.isActive, t),
    [station?.fuel_status, station?.isActive, t]
  );

  const waitMinutes = useMemo(
    () => getWaitEstimateMinutes(queueCount, station?.fuel_status, station?.isActive),
    [queueCount, station?.fuel_status, station?.isActive]
  );

  const supportTags = useMemo(() => buildSupportTags(station, t), [station, t]);
  const arrivalTips = useMemo(() => buildArrivalTips(station, waitMinutes, t), [station, waitMinutes, t]);
  const locationRows = useMemo(() => getLocationRows(station, t), [station, t]);
  const canStartCheckIn = Boolean(myTicket?.ticketId) &&
    ["waiting", "called"].includes(String(myTicket?.status || "").toLowerCase());

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title:
        station?.name && station.name !== FALLBACK_NAME
          ? station.name
          : t("electricStationDetails.screenTitle", { defaultValue: "EV Station Details" }),
    });
  }, [navigation, station?.name, t]);

  const loadStation = useCallback(
    async ({ silent = false } = {}) => {
      if (!stationId) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const nextStation = await getPublicStationDetails(stationId);
        setStation(normalizeStationPayload(nextStation));
        setLastUpdatedAt(Date.now());
      } catch (error) {
        console.error("[ElectricStationDetails] Failed to load station", error);
        Alert.alert(
          t("electricStationDetails.loadFailedTitle", { defaultValue: "Unable to load EV station" }),
          error?.response?.data?.message ||
            error?.message ||
            t("electricStationDetails.loadFailedBody", {
              defaultValue: "Please try refreshing this charger again.",
            })
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [stationId, t]
  );

  useEffect(() => {
    loadStation();
  }, [loadStation]);

  const openLiveRoute = useCallback(() => {
    if (!Number.isFinite(Number(station?.latitude)) || !Number.isFinite(Number(station?.longitude))) {
      Alert.alert(
        t("electricStationDetails.routeUnavailableTitle", { defaultValue: "Route unavailable" }),
        t("electricStationDetails.routeUnavailableBody", {
          defaultValue: "This EV station does not have coordinates yet.",
        })
      );
      return;
    }

    const payload = {
      routeRequest: {
        requestedAt: Date.now(),
        station: {
          id: station?.id || stationId,
          stationId: stationId || station?.id,
          stationType: "electric",
          name: station?.name || FALLBACK_NAME,
          address: station?.address || station?.rawAddress || "",
          latitude: Number(station.latitude),
          longitude: Number(station.longitude),
        },
      },
    };

    const parentNavigation = navigation?.getParent?.();
    if (parentNavigation?.navigate) {
      parentNavigation.navigate("Map", payload);
      return;
    }

    navigation?.navigate?.("Map", payload);
  }, [navigation, station, stationId, t]);

  const openBrowserMaps = useCallback(async () => {
    if (!Number.isFinite(Number(station?.latitude)) || !Number.isFinite(Number(station?.longitude))) {
      Alert.alert(
        t("electricStationDetails.routeUnavailableTitle", { defaultValue: "Route unavailable" }),
        t("electricStationDetails.routeUnavailableBody", {
          defaultValue: "This EV station does not have coordinates yet.",
        })
      );
      return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`;
    await WebBrowser.openBrowserAsync(url);
  }, [station?.latitude, station?.longitude, t]);

  const callStation = useCallback(async () => {
    const phone = String(station?.contact || station?.paymentDetails?.phoneNumber || "")
      .trim()
      .replace(/[^\d+]/g, "");

    if (!phone) {
      Alert.alert(
        t("electricStationDetails.phoneUnavailableTitle", { defaultValue: "Phone unavailable" }),
        t("electricStationDetails.phoneUnavailableBody", {
          defaultValue: "No contact number is stored for this EV station yet.",
        })
      );
      return;
    }

    const phoneUrl = `tel:${phone}`;
    const supported = await Linking.canOpenURL(phoneUrl);
    if (!supported) {
      Alert.alert(
        t("electricStationDetails.phoneUnavailableTitle", { defaultValue: "Phone unavailable" }),
        t("electricStationDetails.phoneUnavailableBody", {
          defaultValue: "Your device could not start a call for this EV station.",
        })
      );
      return;
    }

    await Linking.openURL(phoneUrl);
  }, [station?.contact, station?.paymentDetails?.phoneNumber, t]);

  useEffect(() => {
    let active = true;
    if (!queueEnabled) return undefined;

    const fetchQueueSnapshot = async () => {
      try {
        const queue = await getStationQueue(stationId);
        if (!active) return;
        setLiveQueueCount(Number(queue?.waitingCount || 0));
      } catch (_error) {
        if (!active) return;
        setLiveQueueCount(null);
      }
    };

    fetchQueueSnapshot();
    const id = setInterval(fetchQueueSnapshot, 10000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [queueEnabled, stationId]);

  useEffect(() => {
    let active = true;
    if (!queueEnabled) return undefined;

    const fetchMyLiveTicket = async () => {
      try {
        const ticket = await getMyQueueTicket(stationId);
        if (!active) return;
        const normalized = normalizeTicketPayload(ticket);
        setMyTicket(normalized);
        if (normalized?.ticketId) {
          setReservationId(String(normalized.ticketId || ""));
        }
        if (normalized?.reservationCode) {
          setReservationCode(String(normalized.reservationCode || ""));
        }
      } catch (error) {
        if (!active) return;
        if (Number(error?.response?.status || 0) === 404) {
          setMyTicket(null);
        }
      }
    };

    fetchMyLiveTicket();
    const id = setInterval(fetchMyLiveTicket, 8000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [queueEnabled, stationId]);

  const copyPaymentDetail = useCallback(
    async (fieldKey, value) => {
      const text = String(value || "").trim();
      if (!text) return;
      try {
        await Clipboard.setStringAsync(text);
        setCopiedField(fieldKey);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => {
          setCopiedField((current) => (current === fieldKey ? "" : current));
        }, 1800);
      } catch (error) {
        console.error("[ElectricStationDetails:copyPaymentDetail]", error);
        Alert.alert(
          t("stationDetails.copyFailedTitle", { defaultValue: "Copy failed" }),
          t("stationDetails.copyFailedBody", {
            defaultValue: "Could not copy this payment detail right now.",
          })
        );
      }
    },
    [t]
  );

  const refreshMyTicket = useCallback(async () => {
    if (!queueEnabled) return;
    setActionLoading(true);
    try {
      const ticket = await getMyQueueTicket(stationId);
      const normalized = normalizeTicketPayload(ticket);
      setMyTicket(normalized);
      setReservationCode(String(normalized?.reservationCode || ""));
      setMessage(
        t("stationDetails.activeTicketLoaded", { defaultValue: "Active ticket loaded." })
      );
    } catch (error) {
      logReservationError("refreshMyTicket", error);
      setMyTicket(null);
      setMessage(
        error?.response?.data?.message ||
          t("stationDetails.noActiveTicket", { defaultValue: "No active ticket." })
      );
    } finally {
      setActionLoading(false);
    }
  }, [queueEnabled, stationId, t]);

  const pollReservation = useCallback(
    async (nextReservationId, immediate = false) => {
      if (!nextReservationId) return;

      const runPoll = async () => {
        const status = await getReservationStatus(nextReservationId);
        if (status.status === "waiting" || status.status === "called") {
          setMyTicket(
            normalizeTicketPayload({
              ticketId: status.reservationId,
              reservationCode: status.reservationCode,
              status: status.status,
              position: status.position,
              etaMinutes: Number(status.position || 0) * 3,
              fuelType: status.fuelType,
              requestedLiters: status.requestedLiters,
              estimatedAmount: status.estimatedAmount,
              expiresAt: status.expiresAt,
            })
          );
          setPaymentPhase("verified");
          setMessage(
            t("stationDetails.paymentVerified", { defaultValue: "Payment verified." })
          );
          return true;
        }
        if (status.status === "expired") {
          setPaymentPhase("expired");
          setMessage(
            t("stationDetails.reservationExpired", { defaultValue: "Reservation payment window expired." })
          );
          return true;
        }
        return false;
      };

      if (immediate) {
        try {
          const done = await runPoll();
          if (done) return;
        } catch (error) {
          logReservationError("pollReservationImmediate", error);
        }
      }

      let attempts = 0;
      const pollId = setInterval(async () => {
        attempts += 1;
        try {
          const done = await runPoll();
          if (done || attempts >= 30) {
            clearInterval(pollId);
            if (attempts >= 30 && !done) {
              setPaymentPhase("pending");
              setMessage(
                t("stationDetails.waitingPaymentConfirm", {
                  defaultValue: "Waiting for payment confirmation.",
                })
              );
            }
          }
        } catch (error) {
          logReservationError("pollReservation", error);
          if (attempts >= 30) {
            clearInterval(pollId);
          }
        }
      }, 2000);
    },
    [t]
  );

  const reserveAndInitiateChapa = useCallback(async () => {
    if (!queueEnabled) {
      Alert.alert(
        t("stationDetails.stationIdMissingTitle", { defaultValue: "Station unavailable" }),
        t("stationDetails.stationIdMissingBody", {
          defaultValue: "This EV station is missing a valid id for queue reservation.",
        })
      );
      return;
    }

    if (!Number.isFinite(requestedChargeValue) || requestedChargeValue <= 0) {
      Alert.alert(
        t("electricStationDetails.invalidChargeTitle", { defaultValue: "Invalid charge amount" }),
        t("electricStationDetails.invalidChargeBody", {
          defaultValue: "Enter a charging amount greater than zero to reserve a queue slot.",
        })
      );
      return;
    }

    setActionLoading(true);
    setMessage("");
    setPaymentPhase("reserving");
    try {
      const reserve = await reserveQueueSlot({
        stationId,
        requestedBand,
        fuelType: "electric",
        requestedLiters: requestedChargeValue,
        unitPrice: evUnitPrice,
      });

      const nextReservationId = String(reserve?.reservationId || "");
      const nextReservationCode = String(reserve?.reservationCode || "");

      setReservationId(nextReservationId);
      setReservationCode(nextReservationCode);

      if (reserve?.offlineQueued) {
        setPaymentPhase("pending");
        setMessage(
          reserve?.message ||
            t("stationDetails.queueSavedOffline", {
              defaultValue: "Queue request saved offline. It will sync when you reconnect.",
            })
        );
        return;
      }

      const userEmail = String(user?.email || "").trim();
      if (!userEmail) {
        throw new Error(
          t("stationDetails.emailRequired", {
            defaultValue: "Email is required for Chapa payment.",
          })
        );
      }

      const nameParts = String(user?.name || "Customer").trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "User";

      const chapaInit = await startChapaCheckout({
        reservationId: nextReservationId,
        email: userEmail,
        first_name: firstName,
        last_name: lastName,
      });

      const checkoutUrl = chapaInit?.data?.checkout_url || chapaInit?.data?.checkoutUrl;
      const nextTxRef =
        chapaInit?.data?.tx_ref ||
        chapaInit?.data?.reference ||
        chapaInit?.meta?.tx_ref ||
        "";
      if (nextTxRef) setTxRef(String(nextTxRef));
      if (!checkoutUrl) {
        throw new Error(
          t("stationDetails.checkoutUrlMissing", {
            defaultValue: "Chapa checkout URL not available.",
          })
        );
      }

      await WebBrowser.openBrowserAsync(checkoutUrl);
      setPaymentPhase("pending");
      setMessage(
        t("stationDetails.paymentInitiated", { defaultValue: "Payment started. Finish it in Chapa." })
      );
      await pollReservation(nextReservationId, true);
    } catch (error) {
      logReservationError("reserveAndInitiateChapa", error);
      setPaymentPhase("failed");
      setMessage(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          t("stationDetails.failedStartPayment", { defaultValue: "Failed to start payment." })
      );
    } finally {
      setActionLoading(false);
    }
  }, [evUnitPrice, pollReservation, queueEnabled, requestedBand, requestedChargeValue, stationId, t, user]);

  const checkReservationNow = useCallback(async () => {
    if (!reservationId) {
      Alert.alert(
        t("stationDetails.missingReservationTitle", { defaultValue: "Reservation missing" }),
        t("stationDetails.missingReservationBody", {
          defaultValue: "Start a reservation before checking payment.",
        })
      );
      return;
    }
    setActionLoading(true);
    try {
      if (txRef) {
        try {
          await verifyChapaPayment(txRef);
        } catch (verifyError) {
          logReservationError("verifyChapaPayment", verifyError);
        }
      }
      await pollReservation(reservationId, true);
    } finally {
      setActionLoading(false);
    }
  }, [pollReservation, reservationId, t, txRef]);

  const leaveMyQueue = useCallback(async () => {
    const ticketId = myTicket?.ticketId;
    if (!ticketId) {
      Alert.alert(
        t("stationDetails.noTicketTitle", { defaultValue: "No ticket" }),
        t("stationDetails.noTicketBody", { defaultValue: "You do not have an active queue ticket." })
      );
      return;
    }
    setActionLoading(true);
    try {
      const result = await leaveQueue(ticketId);
      if (result?.offlineQueued) {
        setMessage(
          result?.message ||
            t("stationDetails.leaveSavedOffline", {
              defaultValue: "Leave-queue request saved offline. It will sync when you reconnect.",
            })
        );
        return;
      }
      setMyTicket(null);
      setReservationId("");
      setReservationCode("");
      setTxRef("");
      setPaymentPhase("idle");
      setCheckInSession(null);
      setCheckInStatusText("");
      setMessage(t("stationDetails.leftQueue", { defaultValue: "You left the queue." }));
    } catch (error) {
      logReservationError("leaveMyQueue", error);
      setMessage(
        error?.response?.data?.message ||
          t("stationDetails.failedLeaveQueue", { defaultValue: "Failed to leave queue." })
      );
    } finally {
      setActionLoading(false);
    }
  }, [myTicket?.ticketId, t]);

  const startCheckInNow = useCallback(async () => {
    const ticketId = myTicket?.ticketId || reservationId;
    if (!ticketId) {
      Alert.alert(
        t("stationDetails.checkInMissingTicketTitle", { defaultValue: "Queue ticket required" }),
        t("stationDetails.checkInMissingTicketBody", {
          defaultValue: "Reserve and pay first before starting station check-in.",
        })
      );
      return;
    }
    if (!canStartCheckIn) {
      setCheckInStatusText(
        t("stationDetails.completePaymentFirst", {
          defaultValue: "Complete payment and wait for an active ticket before check-in.",
        })
      );
      return;
    }

    setActionLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          t("stationDetails.locationRequiredTitle", { defaultValue: "Location required" }),
          t("stationDetails.locationRequiredBody", {
            defaultValue: "Allow location access to start station check-in.",
          })
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const session = await startStationCheckIn({
        ticketId,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setCheckInSession(session);
      setCheckInStatusText(
        t("electricStationDetails.checkInStarted", {
          defaultValue: "Check-in started. Show the OTP or QR code to the station attendant.",
        })
      );
    } catch (error) {
      logReservationError("startCheckInNow", error);
      setCheckInStatusText(
        error?.response?.data?.message ||
          t("stationDetails.startCheckInFailed", {
            defaultValue: "Failed to start station check-in.",
          })
      );
    } finally {
      setActionLoading(false);
    }
  }, [canStartCheckIn, myTicket?.ticketId, reservationId, t]);

  if (!stationId && !station?.name) {
    return (
      <View style={styles.centerState}>
        <Ionicons name="flash-off-outline" size={36} color="#64748b" />
        <Text style={styles.centerStateTitle}>
          {t("electricStationDetails.missingTitle", { defaultValue: "EV station not found" })}
        </Text>
        <Text style={styles.centerStateBody}>
          {t("electricStationDetails.missingBody", {
            defaultValue: "We could not find this charging station in the current session.",
          })}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
      <View style={[styles.heroCard, statusMeta.accentStyle]}>
        <View style={styles.heroHeader}>
          <View style={styles.heroBadge}>
            <Ionicons name="flash" size={14} color="#ecfeff" />
            <Text style={styles.heroBadgeText}>
              {t("electricStationDetails.heroBadge", { defaultValue: "EV station" })}
            </Text>
          </View>
          <View style={[styles.statusBadge, statusMeta.badgeStyle]}>
            <Text style={[styles.statusBadgeText, statusMeta.badgeTextStyle]}>{statusMeta.label}</Text>
          </View>
        </View>

        <Text style={styles.heroTitle}>{station?.name || FALLBACK_NAME}</Text>
        <Text style={styles.heroSubtitle}>
          {station?.address ||
            station?.rawAddress ||
            t("electricStationDetails.addressFallback", {
              defaultValue: "Address details have not been added for this charging site yet.",
            })}
        </Text>

        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaChip}>
            <Ionicons name="location-outline" size={14} color="#ecfeff" />
            <Text style={styles.heroMetaText}>{formatDistance(station?.distanceMeters, t)}</Text>
          </View>
          <View style={styles.heroMetaChip}>
            <Ionicons name="time-outline" size={14} color="#ecfeff" />
            <Text style={styles.heroMetaText}>
              {waitMinutes === null
                ? t("electricStationDetails.offlineShort", { defaultValue: "Offline" })
                : waitMinutes === 0
                  ? t("electricStationDetails.availableNow", { defaultValue: "Available now" })
                  : `${waitMinutes} ${t("homeScreen.route.min", { defaultValue: "min" })}`}
            </Text>
          </View>
        </View>

        <Text style={styles.heroBody}>{statusMeta.body}</Text>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard
          label={t("electricStationDetails.metric.status", { defaultValue: "Charging status" })}
          value={statusMeta.label}
          hint={statusMeta.title}
        />
        <MetricCard
          label={t("electricStationDetails.metric.queue", { defaultValue: "Queued EVs" })}
          value={String(queueCount)}
          hint={t("electricStationDetails.metric.queueHint", { defaultValue: "Current queue snapshot" })}
        />
        <MetricCard
          label={t("electricStationDetails.metric.wait", { defaultValue: "Estimated wait" })}
          value={
            waitMinutes === null
              ? t("electricStationDetails.offlineShort", { defaultValue: "Offline" })
              : waitMinutes === 0
                ? t("electricStationDetails.availableNow", { defaultValue: "Available now" })
                : `${waitMinutes} ${t("homeScreen.route.min", { defaultValue: "min" })}`
          }
          hint={t("electricStationDetails.metric.waitHint", {
            defaultValue: "Calculated from current EV queue length",
          })}
        />
        <MetricCard
          label={t("electricStationDetails.metric.access", { defaultValue: "Station access" })}
          value={
            station?.isActive
              ? t("electricStationDetails.active", { defaultValue: "Active" })
              : t("electricStationDetails.inactive", { defaultValue: "Inactive" })
          }
          hint={t("electricStationDetails.metric.accessHint", { defaultValue: "Customer visibility state" })}
        />
      </View>

      <SectionCard
        icon="navigate-outline"
        title={t("electricStationDetails.actionsTitle", { defaultValue: "Drive and connect" })}
        subtitle={t("electricStationDetails.actionsBody", {
          defaultValue: "Open live route guidance, launch browser maps, or call the station before you leave.",
        })}
      >
        <View style={styles.actionsGrid}>
          <ActionButton
            icon="map"
            label={t("electricStationDetails.action.route", { defaultValue: "Live route" })}
            onPress={openLiveRoute}
            variant="primary"
          />
          <ActionButton
            icon="navigate-circle-outline"
            label={t("electricStationDetails.action.browser", { defaultValue: "Open Maps" })}
            onPress={openBrowserMaps}
          />
          <ActionButton
            icon="call-outline"
            label={t("electricStationDetails.action.call", { defaultValue: "Call station" })}
            onPress={callStation}
          />
          <ActionButton
            icon={refreshing ? "hourglass-outline" : "refresh-outline"}
            label={
              refreshing
                ? t("electricStationDetails.action.refreshing", { defaultValue: "Refreshing" })
                : t("electricStationDetails.action.refresh", { defaultValue: "Refresh" })
            }
            onPress={() => loadStation({ silent: true })}
            disabled={refreshing}
          />
        </View>
      </SectionCard>

      <SectionCard
        icon="battery-charging-outline"
        title={t("electricStationDetails.readinessTitle", { defaultValue: "Charging readiness" })}
        subtitle={t("electricStationDetails.readinessBody", {
          defaultValue: "A richer EV summary so drivers can judge whether this stop is worth the trip.",
        })}
      >
        <DetailRow
          label={t("electricStationDetails.readiness.statusLabel", { defaultValue: "Network status" })}
          value={statusMeta.label}
        />
        <DetailRow
          label={t("electricStationDetails.readiness.queueLabel", { defaultValue: "Current EV queue" })}
          value={String(queueCount)}
        />
        <DetailRow
          label={t("electricStationDetails.readiness.estimateLabel", { defaultValue: "Expected wait" })}
          value={
            waitMinutes === null
              ? t("electricStationDetails.offlineShort", { defaultValue: "Offline" })
              : waitMinutes === 0
                ? t("electricStationDetails.availableNow", { defaultValue: "Available now" })
                : `${waitMinutes} ${t("homeScreen.route.min", { defaultValue: "min" })}`
          }
        />
        <DetailRow
          label={t("electricStationDetails.readiness.typeLabel", { defaultValue: "Service type" })}
          value={supportTags.join(", ")}
        />
        <DetailRow
          label={t("electricStationDetails.readiness.updatedLabel", { defaultValue: "Last refresh" })}
          value={formatTimestamp(lastUpdatedAt)}
        />
      </SectionCard>

      <View style={styles.legacyCard}>
        <Text style={styles.legacySectionTitle}>
          {t("stationDetails.queueWait", { defaultValue: "Queue and wait time" })}
        </Text>
        <View style={styles.queueCard}>
          <Text style={styles.legacySectionTitle}>
            {t("stationDetails.queueWait", { defaultValue: "Queue and wait time" })}
          </Text>
          <View style={styles.queueStatsRow}>
            <View style={styles.queueMiniCard}>
              <Text style={styles.queueMiniLabel}>
                {t("stationDetails.queueLength", { defaultValue: "Queue length" })}
              </Text>
              <Text style={styles.queueMiniValue}>{queueCount}</Text>
            </View>
            <View style={[styles.queueMiniCard, styles.queueMiniCardLast]}>
              <Text style={styles.queueMiniLabel}>
                {t("stationDetails.estWait", { defaultValue: "Estimated wait" })}
              </Text>
              <Text style={styles.queueMiniValue}>
                {waitMinutes === null
                  ? t("electricStationDetails.offlineShort", { defaultValue: "Offline" })
                  : `${waitMinutes} ${t("homeScreen.route.min", { defaultValue: "min" })}`}
              </Text>
            </View>
          </View>
          <View style={styles.myQueueBox}>
            <Text style={styles.myQueueTitle}>
              {t("stationDetails.myQueueTitle", { defaultValue: "My Queue (Realtime)" })}
            </Text>
            <Text style={styles.myQueueText}>
              {t("stationDetails.statusLabel", { defaultValue: "Status" })}:{" "}
              {String(
                myTicket?.status ||
                  t("stationDetails.noActiveTicket", { defaultValue: "No active ticket." })
              )}
            </Text>
            <Text style={styles.myQueueText}>
              {t("stationDetails.myPositionLabel", { defaultValue: "My Position" })}:{" "}
              {Number(myTicket?.position || 0)}
            </Text>
            <Text style={styles.myQueueText}>
              {t("stationDetails.peopleAheadLabel", { defaultValue: "People Ahead" })}:{" "}
              {Math.max(0, Number(myTicket?.position || 0) - 1)}
            </Text>
            <Text style={styles.myQueueText}>
              {t("stationDetails.ticketLabel", { defaultValue: "Ticket" })}:{" "}
              {String(myTicket?.reservationCode || "-")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.legacyCard}>
        <Text style={styles.legacySectionTitle}>
          {t("electricStationDetails.reservePayTitle", {
            defaultValue: "Reserve charger and pay",
          })}
        </Text>
        {!queueEnabled ? (
          <Text style={styles.errorText}>
            {t("stationDetails.objectIdError", {
              defaultValue: "This station cannot start a queue because its id is invalid.",
            })}
          </Text>
        ) : null}

        <Text style={styles.legacyMetaText}>
          {t("electricStationDetails.requestedBandLabel", {
            defaultValue: "Requested charging band",
          })}
        </Text>
        <View style={styles.optionsRow}>
          {REQUESTED_BANDS.map((band) => (
            <Pressable
              key={band}
              style={[styles.optionButton, requestedBand === band && styles.optionButtonActive]}
              onPress={() => setRequestedBand(band)}
            >
              <Text style={[styles.optionText, requestedBand === band && styles.optionTextActive]}>
                {band}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.legacyMetaText}>
          {t("electricStationDetails.chargeTypeLabel", {
            defaultValue: "Charging type",
          })}
        </Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>
            {t("electricStationDetails.chargeTypeValue", { defaultValue: "EV charging" })}
          </Text>
        </View>

        <Text style={styles.legacyMetaText}>
          {t("electricStationDetails.requestedChargeLabel", {
            defaultValue: "Requested charge (kWh)",
          })}
        </Text>
        <TextInput
          style={styles.input}
          value={requestedCharge}
          onChangeText={setRequestedCharge}
          keyboardType="numeric"
          placeholder={t("electricStationDetails.requestedChargePlaceholder", {
            defaultValue: "Enter requested kWh",
          })}
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.legacyMetaText}>
          {t("electricStationDetails.currentPriceLabel", {
            defaultValue: "Current charging price",
          })}: {evUnitPrice.toFixed(2)} ETB/kWh
        </Text>
        <Text style={styles.estimateText}>
          {t("stationDetails.estimatedTotal", { defaultValue: "Estimated total" })}:{" "}
          {estimatedAmount.toFixed(2)} ETB
        </Text>
        <Text style={styles.legacyMetaText}>
          {t("stationDetails.platformFee", { defaultValue: "Platform fee" })}:{" "}
          {platformFeeAmount.toFixed(2)} ETB
        </Text>
        <Text style={styles.legacyMetaText}>
          {t("stationDetails.amountToPay", { defaultValue: "Amount to pay" })}
        </Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{amountToPay.toFixed(2)} ETB</Text>
        </View>

        <View style={styles.paymentDetailsCard}>
          <Text style={styles.paymentDetailsTitle}>
            {t("stationDetails.paymentDetailsTitle", { defaultValue: "Payment details" })}
          </Text>
          <Text style={styles.paymentDetailsHint}>
            {t("stationDetails.paymentDetailsHint", {
              defaultValue: "Use these station payment details if the operator requires a manual confirmation.",
            })}
          </Text>
          {hasManualPaymentDetails ? (
            <Text style={styles.paymentCopyHint}>
              {t("stationDetails.paymentCopyHint", {
                defaultValue: "Tap copy on any field you want to reuse.",
              })}
            </Text>
          ) : null}
          {hasManualPaymentDetails ? (
            <>
              {paymentDetailRows.map((item) => (
                <View key={item.key} style={styles.paymentDetailRow}>
                  <View style={styles.paymentDetailTextWrap}>
                    <Text style={styles.paymentDetailLabel}>{item.label}</Text>
                    <Text style={styles.paymentDetailValue}>{item.value}</Text>
                  </View>
                  {item.copyable ? (
                    <Pressable
                      style={[
                        styles.copyButton,
                        copiedField === item.key && styles.copyButtonActive,
                      ]}
                      onPress={() => copyPaymentDetail(item.key, item.value)}
                    >
                      <Text
                        style={[
                          styles.copyButtonText,
                          copiedField === item.key && styles.copyButtonTextActive,
                        ]}
                      >
                        {copiedField === item.key
                          ? t("stationDetails.copiedButton", { defaultValue: "Copied" })
                          : t("stationDetails.copyButton", { defaultValue: "Copy" })}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.noticeText}>
              {t("stationDetails.paymentDetailsMissing", {
                defaultValue: "No payment details are stored for this station yet.",
              })}
            </Text>
          )}
        </View>

        <View style={styles.buttonGrid}>
          <Pressable
            style={[
              styles.queueActionButton,
              styles.chapaButton,
              styles.gridButton,
              (!queueEnabled || actionLoading) && styles.disabled,
            ]}
            onPress={reserveAndInitiateChapa}
            disabled={!queueEnabled || actionLoading}
          >
            <Text style={styles.primaryButtonText}>
              {t("stationDetails.payWithChapa", { defaultValue: "Pay with Chapa" })}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.queueActionButton,
              styles.secondaryButton,
              styles.gridButton,
              actionLoading && styles.disabled,
            ]}
            onPress={checkReservationNow}
            disabled={actionLoading || !reservationId}
          >
            <Text style={styles.secondaryButtonText}>
              {t("stationDetails.checkPaymentBtn", { defaultValue: "Check payment" })}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.queueActionButton,
              styles.infoButton,
              styles.gridButton,
              actionLoading && styles.disabled,
            ]}
            onPress={refreshMyTicket}
            disabled={actionLoading}
          >
            <Text style={styles.primaryButtonText}>
              {t("stationDetails.refreshTicketBtn", { defaultValue: "Refresh ticket" })}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.queueActionButton,
              styles.dangerButton,
              styles.gridButton,
              actionLoading && styles.disabled,
            ]}
            onPress={leaveMyQueue}
            disabled={actionLoading || !myTicket?.ticketId}
          >
            <Text style={styles.primaryButtonText}>
              {t("stationDetails.leaveQueueBtn", { defaultValue: "Leave queue" })}
            </Text>
          </Pressable>
        </View>

        {actionLoading ? <ActivityIndicator size="small" color="#0F766E" style={styles.loader} /> : null}
        <Text style={styles.legacyMetaText}>
          {t("stationDetails.paymentPhaseLabel", { defaultValue: "Phase" })}: {paymentPhase}
        </Text>
        <Text style={styles.legacyMetaText}>
          {t("stationDetails.reservationIdLabel", { defaultValue: "Reservation ID" })}: {reservationId || "-"}
        </Text>
        <Text style={styles.legacyMetaText}>
          {t("stationDetails.reservationCodeLabel", { defaultValue: "Reservation Code" })}: {reservationCode || "-"}
        </Text>
        {message ? <Text style={styles.infoText}>{message}</Text> : null}

        {myTicket ? (
          <View style={styles.ticketCard}>
            <Text style={styles.ticketTitle}>
              {t("stationDetails.activeTicket", { defaultValue: "Active ticket" })}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.ticketIdLabel", { defaultValue: "Ticket ID" })}: {String(myTicket.ticketId || "-")}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.reservationCodeLabel", { defaultValue: "Reservation Code" })}:{" "}
              {String(myTicket.reservationCode || "-")}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.statusLabel", { defaultValue: "Status" })}: {String(myTicket.status || "-")}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.positionLabel", { defaultValue: "Position" })}: {String(myTicket.position ?? "-")}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.etaMinutesLabel", { defaultValue: "ETA Minutes" })}:{" "}
              {String(myTicket.etaMinutes ?? "-")}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.expiresAtLabel", { defaultValue: "Expires At" })}: {formatTimestamp(myTicket.expiresAt)}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("electricStationDetails.chargeTypeLabel", { defaultValue: "Charging type" })}:{" "}
              {formatChargeType(myTicket.fuelType, t)}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("electricStationDetails.requestedChargeShortLabel", { defaultValue: "Requested kWh" })}:{" "}
              {String(myTicket.requestedLiters ?? "-")}
            </Text>
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.estimatedAmountLabel", { defaultValue: "Estimated Amount" })}:{" "}
              {String(myTicket.estimatedAmount ?? "-")} ETB
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.legacyCard}>
        <Text style={styles.legacySectionTitle}>
          {t("stationDetails.checkInTitle", { defaultValue: "Station check-in" })}
        </Text>
        <Text style={styles.legacyMetaText}>
          {t("electricStationDetails.checkInDesc", {
            defaultValue: "Once your EV queue ticket is active, start check-in and show the OTP or QR code at the station.",
          })}
        </Text>

        <Pressable
          style={[
            styles.queueActionButton,
            styles.primaryButton,
            (actionLoading || !canStartCheckIn) && styles.disabled,
          ]}
          onPress={startCheckInNow}
          disabled={actionLoading || !canStartCheckIn}
        >
          <Text style={styles.primaryButtonText}>
            {t("stationDetails.startCheckInBtn", { defaultValue: "Start check-in" })}
          </Text>
        </Pressable>
        {!canStartCheckIn ? (
          <Text style={styles.noticeText}>
            {t("stationDetails.completePaymentFirst", {
              defaultValue: "Complete payment and wait for an active ticket before check-in.",
            })}
          </Text>
        ) : null}

        <Text style={styles.legacyMetaText}>
          {t("stationDetails.otpFromSession", { defaultValue: "OTP from session" })}
        </Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{checkInSession?.otpCode || "-"}</Text>
        </View>

        <Text style={styles.legacyMetaText}>
          {t("stationDetails.checkInQr", { defaultValue: "Check-in QR" })}
        </Text>
        <View style={styles.qrWrap}>
          {checkInSession?.qrToken ? (
            <QRCode value={checkInSession.qrToken} size={170} />
          ) : (
            <Text style={styles.legacyMetaText}>
              {t("stationDetails.startForQr", { defaultValue: "Start check-in to generate a QR code." })}
            </Text>
          )}
        </View>

        <Text style={styles.legacyMetaText}>
          {t("stationDetails.otpForAttendant", { defaultValue: "OTP for attendant" })}:{" "}
          {checkInSession?.otpCode || "-"}
        </Text>
        <Text style={styles.legacyMetaText}>
          {t("stationDetails.attendantNote", {
            defaultValue: "Share this code with the station attendant so they can verify your arrival.",
          })}
        </Text>
        {checkInStatusText ? <Text style={styles.infoText}>{checkInStatusText}</Text> : null}
      </View>

      <SectionCard
        icon="information-circle-outline"
        title={t("electricStationDetails.overviewTitle", { defaultValue: "Station overview" })}
        subtitle={t("electricStationDetails.overviewBody", {
          defaultValue: "Core operational and contact details for this charging stop.",
        })}
      >
        <DetailRow
          label={t("electricStationDetails.overview.addressLabel", { defaultValue: "Address" })}
          value={station?.address || station?.rawAddress || FALLBACK_VALUE}
        />
        <DetailRow
          label={t("electricStationDetails.overview.contactLabel", { defaultValue: "Contact" })}
          value={station?.contact || station?.paymentDetails?.phoneNumber || FALLBACK_VALUE}
        />
        <DetailRow
          label={t("electricStationDetails.overview.stationIdLabel", { defaultValue: "Station ID" })}
          value={stationId || FALLBACK_VALUE}
        />
        <DetailRow
          label={t("electricStationDetails.overview.coordinatesLabel", { defaultValue: "Coordinates" })}
          value={`${formatCoordinate(station?.latitude)}, ${formatCoordinate(station?.longitude)}`}
        />
      </SectionCard>

      <SectionCard
        icon="location-outline"
        title={t("electricStationDetails.locationTitle", { defaultValue: "Location context" })}
        subtitle={t("electricStationDetails.locationBody", {
          defaultValue: "Area details help drivers confirm they are routing to the correct charger.",
        })}
      >
        {locationRows.map((item) => (
          <DetailRow key={item.label} label={item.label} value={item.value} />
        ))}
      </SectionCard>

      <SectionCard
        icon="sparkles-outline"
        title={t("electricStationDetails.tipsTitle", { defaultValue: "Arrival tips" })}
        subtitle={t("electricStationDetails.tipsBody", {
          defaultValue: "Practical EV notes based on the current station record and live queue snapshot.",
        })}
      >
        <View style={styles.tipList}>
          {arrivalTips.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Ionicons name="checkmark-circle" size={18} color="#0f766e" />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#0f766e" />
          <Text style={styles.loadingText}>
            {t("electricStationDetails.loading", { defaultValue: "Loading EV station details..." })}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    padding: 16,
    paddingBottom: 28,
    backgroundColor: "#f6fbfa",
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f6fbfa",
    gap: 8,
  },
  centerStateTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  centerStateBody: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: "#0f766e",
    gap: 12,
  },
  heroStatusReady: {
    backgroundColor: "#0f766e",
  },
  heroStatusBusy: {
    backgroundColor: "#0b7285",
  },
  heroStatusOffline: {
    backgroundColor: "#334155",
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: "#ecfeff",
    fontSize: 12,
    fontWeight: "700",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeReady: {
    backgroundColor: "#dcfce7",
  },
  statusBadgeReadyText: {
    color: "#166534",
  },
  statusBadgeBusy: {
    backgroundColor: "#fef3c7",
  },
  statusBadgeBusyText: {
    color: "#92400e",
  },
  statusBadgeOffline: {
    backgroundColor: "#e2e8f0",
  },
  statusBadgeOfflineText: {
    color: "#334155",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#d1fae5",
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  heroMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroMetaText: {
    color: "#ecfeff",
    fontSize: 13,
    fontWeight: "700",
  },
  heroBody: {
    color: "#ecfeff",
    fontSize: 14,
    lineHeight: 21,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    minWidth: "47%",
    flexGrow: 1,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d9f0ea",
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
  },
  metricValue: {
    fontSize: 19,
    color: "#0f172a",
    fontWeight: "900",
  },
  metricHint: {
    fontSize: 12,
    lineHeight: 17,
    color: "#475569",
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: "#e2f1ec",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748b",
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    minWidth: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  actionButtonPrimary: {
    backgroundColor: "#0f766e",
  },
  actionButtonSecondary: {
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "#b7e8de",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonPressed: {
    opacity: 0.85,
  },
  actionButtonLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  actionButtonLabelPrimary: {
    color: "#ffffff",
  },
  actionButtonLabelSecondary: {
    color: "#0f766e",
  },
  detailRow: {
    gap: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#dbe7e4",
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 21,
    color: "#0f172a",
    fontWeight: "600",
  },
  legacyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 4,
  },
  legacySectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  legacyMetaText: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 4,
    fontWeight: "600",
  },
  queueCard: {
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 10,
  },
  queueStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  queueMiniCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#DBEAFE",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginRight: 6,
  },
  queueMiniCardLast: {
    marginRight: 0,
  },
  queueMiniLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E3A8A",
    marginBottom: 2,
  },
  queueMiniValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E40AF",
  },
  myQueueBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  myQueueTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#065F46",
    marginBottom: 4,
  },
  myQueueText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065F46",
    marginBottom: 2,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#F8FAFC",
  },
  optionButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#D1FAE5",
  },
  optionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  optionTextActive: {
    color: "#065F46",
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  readonlyText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  estimateText: {
    fontSize: 13,
    color: "#1D4ED8",
    fontWeight: "800",
    marginBottom: 8,
  },
  paymentDetailsCard: {
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  paymentDetailsTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#1E3A8A",
    marginBottom: 4,
  },
  paymentDetailsHint: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    marginBottom: 6,
  },
  paymentCopyHint: {
    fontSize: 12,
    color: "#1D4ED8",
    fontWeight: "700",
    marginBottom: 8,
  },
  paymentDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  paymentDetailTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  paymentDetailLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  paymentDetailValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  copyButton: {
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  copyButtonActive: {
    borderColor: "#10B981",
    backgroundColor: "#D1FAE5",
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1D4ED8",
  },
  copyButtonTextActive: {
    color: "#065F46",
  },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  queueActionButton: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gridButton: {
    width: "48%",
  },
  primaryButton: {
    backgroundColor: "#0F766E",
  },
  secondaryButton: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#1D4ED8",
  },
  infoButton: {
    backgroundColor: "#0EA5E9",
  },
  dangerButton: {
    backgroundColor: "#B91C1C",
  },
  chapaButton: {
    backgroundColor: "#F59E0B",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
  loader: {
    marginTop: 4,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: "700",
    marginBottom: 6,
  },
  noticeText: {
    fontSize: 12,
    color: "#92400E",
    fontWeight: "700",
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "700",
    marginBottom: 8,
  },
  ticketCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    padding: 8,
  },
  ticketTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#065F46",
    marginBottom: 4,
  },
  qrWrap: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  emptySectionText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
  },
  tipList: {
    gap: 12,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#0f172a",
  },
  loadingOverlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "700",
  },
});
