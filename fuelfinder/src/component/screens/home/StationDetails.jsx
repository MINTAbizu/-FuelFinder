import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import QRCode from "react-native-qrcode-svg";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import {
  hasRegisteredDevicePushTokenAsync,
  storeQueueTurnAlert,
} from "../../services/fuelAlertService";
import {
  getMyQueueTicket,
  getPublicStationDetails,
  getReservationStatus,
  getStationQueue,
  leaveQueue,
  reserveQueueSlot,
  startStationCheckIn,
  startChapaCheckout,
  verifyChapaPayment
} from "../../services/queueService";

const getWaitEstimate = (queueLength) => Math.max(2, Number(queueLength || 0) * 3);
const REQUESTED_BANDS = ["10-20", "20-40", "40+"];
const FUEL_TYPES = ["gasoline", "diesel", "other"];
const CHAPA_PLATFORM_FEE_PER_LITER_DEFAULT_BIRR = 0.25;
const DEFAULT_FUEL_PRICES = {
  gasoline: 95,
  diesel: 92,
  other: 90,
};
// Translations are handled by i18next (`src/i18n/locales/*.json`).

function isObjectId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || "").trim());
}

function logReservationError(scope, error) {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const message = error?.message;
  console.error(`[Reservation:${scope}]`, {
    status,
    message,
    data,
  });
}

function formatSupportedFuels(supportedFuels, labels) {
  const map = supportedFuels || {};
  const values = [];
  if (map.gasoline) values.push(labels.gasoline);
  if (map.diesel) values.push(labels.diesel);
  if (map.other) values.push(labels.other);
  if (map.unknown || !values.length) return labels.notSpecified;
  return values.join(", ");
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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function StationDetails({ navigation, route }) {
  const { t: tr } = useLanguage();
  const { user } = useAuth();
  const t = useMemo(
    () => ({
      screenTitle: tr("stationDetails.screenTitle", { defaultValue: "Station Details" }),
      stationFallback: tr("stationDetails.stationFallback"),
      address: tr("stationDetails.address"),
      contact: tr("stationDetails.contact"),
      stationId: tr("stationDetails.stationId"),
      coords: tr("stationDetails.coords"),
      supportedFuels: tr("stationDetails.supportedFuels"),
      fuelStatus: tr("stationDetails.fuelStatus"),
      queueWait: tr("stationDetails.queueWait"),
      queueLength: tr("stationDetails.queueLength"),
      estWait: tr("stationDetails.estWait"),
      reservePay: tr("stationDetails.reservePay"),
      requestedBand: tr("stationDetails.requestedBand"),
      fuelType: tr("stationDetails.fuelType"),
      liters: tr("stationDetails.liters"),
      litersPlaceholder: tr("stationDetails.litersPlaceholder"),
      currentPrice: tr("stationDetails.currentPrice"),
      estimatedTotal: tr("stationDetails.estimatedTotal"),
      platformFee: tr("stationDetails.platformFee"),
      amountToPay: tr("stationDetails.amountToPay"),
      paymentDetailsTitle: tr("stationDetails.paymentDetailsTitle"),
      paymentDetailsHint: tr("stationDetails.paymentDetailsHint"),
      paymentCopyHint: tr("stationDetails.paymentCopyHint"),
      paymentProvider: tr("stationDetails.paymentProvider"),
      paymentPhone: tr("stationDetails.paymentPhone"),
      paymentAccountName: tr("stationDetails.paymentAccountName"),
      paymentAccountNumber: tr("stationDetails.paymentAccountNumber"),
      paymentInstructions: tr("stationDetails.paymentInstructions"),
      paymentDetailsMissing: tr("stationDetails.paymentDetailsMissing"),
      copyButton: tr("stationDetails.copyButton"),
      copiedButton: tr("stationDetails.copiedButton"),
      copyFailedTitle: tr("stationDetails.copyFailedTitle"),
      copyFailedBody: tr("stationDetails.copyFailedBody"),
      reservePayBtn: tr("stationDetails.reservePayBtn"),
      checkPaymentBtn: tr("stationDetails.checkPaymentBtn"),
      refreshTicketBtn: tr("stationDetails.refreshTicketBtn"),
      leaveQueueBtn: tr("stationDetails.leaveQueueBtn"),
      activeTicket: tr("stationDetails.activeTicket"),
      checkInTitle: tr("stationDetails.checkInTitle"),
      checkInDesc: tr("stationDetails.checkInDesc"),
      startCheckInBtn: tr("stationDetails.startCheckInBtn"),
      otpFromSession: tr("stationDetails.otpFromSession"),
      checkInQr: tr("stationDetails.checkInQr"),
      noReports: tr("stationDetails.noReports"),
      noReviews: tr("stationDetails.noReviews"),
      reportsTitle: tr("stationDetails.reportsTitle"),
      reviewsTitle: tr("stationDetails.reviewsTitle"),
      avgRating: tr("stationDetails.avgRating"),
      invalidLitersTitle: tr("stationDetails.invalidLitersTitle"),
      invalidLitersBody: tr("stationDetails.invalidLitersBody"),
      missingReservationTitle: tr("stationDetails.missingReservationTitle"),
      missingReservationBody: tr("stationDetails.missingReservationBody"),
      noTicketTitle: tr("stationDetails.noTicketTitle"),
      noTicketBody: tr("stationDetails.noTicketBody"),
      stationIdMissingTitle: tr("stationDetails.stationIdMissingTitle"),
      stationIdMissingBody: tr("stationDetails.stationIdMissingBody"),
      checkInMissingTicketTitle: tr("stationDetails.checkInMissingTicketTitle"),
      checkInMissingTicketBody: tr("stationDetails.checkInMissingTicketBody"),
      locationRequiredTitle: tr("stationDetails.locationRequiredTitle"),
      locationRequiredBody: tr("stationDetails.locationRequiredBody"),
      paymentInitiated: tr("stationDetails.paymentInitiated"),
      failedStartPayment: tr("stationDetails.failedStartPayment"),
      waitingPaymentConfirm: tr("stationDetails.waitingPaymentConfirm"),
      paymentVerified: tr("stationDetails.paymentVerified"),
      reservationExpired: tr("stationDetails.reservationExpired"),
      activeTicketLoaded: tr("stationDetails.activeTicketLoaded"),
      noActiveTicket: tr("stationDetails.noActiveTicket"),
      leftQueue: tr("stationDetails.leftQueue"),
      failedLeaveQueue: tr("stationDetails.failedLeaveQueue"),
      completePaymentFirst: tr("stationDetails.completePaymentFirst"),
      startCheckInFailed: tr("stationDetails.startCheckInFailed"),
      startForQr: tr("stationDetails.startForQr"),
      attendantNote: tr("stationDetails.attendantNote"),
      objectIdError: tr("stationDetails.objectIdError"),
      otpForAttendant: tr("stationDetails.otpForAttendant"),
      notSpecified: tr("stationDetails.notSpecified", { defaultValue: "Not specified" }),
      myQueueTitle: tr("stationDetails.myQueueTitle", { defaultValue: "My Queue (Realtime)" }),
      statusLabel: tr("stationDetails.statusLabel", { defaultValue: "Status" }),
      myPositionLabel: tr("stationDetails.myPositionLabel", { defaultValue: "My Position" }),
      peopleAheadLabel: tr("stationDetails.peopleAheadLabel", { defaultValue: "People Ahead" }),
      ticketLabel: tr("stationDetails.ticketLabel", { defaultValue: "Ticket" }),
      payWithChapa: tr("stationDetails.payWithChapa", { defaultValue: "Pay with Chapa" }),
      paymentPhaseLabel: tr("stationDetails.paymentPhaseLabel", { defaultValue: "Phase" }),
      reservationIdLabel: tr("stationDetails.reservationIdLabel", { defaultValue: "Reservation ID" }),
      reservationCodeLabel: tr("stationDetails.reservationCodeLabel", { defaultValue: "Reservation Code" }),
      ticketIdLabel: tr("stationDetails.ticketIdLabel", { defaultValue: "Ticket ID" }),
      positionLabel: tr("stationDetails.positionLabel", { defaultValue: "Position" }),
      etaMinutesLabel: tr("stationDetails.etaMinutesLabel", { defaultValue: "ETA Minutes" }),
      expiresAtLabel: tr("stationDetails.expiresAtLabel", { defaultValue: "Expires At" }),
      requestedLitersLabel: tr("stationDetails.requestedLitersLabel", { defaultValue: "Requested Liters" }),
      estimatedAmountLabel: tr("stationDetails.estimatedAmountLabel", { defaultValue: "Estimated Amount" }),
      noFuelTitle: tr("stationDetails.noFuelTitle", { defaultValue: "Station has no fuel" }),
      noFuelBody: tr("stationDetails.noFuelBody", {
        defaultValue: "This station is marked empty. Try another station.",
      }),
      limitedFuelTitle: tr("stationDetails.limitedFuelTitle", { defaultValue: "Limited fuel" }),
      limitedFuelBody: tr("stationDetails.limitedFuelBody", {
        defaultValue: "This station has limited fuel. Do you want to continue payment?",
      }),
      continueAction: tr("stationDetails.continueAction", { defaultValue: "Continue" }),
      queueSavedOffline: tr("stationDetails.queueSavedOffline", {
        defaultValue: "Queue request saved offline. It will sync when you reconnect. Payment still needs internet.",
      }),
      leaveSavedOffline: tr("stationDetails.leaveSavedOffline", {
        defaultValue: "Leave-queue request saved offline. It will sync when you reconnect.",
      }),
      emailRequired: tr("stationDetails.emailRequired", {
        defaultValue: "Email is required for Chapa payment.",
      }),
      checkoutUrlMissing: tr("stationDetails.checkoutUrlMissing", {
        defaultValue: "Chapa checkout URL not available.",
      }),
      fuelOther: tr("homeScreen.fuel.other"),
      fuelGasoline: tr("homeScreen.fuel.gasoline"),
      fuelDiesel: tr("homeScreen.fuel.diesel"),
      minuteShort: tr("homeScreen.route.min"),
      noActiveTicketStatus: tr("stationDetails.noActiveTicket", { defaultValue: "No active ticket." }),
    }),
    [tr]
  );
  const statusLabels = useMemo(() => {
    return {
      available: tr("homeScreen.status.available"),
      limited: tr("homeScreen.status.limited"),
      empty: tr("homeScreen.status.empty"),
    };
  }, [tr]);
  const getFuelLabel = useCallback(
    (value) => {
      if (value === "diesel") return t.fuelDiesel;
      if (value === "other") return t.fuelOther;
      return t.fuelGasoline;
    },
    [t.fuelDiesel, t.fuelGasoline, t.fuelOther]
  );
  const { station } = route.params || {};

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t.screenTitle,
    });
  }, [navigation, t.screenTitle]);

  const [requestedBand, setRequestedBand] = useState("10-20");
  const [fuelType, setFuelType] = useState("gasoline");
  const [requestedLiters, setRequestedLiters] = useState("10");
  const [reservationId, setReservationId] = useState("");
  const [reservationCode, setReservationCode] = useState("");
  const [txRef, setTxRef] = useState("");
  const [myTicket, setMyTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState("idle");
  const [liveQueueCount, setLiveQueueCount] = useState(null);
  const [liveFuel, setLiveFuel] = useState(null);
  const [stationMeta, setStationMeta] = useState(null);
  const [checkInSession, setCheckInSession] = useState(null);
  const [checkInStatusText, setCheckInStatusText] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const pollRef = useRef(null);
  const copyTimerRef = useRef(null);
  const queueTurnAlertKeyRef = useRef("");

  const stationId = useMemo(
    () => String(station?.stationId || station?._id || station?.id || "").trim(),
    [station]
  );
  const queueEnabled = isObjectId(stationId);
  const fuelPrices = useMemo(() => {
    const fromStationMeta = stationMeta?.fuel_prices || stationMeta?.fuelPrices || {};
    const fromMap = station?.fuel_prices || station?.fuelPrices || {};
    return {
      gasoline: Number(
        fromStationMeta.gasoline ??
          stationMeta?.gasoline_price ??
          stationMeta?.gasolinePrice ??
          fromMap.gasoline ??
          station?.gasoline_price ??
          station?.gasolinePrice ??
          DEFAULT_FUEL_PRICES.gasoline
      ),
      diesel: Number(
        fromStationMeta.diesel ??
          stationMeta?.diesel_price ??
          stationMeta?.dieselPrice ??
          fromMap.diesel ??
          station?.diesel_price ??
          station?.dieselPrice ??
          DEFAULT_FUEL_PRICES.diesel
      ),
      other: Number(
        fromStationMeta.other ??
          stationMeta?.other_price ??
          stationMeta?.otherPrice ??
          fromMap.other ??
          station?.other_price ??
          station?.otherPrice ??
          DEFAULT_FUEL_PRICES.other
      ),
    };
  }, [station, stationMeta]);
  const selectedUnitPrice = Number(fuelPrices[fuelType] || 0);
  const litersValue = Number(requestedLiters);
  const estimatedAmount = Number.isFinite(litersValue) && litersValue > 0
    ? Number((litersValue * selectedUnitPrice).toFixed(2))
    : 0;
  const platformFeeRateBirr = useMemo(() => {
    const raw = String(
      process.env.EXPO_PUBLIC_CHAPA_PLATFORM_FEE_PER_LITER_BIRR || CHAPA_PLATFORM_FEE_PER_LITER_DEFAULT_BIRR
    ).trim();
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return CHAPA_PLATFORM_FEE_PER_LITER_DEFAULT_BIRR;
    return Number(value.toFixed(2));
  }, []);
  const platformFeeBirr = Number.isFinite(litersValue) && litersValue > 0
    ? Number((litersValue * platformFeeRateBirr).toFixed(2))
    : 0;
  const amountToPay = estimatedAmount > 0
    ? Number((estimatedAmount + platformFeeBirr).toFixed(2))
    : 0;
  const manualPaymentDetails = useMemo(() => {
    const fromStation = stationMeta?.paymentDetails || station?.paymentDetails || {};
    return {
      providerName: String(fromStation.providerName || "").trim(),
      accountName: String(fromStation.accountName || "").trim(),
      accountNumber: String(fromStation.accountNumber || "").trim(),
      phoneNumber: String(fromStation.phoneNumber || "").trim(),
      instructions: String(fromStation.instructions || "").trim(),
    };
  }, [station, stationMeta]);
  const hasManualPaymentDetails = useMemo(
    () => Object.values(manualPaymentDetails).some(Boolean),
    [manualPaymentDetails]
  );
  const paymentDetailRows = useMemo(
    () => [
      {
        key: "providerName",
        label: t.paymentProvider,
        value: manualPaymentDetails.providerName,
        copyable: false,
      },
      {
        key: "phoneNumber",
        label: t.paymentPhone,
        value: manualPaymentDetails.phoneNumber,
        copyable: true,
      },
      {
        key: "accountName",
        label: t.paymentAccountName,
        value: manualPaymentDetails.accountName,
        copyable: true,
      },
      {
        key: "accountNumber",
        label: t.paymentAccountNumber,
        value: manualPaymentDetails.accountNumber,
        copyable: true,
      },
      {
        key: "instructions",
        label: t.paymentInstructions,
        value: manualPaymentDetails.instructions,
        copyable: false,
      },
    ].filter((item) => item.value),
    [
      manualPaymentDetails.accountName,
      manualPaymentDetails.accountNumber,
      manualPaymentDetails.instructions,
      manualPaymentDetails.phoneNumber,
      manualPaymentDetails.providerName,
      t.paymentAccountName,
      t.paymentAccountNumber,
      t.paymentInstructions,
      t.paymentPhone,
      t.paymentProvider,
    ]
  );

  const detail = useMemo(() => {
    const queue = Number(
      liveQueueCount !== null && liveQueueCount !== undefined ? liveQueueCount : station?.queue_length || 0
    );
    const fuelStatus = String(liveFuel?.fuelStatus || stationMeta?.fuel_status || station?.fuel_status || "limited");
    const fuelInventory = {
      gasolineLiters: Number(
        liveFuel?.fuelInventory?.gasolineLiters ??
        stationMeta?.fuelInventory?.gasolineLiters ??
        station?.fuelInventory?.gasolineLiters ??
        0
      ),
      dieselLiters: Number(
        liveFuel?.fuelInventory?.dieselLiters ??
        stationMeta?.fuelInventory?.dieselLiters ??
        station?.fuelInventory?.dieselLiters ??
        0
      ),
      otherLiters: Number(
        liveFuel?.fuelInventory?.otherLiters ??
        stationMeta?.fuelInventory?.otherLiters ??
        station?.fuelInventory?.otherLiters ??
        0
      ),
    };
    return {
      name: stationMeta?.name || station?.name || t.stationFallback,
      address: stationMeta?.address || station?.address || t.address,
      contact: stationMeta?.contact || station?.contact || t.contact,
      latitude: Number(stationMeta?.latitude ?? station?.latitude),
      longitude: Number(stationMeta?.longitude ?? station?.longitude),
      supportedFuels: formatSupportedFuels(stationMeta?.supportedFuels || station?.supportedFuels, {
        gasoline: t.fuelGasoline,
        diesel: t.fuelDiesel,
        other: t.fuelOther,
        notSpecified: t.notSpecified,
      }),
      fuelStatus,
      fuelInventory,
      queueLength: queue,
      waitTime: getWaitEstimate(queue),
      reports: Array.isArray(station?.reports) ? station.reports : [],
      reviews: Array.isArray(station?.reviews) ? station.reviews : [],
      avgRating:
        station?.reviews?.length
          ? (
              station.reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
              station.reviews.length
            ).toFixed(1)
          : "4.5",
    };
  }, [
    liveFuel,
    liveQueueCount,
    station,
    stationMeta,
    t.address,
    t.contact,
    t.fuelDiesel,
    t.fuelGasoline,
    t.fuelOther,
    t.notSpecified,
    t.stationFallback,
  ]);

  const normalizedFuelStatus = String(detail.fuelStatus || "").toLowerCase();
  const isFuelAvailable = normalizedFuelStatus === "available" || normalizedFuelStatus === "full";
  const isFuelLimited = normalizedFuelStatus === "limited" || normalizedFuelStatus === "partial";
  const isFuelEmpty = normalizedFuelStatus === "empty";
  const disableLeaveAfterPaid =
    Boolean(myTicket) &&
    ["waiting", "called"].includes(String(myTicket?.status || "")) &&
    isFuelAvailable &&
    paymentPhase === "verified";
  const canStartCheckIn =
    Boolean(myTicket?.ticketId) &&
    ["waiting", "called"].includes(String(myTicket?.status || "").toLowerCase());

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

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
        console.error("[StationDetails:copyPaymentDetail]", error);
        Alert.alert(t.copyFailedTitle, t.copyFailedBody);
      }
    },
    [t.copyFailedBody, t.copyFailedTitle]
  );

  useEffect(() => {
    let active = true;
    if (!queueEnabled) return undefined;

    const fetchStationMeta = async () => {
      try {
        const nextStation = await getPublicStationDetails(stationId);
        if (!active) return;
        setStationMeta(nextStation || null);
      } catch (_error) {
        if (!active) return;
        setStationMeta(null);
      }
    };

    fetchStationMeta();
    const id = setInterval(fetchStationMeta, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [queueEnabled, stationId]);

  useEffect(() => {
    let active = true;
    if (!queueEnabled) return undefined;

    const fetchLive = async () => {
      try {
        const queue = await getStationQueue(stationId);
        if (!active) return;
        setLiveQueueCount(Number(queue?.waitingCount || 0));
        setLiveFuel({
          fuelStatus: String(queue?.fuelStatus || ""),
          fuelInventory: {
            gasolineLiters: Number(queue?.fuelInventory?.gasolineLiters || 0),
            dieselLiters: Number(queue?.fuelInventory?.dieselLiters || 0),
            otherLiters: Number(queue?.fuelInventory?.otherLiters || 0),
            updatedAt: queue?.fuelInventory?.updatedAt || null,
          },
        });
      } catch (_error) {
        if (!active) return;
        setLiveQueueCount(null);
      }
    };

    fetchLive();
    const id = setInterval(fetchLive, 10000);
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
        setMyTicket(normalizeTicketPayload(ticket));
        if (ticket?.reservationCode) {
          setReservationCode(String(ticket.reservationCode || ""));
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

  useEffect(() => {
    const ticketId = String(myTicket?.ticketId || "").trim();
    const ticketStatus = String(myTicket?.status || "").trim().toLowerCase();
    if (!ticketId || ticketStatus !== "called") {
      return;
    }

    const alertKey = `queue_turn_${ticketId}`;
    if (queueTurnAlertKeyRef.current === alertKey) {
      return;
    }
    queueTurnAlertKeyRef.current = alertKey;

    const stationName =
      String(detail?.name || stationMeta?.name || station?.name || t.stationFallback).trim() || "Fuel Station";
    const reservationCode = String(myTicket?.reservationCode || "").trim();
    const title = tr("stationDetails.queueTurnAlertTitle", { defaultValue: "It's your turn" });
    const message = `FuelFinder: It's your turn at ${stationName}.${
      reservationCode ? ` Ticket ${reservationCode}.` : ""
    } Please go to the station now.`;

    void (async () => {
      const event = await storeQueueTurnAlert(
        {
          alertId: alertKey,
          ticketId,
          reservationCode,
          stationId,
          stationName,
          address: String(detail?.address || stationMeta?.address || station?.address || "").trim(),
          title,
          message,
        },
        { showSystemNotification: false }
      );

      if (event?.created && !(await hasRegisteredDevicePushTokenAsync())) {
        Alert.alert(event.title || title, event.body || message);
      }
    })();
  }, [
    detail?.address,
    detail?.name,
    myTicket?.reservationCode,
    myTicket?.status,
    myTicket?.ticketId,
    station?.address,
    station?.name,
    stationId,
    stationMeta?.address,
    stationMeta?.name,
    t.stationFallback,
    tr,
  ]);

  const refreshMyTicket = useCallback(async () => {
    if (!queueEnabled) return;
    setLoading(true);
    try {
      const ticket = await getMyQueueTicket(stationId);
      setMyTicket(normalizeTicketPayload(ticket));
      setReservationCode(String(ticket?.reservationCode || ""));
      setMessage(t.activeTicketLoaded);
    } catch (error) {
      logReservationError("refreshMyTicket", error);
      setMyTicket(null);
      setMessage(error?.response?.data?.message || t.noActiveTicket);
    } finally {
      setLoading(false);
    }
  }, [queueEnabled, stationId, t.activeTicketLoaded, t.noActiveTicket]);

  const pollReservation = useCallback(
    async (nextReservationId, immediate = false) => {
      if (!nextReservationId) return;
      if (pollRef.current) clearInterval(pollRef.current);

      const runPoll = async () => {
        try {
          const status = await getReservationStatus(nextReservationId);
          if (status.status === "waiting" || status.status === "called") {
            setMyTicket({
              ticketId: String(status.reservationId),
              reservationCode: String(status.reservationCode || ""),
              status: status.status,
              position: status.position,
              etaMinutes: Number(status.position || 0) * 3,
              fuelType: status.fuelType,
              requestedLiters: status.requestedLiters,
              estimatedAmount: status.estimatedAmount,
            });
            setPaymentPhase("verified");
            setMessage(t.paymentVerified);
            if (pollRef.current) clearInterval(pollRef.current);
            return;
          }
          if (status.status === "expired") {
            setPaymentPhase("expired");
            setMessage(t.reservationExpired);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch (_error) {
          logReservationError("pollReservation", _error);
          // Silent retry while polling.
        }
      };

      if (immediate) await runPoll();

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        await runPoll();
        if (attempts >= 30 && pollRef.current) {
          clearInterval(pollRef.current);
          setPaymentPhase("pending");
          setMessage(t.waitingPaymentConfirm);
        }
      }, 2000);
    },
    [t.waitingPaymentConfirm, t.paymentVerified, t.reservationExpired]
  );

  const reserveAndInitiateChapa = useCallback(async () => {
    if (!queueEnabled) {
      Alert.alert(t.stationIdMissingTitle, t.stationIdMissingBody);
      return;
    }

    setLoading(true);
    setMessage("");
    setPaymentPhase("reserving");
    try {
      if (isFuelEmpty) {
        Alert.alert(t.noFuelTitle, t.noFuelBody);
        setPaymentPhase("idle");
        setLoading(false);
        return;
      }
      if (isFuelLimited) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            t.limitedFuelTitle,
            t.limitedFuelBody,
            [
              { text: tr("cancel"), style: "cancel", onPress: () => resolve(false) },
              { text: t.continueAction, onPress: () => resolve(true) }
            ]
          );
        });
        if (!proceed) {
          setPaymentPhase("idle");
          setLoading(false);
          return;
        }
      }

      if (!Number.isFinite(litersValue) || litersValue <= 0) {
        Alert.alert(t.invalidLitersTitle, t.invalidLitersBody);
        setPaymentPhase("idle");
        setLoading(false);
        return;
      }

      const reserve = await reserveQueueSlot({
        stationId,
        requestedBand,
        fuelType,
        requestedLiters: litersValue,
        unitPrice: selectedUnitPrice,
      });

      const nextReservationId = String(reserve?.reservationId || "");
      const nextReservationCode = String(reserve?.reservationCode || "");

      if (reserve?.offlineQueued) {
        setReservationId("");
        setReservationCode("");
        setPaymentPhase("pending");
        setMessage(
          reserve?.message ||
            t.queueSavedOffline
        );
        return;
      }

      setReservationId(nextReservationId);
      setReservationCode(nextReservationCode);
      setPaymentPhase("initiating");

      const userEmail = String(user?.email || "").trim();
      if (!userEmail) {
        throw new Error(t.emailRequired);
      }

      const nameParts = String(user?.name || "Customer").trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "User";

      const chapaInit = await startChapaCheckout({
        reservationId: nextReservationId,
        email: userEmail,
        first_name: firstName,
        last_name: lastName
      });

      const checkoutUrl = chapaInit?.data?.checkout_url || chapaInit?.data?.checkoutUrl;
      const nextTxRef =
        chapaInit?.data?.tx_ref ||
        chapaInit?.data?.reference ||
        chapaInit?.meta?.tx_ref ||
        "";
      if (nextTxRef) setTxRef(String(nextTxRef));
      if (!checkoutUrl) {
        throw new Error(t.checkoutUrlMissing);
      }

      await WebBrowser.openBrowserAsync(checkoutUrl);
      setPaymentPhase("pending");
      setMessage(t.paymentInitiated);
      await pollReservation(nextReservationId, true);
    } catch (error) {
      logReservationError("reserveAndInitiateChapa", error);
      setPaymentPhase("failed");
      const detail = error?.response?.data?.detail;
      setMessage(detail || error?.response?.data?.message || error?.message || t.failedStartPayment);
    } finally {
      setLoading(false);
    }
  }, [
    fuelType,
    isFuelEmpty,
    isFuelLimited,
    litersValue,
    pollReservation,
    queueEnabled,
    requestedBand,
    selectedUnitPrice,
    stationId,
    t,
    tr,
    user
  ]);

  const checkReservationNow = useCallback(async () => {
    if (!reservationId) {
      Alert.alert(t.missingReservationTitle, t.missingReservationBody);
      return;
    }
    setLoading(true);
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
      setLoading(false);
    }
  }, [pollReservation, reservationId, t.missingReservationBody, t.missingReservationTitle, txRef]);

  const leaveMyQueue = useCallback(async () => {
    const ticketId = myTicket?.ticketId;
    if (!ticketId) {
      Alert.alert(t.noTicketTitle, t.noTicketBody);
      return;
    }
    setLoading(true);
    try {
      const result = await leaveQueue(ticketId);
      if (result?.offlineQueued) {
        setMessage(
          result?.message ||
            t.leaveSavedOffline
        );
        return;
      }
      setMyTicket(null);
      setReservationId("");
      setReservationCode("");
      setTxRef("");
      setPaymentPhase("idle");
      setMessage(t.leftQueue);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (error) {
      logReservationError("leaveMyQueue", error);
      setMessage(error?.response?.data?.message || t.failedLeaveQueue);
    } finally {
      setLoading(false);
    }
  }, [myTicket, t.failedLeaveQueue, t.leaveSavedOffline, t.leftQueue, t.noTicketBody, t.noTicketTitle]);

  const startCheckInNow = useCallback(async () => {
    const ticketId = myTicket?.ticketId || reservationId;
    if (!ticketId) {
      Alert.alert(t.checkInMissingTicketTitle, t.checkInMissingTicketBody);
      return;
    }
    if (!canStartCheckIn) {
      setCheckInStatusText(t.completePaymentFirst);
      return;
    }

    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(t.locationRequiredTitle, t.locationRequiredBody);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const session = await startStationCheckIn({
        ticketId,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      setCheckInSession(session);
      setCheckInStatusText(t.startCheckInBtn);
    } catch (error) {
      logReservationError("startCheckInNow", error);
      setCheckInStatusText(error?.response?.data?.message || t.startCheckInFailed);
    } finally {
      setLoading(false);
    }
  }, [
    canStartCheckIn,
    myTicket,
    reservationId,
    t.checkInMissingTicketBody,
    t.checkInMissingTicketTitle,
    t.completePaymentFirst,
    t.locationRequiredBody,
    t.locationRequiredTitle,
    t.startCheckInBtn,
    t.startCheckInFailed,
  ]);

  const getStatusStyle = () => {
    if (detail.fuelStatus === "available" || detail.fuelStatus === "full") return styles.statusFull;
    if (detail.fuelStatus === "limited" || detail.fuelStatus === "partial") return styles.statusPartial;
    return styles.statusEmpty;
  };

  const getStatusBadgeStyle = () => {
    if (detail.fuelStatus === "available" || detail.fuelStatus === "full") return styles.badgeFull;
    if (detail.fuelStatus === "limited" || detail.fuelStatus === "partial") return styles.badgePartial;
    return styles.badgeEmpty;
  };

  const getStatusLabel = () => {
    if (detail.fuelStatus === "available" || detail.fuelStatus === "full") return "available";
    if (detail.fuelStatus === "limited" || detail.fuelStatus === "partial") return "limited";
    return "empty";
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.stationName}>{detail.name}</Text>
        <Text style={styles.metaText}>{t.address}: {detail.address}</Text>
        <Text style={styles.metaText}>{t.contact}: {detail.contact}</Text>
        <Text style={styles.metaText}>{t.stationId}: {stationId || "N/A"}</Text>
        <Text style={styles.metaText}>
          {t.coords}: {Number.isFinite(detail.latitude) ? detail.latitude.toFixed(6) : "-"},{" "}
          {Number.isFinite(detail.longitude) ? detail.longitude.toFixed(6) : "-"}
        </Text>
        <Text style={styles.metaText}>{t.supportedFuels}: {detail.supportedFuels}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.statusHeaderRow}>
          <Text style={styles.sectionTitle}>{t.fuelStatus}</Text>
          <View style={[styles.statusBadge, getStatusBadgeStyle()]}>
            <Text style={[styles.statusValue, getStatusStyle()]}>{statusLabels[getStatusLabel()]}</Text>
          </View>
        </View>

        <View style={styles.fuelGrid}>
          <View style={[styles.fuelCard, styles.fuelCardGasoline]}>
            <Text style={styles.fuelCardTitle}>{t.fuelGasoline}</Text>
            <Text style={styles.fuelCardValue}>{detail.fuelInventory.gasolineLiters.toFixed(2)} L</Text>
          </View>
          <View style={[styles.fuelCard, styles.fuelCardDiesel]}>
            <Text style={styles.fuelCardTitle}>{t.fuelDiesel}</Text>
            <Text style={styles.fuelCardValue}>{detail.fuelInventory.dieselLiters.toFixed(2)} L</Text>
          </View>
          <View style={[styles.fuelCard, styles.fuelCardOther]}>
            <Text style={styles.fuelCardTitle}>{t.fuelOther}</Text>
            <Text style={styles.fuelCardValue}>{detail.fuelInventory.otherLiters.toFixed(2)} L</Text>
          </View>
        </View>

        <View style={styles.queueCard}>
          <Text style={styles.sectionTitle}>{t.queueWait}</Text>
          <View style={styles.queueStatsRow}>
            <View style={styles.queueMiniCard}>
              <Text style={styles.queueMiniLabel}>{t.queueLength}</Text>
              <Text style={styles.queueMiniValue}>{detail.queueLength}</Text>
            </View>
            <View style={[styles.queueMiniCard, styles.queueMiniCardLast]}>
              <Text style={styles.queueMiniLabel}>{t.estWait}</Text>
              <Text style={styles.queueMiniValue}>{detail.waitTime} {t.minuteShort}</Text>
            </View>
          </View>
          <View style={styles.myQueueBox}>
            <Text style={styles.myQueueTitle}>{t.myQueueTitle}</Text>
            <Text style={styles.myQueueText}>
              {t.statusLabel}: {String(myTicket?.status || t.noActiveTicketStatus)}
            </Text>
            <Text style={styles.myQueueText}>
              {t.myPositionLabel}: {Number(myTicket?.position || 0)}
            </Text>
            <Text style={styles.myQueueText}>
              {t.peopleAheadLabel}: {Math.max(0, Number(myTicket?.position || 0) - 1)}
            </Text>
            <Text style={styles.myQueueText}>
              {t.ticketLabel}: {String(myTicket?.reservationCode || "-")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.reservePay}</Text>
        {!queueEnabled ? (
          <Text style={styles.errorText}>
            {t.objectIdError}
          </Text>
        ) : null}

        <Text style={styles.metaText}>{t.requestedBand}</Text>
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

        <Text style={styles.metaText}>{t.fuelType}</Text>
        <View style={styles.optionsRow}>
          {FUEL_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.optionButton, fuelType === type && styles.optionButtonActive]}
              onPress={() => setFuelType(type)}
            >
              <Text style={[styles.optionText, fuelType === type && styles.optionTextActive]}>
                {getFuelLabel(type)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.metaText}>{t.liters}</Text>
        <TextInput
          style={styles.input}
          value={requestedLiters}
          onChangeText={setRequestedLiters}
          keyboardType="numeric"
          placeholder={t.litersPlaceholder}
          placeholderTextColor="#94A3B8"
        />
        <Text style={styles.metaText}>{t.currentPrice} ({getFuelLabel(fuelType)}): {selectedUnitPrice.toFixed(2)} ETB/L</Text>
        <Text style={styles.estimateText}>{t.estimatedTotal}: {estimatedAmount.toFixed(2)} ETB</Text>
        <Text style={styles.metaText}>{t.platformFee}: {platformFeeBirr.toFixed(2)} ETB</Text>
        <Text style={styles.metaText}>{t.amountToPay}</Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{amountToPay.toFixed(2)} ETB</Text>
        </View>

        <View style={styles.paymentDetailsCard}>
          <Text style={styles.paymentDetailsTitle}>{t.paymentDetailsTitle}</Text>
          <Text style={styles.paymentDetailsHint}>{t.paymentDetailsHint}</Text>
          {hasManualPaymentDetails ? (
            <Text style={styles.paymentCopyHint}>{t.paymentCopyHint}</Text>
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
                        {copiedField === item.key ? t.copiedButton : t.copyButton}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            <Text style={styles.noticeText}>{t.paymentDetailsMissing}</Text>
          )}
        </View>

        <View style={styles.buttonGrid}>
          <Pressable
            style={[
              styles.actionButton,
              styles.chapaButton,
              styles.gridButton,
              (!queueEnabled || loading) && styles.disabled
            ]}
            onPress={reserveAndInitiateChapa}
            disabled={!queueEnabled || loading}
          >
            <Text style={styles.primaryButtonText}>{t.payWithChapa}</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.secondaryButton, styles.gridButton, loading && styles.disabled]}
            onPress={checkReservationNow}
            disabled={loading || !reservationId}
          >
            <Text style={styles.secondaryButtonText}>{t.checkPaymentBtn}</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.infoButton, styles.gridButton, loading && styles.disabled]}
            onPress={refreshMyTicket}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>{t.refreshTicketBtn}</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.dangerButton, styles.gridButton, loading && styles.disabled]}
            onPress={leaveMyQueue}
            disabled={loading || disableLeaveAfterPaid}
          >
            <Text style={styles.primaryButtonText}>{t.leaveQueueBtn}</Text>
          </Pressable>
        </View>

        {loading ? <ActivityIndicator size="small" color="#0F766E" style={styles.loader} /> : null}
        <Text style={styles.metaText}>{t.paymentPhaseLabel}: {paymentPhase}</Text>
        <Text style={styles.metaText}>{t.reservationIdLabel}: {reservationId || "-"}</Text>
        <Text style={styles.metaText}>{t.reservationCodeLabel}: {reservationCode || "-"}</Text>
        {message ? <Text style={styles.infoText}>{message}</Text> : null}
        {disableLeaveAfterPaid ? (
          <Text style={styles.noticeText}>
            {tr("stationDetails.leaveDisabledNotice", {
              defaultValue: "Leave queue is disabled after payment for available stations.",
            })}
          </Text>
        ) : null}

        {myTicket ? (
          <View style={styles.ticketCard}>
            <Text style={styles.ticketTitle}>{t.activeTicket}</Text>
            <Text style={styles.metaText}>{t.ticketIdLabel}: {String(myTicket.ticketId || "-")}</Text>
            <Text style={styles.metaText}>{t.reservationCodeLabel}: {String(myTicket.reservationCode || "-")}</Text>
            <Text style={styles.metaText}>{t.statusLabel}: {String(myTicket.status || "-")}</Text>
            <Text style={styles.metaText}>{t.positionLabel}: {String(myTicket.position ?? "-")}</Text>
            <Text style={styles.metaText}>{t.etaMinutesLabel}: {String(myTicket.etaMinutes ?? "-")}</Text>
            <Text style={styles.metaText}>{t.expiresAtLabel}: {formatDateTime(myTicket.expiresAt)}</Text>
            <Text style={styles.metaText}>{t.fuelType}: {getFuelLabel(String(myTicket.fuelType || fuelType))}</Text>
            <Text style={styles.metaText}>{t.requestedLitersLabel}: {String(myTicket.requestedLiters ?? "-")}</Text>
            <Text style={styles.metaText}>{t.estimatedAmountLabel}: {String(myTicket.estimatedAmount ?? "-")} ETB</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.checkInTitle}</Text>
        <Text style={styles.metaText}>
          {t.checkInDesc}
        </Text>

        <Pressable
          style={[styles.actionButton, styles.primaryButton, (loading || !canStartCheckIn) && styles.disabled]}
          onPress={startCheckInNow}
          disabled={loading || !canStartCheckIn}
        >
          <Text style={styles.primaryButtonText}>{t.startCheckInBtn}</Text>
        </Pressable>
        {!canStartCheckIn ? <Text style={styles.noticeText}>{t.completePaymentFirst}</Text> : null}

        <Text style={styles.metaText}>{t.otpFromSession}</Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{checkInSession?.otpCode || "-"}</Text>
        </View>

        <Text style={styles.metaText}>{t.checkInQr}</Text>
        <View style={styles.qrWrap}>
          {checkInSession?.qrToken ? (
            <QRCode value={checkInSession.qrToken} size={170} />
          ) : (
            <Text style={styles.metaText}>{t.startForQr}</Text>
          )}
        </View>

        <Text style={styles.metaText}>
          {t.otpForAttendant}: {checkInSession?.otpCode || "-"}
        </Text>
        <Text style={styles.metaText}>
          {t.attendantNote}
        </Text>

        {checkInStatusText ? <Text style={styles.infoText}>{checkInStatusText}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.reportsTitle}</Text>
        {detail.reports.length ? detail.reports.map((report) => (
          <View key={report.id} style={styles.listItem}>
            <Text style={styles.listTitle}>{report.text}</Text>
            <Text style={styles.listSub}>{report.time}</Text>
          </View>
        )) : <Text style={styles.metaText}>{t.noReports}</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.reviewsTitle}</Text>
        <Text style={styles.ratingHeadline}>{t.avgRating}: {detail.avgRating || "-"}/5</Text>
        {detail.reviews.length ? detail.reviews.map((review) => (
          <View key={review.id} style={styles.listItem}>
            <Text style={styles.listTitle}>
              {review.user} ({review.rating}/5)
            </Text>
            <Text style={styles.listSub}>{review.text}</Text>
          </View>
        )) : <Text style={styles.metaText}>{t.noReviews}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F7FB" },
  content: { padding: 14, paddingBottom: 30 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 10,
  },
  stationName: { fontSize: 22, fontWeight: "900", color: "#0F172A", marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 6 },
  metaText: { fontSize: 13, color: "#334155", marginBottom: 4, fontWeight: "600" },
  statusValue: { fontSize: 16, fontWeight: "900" },
  statusFull: { color: "#15803D" },
  statusPartial: { color: "#B45309" },
  statusEmpty: { color: "#B91C1C" },
  statusHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  badgeFull: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  badgePartial: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FCD34D",
  },
  badgeEmpty: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },
  fuelGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fuelCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  fuelCardGasoline: {
    backgroundColor: "#ECFEFF",
    borderColor: "#67E8F9",
  },
  fuelCardDiesel: {
    backgroundColor: "#EEF2FF",
    borderColor: "#A5B4FC",
    marginHorizontal: 6,
  },
  fuelCardOther: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  fuelCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 2,
  },
  fuelCardValue: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1E293B",
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
  ratingHeadline: { fontSize: 13, fontWeight: "800", color: "#1D4ED8", marginBottom: 6 },
  listItem: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  listTitle: { fontSize: 13, fontWeight: "800", color: "#0F172A", marginBottom: 2 },
  listSub: { fontSize: 12, color: "#475569", fontWeight: "600" },
  actionButton: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  gridButton: {
    width: "48%",
  },
  primaryButton: { backgroundColor: "#0F766E" },
  secondaryButton: { backgroundColor: "#DBEAFE", borderWidth: 1, borderColor: "#1D4ED8" },
  infoButton: { backgroundColor: "#0EA5E9" },
  dangerButton: { backgroundColor: "#B91C1C" },
  chapaButton: { backgroundColor: "#F59E0B" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  loader: { marginTop: 4, marginBottom: 4 },
  infoText: { fontSize: 12, color: "#0F766E", fontWeight: "700", marginBottom: 6 },
  noticeText: { fontSize: 12, color: "#92400E", fontWeight: "700", marginBottom: 6 },
  errorText: { fontSize: 12, color: "#B91C1C", fontWeight: "700", marginBottom: 8 },
  optionsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
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
  ticketCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    padding: 8,
  },
  ticketTitle: { fontSize: 13, fontWeight: "900", color: "#065F46", marginBottom: 4 },
});
