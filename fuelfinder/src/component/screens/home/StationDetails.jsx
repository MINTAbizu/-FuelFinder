import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import QRCode from "react-native-qrcode-svg";
import { useLanguage } from "../../context/LanguageContext";
import {
  getMyQueueTicket,
  getReservationStatus,
  getStationQueue,
  leaveQueue,
  reserveQueueSlot,
  startStationCheckIn,
  startTelebirrCheckout,
} from "../../services/queueService";

const statusMap = {
  available: "Full",
  limited: "Partial",
  empty: "Empty",
};

const getWaitEstimate = (queueLength) => Math.max(2, Number(queueLength || 0) * 3);
const REQUESTED_BANDS = ["10-20", "20-40", "40+"];
const FUEL_TYPES = ["gasoline", "diesel", "other"];
const DEFAULT_FUEL_PRICES = {
  gasoline: 95,
  diesel: 92,
  other: 90,
};
const I18N = {
  en: {
    stationFallback: "Fuel Station",
    address: "Address",
    contact: "Contact",
    stationId: "Station ID",
    coords: "Coordinates",
    supportedFuels: "Supported fuels",
    fuelStatus: "Fuel Status",
    queueWait: "Queue & Wait",
    queueLength: "Queue Length",
    estWait: "Estimated Wait",
    reservePay: "Queue Reservation & Payment",
    requestedBand: "Requested Band",
    fuelType: "Fuel Type",
    liters: "How Many Liters",
    litersPlaceholder: "Enter liters (e.g. 25)",
    currentPrice: "Current Price",
    estimatedTotal: "Estimated Total",
    reservePayBtn: "Reserve & Pay with Telebirr",
    checkPaymentBtn: "Check Payment Status",
    refreshTicketBtn: "Refresh My Ticket",
    leaveQueueBtn: "Leave Queue",
    activeTicket: "My Active Ticket",
    checkInTitle: "Station Check-In (QR + OTP)",
    checkInDesc: "Start check-in at station, then show OTP/QR to attendant.",
    startCheckInBtn: "Start Check-In",
    otpFromSession: "OTP From Session",
    checkInQr: "Check-In QR (show this to attendant)",
    noReports: "No live reports for this station yet.",
    noReviews: "No live reviews for this station yet.",
    reportsTitle: "User Reports / Latest Updates",
    reviewsTitle: "Ratings & Reviews",
    avgRating: "Average Rating",
    invalidLitersTitle: "Invalid Liters",
    invalidLitersBody: "Enter a valid number of liters greater than 0.",
    missingReservationTitle: "Missing Reservation",
    missingReservationBody: "Start a reservation first.",
    noTicketTitle: "No Ticket",
    noTicketBody: "No active ticket found.",
    stationIdMissingTitle: "Station ID Missing",
    stationIdMissingBody: "This station does not have a valid backend stationId.",
    checkInMissingTicketTitle: "Missing Ticket",
    checkInMissingTicketBody: "You need an active queue ticket before check-in.",
    locationRequiredTitle: "Location Required",
    locationRequiredBody: "Enable location permission to start check-in.",
    paymentInitiated: "Payment initiated. Complete payment in Telebirr, then status will update.",
    failedStartPayment: "Failed to start payment.",
    waitingPaymentConfirm: "Waiting for payment confirmation. Tap Check Payment Status.",
    paymentVerified: "Payment verified. Your queue ticket is now active.",
    reservationExpired: "Reservation expired before payment confirmation.",
    activeTicketLoaded: "Active queue ticket loaded.",
    noActiveTicket: "No active ticket.",
    leftQueue: "You left the queue.",
    failedLeaveQueue: "Failed to leave queue.",
    startCheckInFailed: "Failed to start station check-in.",
    startForQr: "Start check-in to generate QR and OTP.",
    attendantNote: "Attendant verification should be done in staff app only.",
  },
  am: {
    stationFallback: "ነዳጅ ማደያ",
    address: "አድራሻ",
    contact: "ስልክ",
    stationId: "የማደያ መለያ",
    coords: "ኮኦርዲኔት",
    supportedFuels: "የሚደገፉ ነዳጆች",
    fuelStatus: "የነዳጅ ሁኔታ",
    queueWait: "ሰልፍ እና ቆይታ",
    queueLength: "የሰልፍ ርዝመት",
    estWait: "የተገመተ ቆይታ",
    reservePay: "የሰልፍ ማስያዣ እና ክፍያ",
    requestedBand: "የተጠየቀ መጠን",
    fuelType: "የነዳጅ አይነት",
    liters: "የሚፈልጉት ሊትር",
    litersPlaceholder: "ሊትር ያስገቡ (ለምሳሌ 25)",
    currentPrice: "አሁን ያለ ዋጋ",
    estimatedTotal: "ጠቅላላ የተገመተ ዋጋ",
    reservePayBtn: "ያስያዙ እና በቴሌብር ይክፈሉ",
    checkPaymentBtn: "የክፍያ ሁኔታ ያረጋግጡ",
    refreshTicketBtn: "የኔን ትኬት አድስ",
    leaveQueueBtn: "ከሰልፍ ውጣ",
    activeTicket: "የኔ ንቁ ትኬት",
    checkInTitle: "የማደያ ቼክ-ኢን (QR + OTP)",
    checkInDesc: "በማደያ ሲደርሱ ቼክ-ኢን ይጀምሩ እና OTP/QR ለሰራተኛ ያሳዩ።",
    startCheckInBtn: "ቼክ-ኢን ጀምር",
    otpFromSession: "ከሴሽን የተሰጠ OTP",
    checkInQr: "የቼክ-ኢን QR (ለሰራተኛ አሳይ)",
    noReports: "ለዚህ ማደያ የቀጥታ ሪፖርት የለም።",
    noReviews: "ለዚህ ማደያ የቀጥታ አስተያየት የለም።",
    reportsTitle: "የተጠቃሚ ሪፖርቶች / የቅርብ ማሻሻያ",
    reviewsTitle: "ደረጃ እና አስተያየት",
    avgRating: "አማካይ ደረጃ",
    invalidLitersTitle: "የሊትር መጠን ስህተት",
    invalidLitersBody: "ከ0 በላይ ትክክለኛ የሊትር መጠን ያስገቡ።",
    missingReservationTitle: "ማስያዣ የለም",
    missingReservationBody: "መጀመሪያ ማስያዣ ይፍጠሩ።",
    noTicketTitle: "ትኬት የለም",
    noTicketBody: "ንቁ ትኬት አልተገኘም።",
    stationIdMissingTitle: "የማደያ መለያ ጎድሏል",
    stationIdMissingBody: "ይህ ማደያ ትክክለኛ backend stationId የለውም።",
    checkInMissingTicketTitle: "ትኬት የለም",
    checkInMissingTicketBody: "ቼክ-ኢን ከመጀመር በፊት ንቁ ትኬት ያስፈልጋል።",
    locationRequiredTitle: "አካባቢ ፍቃድ ያስፈልጋል",
    locationRequiredBody: "ቼክ-ኢን ለመጀመር የአካባቢ ፍቃድ ያስፈልጋል።",
    paymentInitiated: "ክፍያ ተጀምሯል። በቴሌብር ያጠናቅቁ።",
    failedStartPayment: "ክፍያ መጀመር አልተቻለም።",
    waitingPaymentConfirm: "የክፍያ ማረጋገጫ በመጠባበቅ ላይ።",
    paymentVerified: "ክፍያ ተረጋግጧል። ትኬትዎ ንቁ ሆኗል።",
    reservationExpired: "የማስያዣ ጊዜ አልቋል።",
    activeTicketLoaded: "ንቁ ትኬት ተጭኗል።",
    noActiveTicket: "ንቁ ትኬት የለም።",
    leftQueue: "ከሰልፉ ወጥተዋል።",
    failedLeaveQueue: "ከሰልፍ መውጣት አልተቻለም።",
    startCheckInFailed: "የማደያ ቼክ-ኢን መጀመር አልተቻለም።",
    startForQr: "QR እና OTP ለመፍጠር ቼክ-ኢን ይጀምሩ።",
    attendantNote: "ማረጋገጫ በሰራተኛ መተግበሪያ ብቻ ይደረጋል።",
  },
};

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

function formatSupportedFuels(supportedFuels) {
  const map = supportedFuels || {};
  const values = [];
  if (map.gasoline) values.push("gasoline");
  if (map.diesel) values.push("diesel");
  if (map.other) values.push("other");
  if (map.unknown || !values.length) return "not specified";
  return values.join(", ");
}

export default function StationDetails({ route }) {
  const { language } = useLanguage();
  const t = I18N[language] || I18N.en;
  const { station } = route.params || {};
  const [requestedBand, setRequestedBand] = useState("10-20");
  const [fuelType, setFuelType] = useState("gasoline");
  const [requestedLiters, setRequestedLiters] = useState("10");
  const [reservationId, setReservationId] = useState("");
  const [prepayId, setPrepayId] = useState("");
  const [rawRequest, setRawRequest] = useState("");
  const [myTicket, setMyTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState("idle");
  const [liveQueueCount, setLiveQueueCount] = useState(null);
  const [checkInSession, setCheckInSession] = useState(null);
  const [checkInStatusText, setCheckInStatusText] = useState("");
  const pollRef = useRef(null);

  const stationId = useMemo(
    () => String(station?.stationId || station?._id || station?.id || "").trim(),
    [station]
  );
  const queueEnabled = isObjectId(stationId);
  const fuelPrices = useMemo(() => {
    const fromMap = station?.fuel_prices || station?.fuelPrices || {};
    return {
      gasoline: Number(
        fromMap.gasoline ?? station?.gasoline_price ?? station?.gasolinePrice ?? DEFAULT_FUEL_PRICES.gasoline
      ),
      diesel: Number(
        fromMap.diesel ?? station?.diesel_price ?? station?.dieselPrice ?? DEFAULT_FUEL_PRICES.diesel
      ),
      other: Number(
        fromMap.other ?? station?.other_price ?? station?.otherPrice ?? DEFAULT_FUEL_PRICES.other
      ),
    };
  }, [station]);
  const selectedUnitPrice = Number(fuelPrices[fuelType] || 0);
  const litersValue = Number(requestedLiters);
  const estimatedAmount = Number.isFinite(litersValue) && litersValue > 0
    ? Number((litersValue * selectedUnitPrice).toFixed(2))
    : 0;

  const detail = useMemo(() => {
    const queue = Number(
      liveQueueCount !== null && liveQueueCount !== undefined ? liveQueueCount : station?.queue_length || 0
    );
    const fuelStatus = statusMap[station?.fuel_status] || "Partial";
    return {
      name: station?.name || "Fuel Station",
      address: station?.address || t.address,
      contact: station?.contact || t.contact,
      latitude: Number(station?.latitude),
      longitude: Number(station?.longitude),
      supportedFuels: formatSupportedFuels(station?.supportedFuels),
      fuelStatus,
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
  }, [liveQueueCount, station, t.address, t.contact]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!queueEnabled) return undefined;
    (async () => {
      try {
        const queue = await getStationQueue(stationId);
        if (!active) return;
        setLiveQueueCount(Number(queue?.waitingCount || 0));
      } catch (_error) {
        if (!active) return;
        setLiveQueueCount(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [queueEnabled, stationId]);

  const refreshMyTicket = useCallback(async () => {
    if (!queueEnabled) return;
    setLoading(true);
    try {
      const ticket = await getMyQueueTicket(stationId);
      setMyTicket(ticket);
      setMessage(t.activeTicketLoaded);
    } catch (error) {
      logReservationError("refreshMyTicket", error);
      setMyTicket(null);
      setMessage(error?.response?.data?.message || t.noActiveTicket);
    } finally {
      setLoading(false);
    }
  }, [queueEnabled, stationId]);

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
      }, 4000);
    },
    []
  );

  const reserveAndInitiate = useCallback(async () => {
    if (!queueEnabled) {
      Alert.alert(t.stationIdMissingTitle, t.stationIdMissingBody);
      return;
    }

    setLoading(true);
    setMessage("");
    setPaymentPhase("reserving");
    try {
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
      setReservationId(nextReservationId);
      setPaymentPhase("initiating");

      const initiate = await startTelebirrCheckout(nextReservationId);
      setPrepayId(initiate?.prepayId || "");
      setRawRequest(initiate?.rawRequest || "");
      setPaymentPhase("pending");
      setMessage(t.paymentInitiated);
      await pollReservation(nextReservationId, true);
    } catch (error) {
      logReservationError("reserveAndInitiate", error);
      setPaymentPhase("failed");
      setMessage(error?.response?.data?.message || t.failedStartPayment);
    } finally {
      setLoading(false);
    }
  }, [fuelType, litersValue, pollReservation, queueEnabled, requestedBand, selectedUnitPrice, stationId]);

  const checkReservationNow = useCallback(async () => {
    if (!reservationId) {
      Alert.alert(t.missingReservationTitle, t.missingReservationBody);
      return;
    }
    setLoading(true);
    try {
      await pollReservation(reservationId, true);
    } finally {
      setLoading(false);
    }
  }, [pollReservation, reservationId]);

  const leaveMyQueue = useCallback(async () => {
    const ticketId = myTicket?.ticketId;
    if (!ticketId) {
      Alert.alert(t.noTicketTitle, t.noTicketBody);
      return;
    }
    setLoading(true);
    try {
      await leaveQueue(ticketId);
      setMyTicket(null);
      setReservationId("");
      setPrepayId("");
      setRawRequest("");
      setPaymentPhase("idle");
      setMessage(t.leftQueue);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (error) {
      logReservationError("leaveMyQueue", error);
      setMessage(error?.response?.data?.message || t.failedLeaveQueue);
    } finally {
      setLoading(false);
    }
  }, [myTicket]);

  const startCheckInNow = useCallback(async () => {
    const ticketId = myTicket?.ticketId || reservationId;
    if (!ticketId) {
      Alert.alert(t.checkInMissingTicketTitle, t.checkInMissingTicketBody);
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
      setCheckInStatusText(`${t.startCheckInBtn}. OTP: ${new Date(session.expiresAt).toLocaleTimeString()}`);
    } catch (error) {
      logReservationError("startCheckInNow", error);
      setCheckInStatusText(error?.response?.data?.message || t.startCheckInFailed);
    } finally {
      setLoading(false);
    }
  }, [myTicket, reservationId]);

  const getStatusStyle = () => {
    if (detail.fuelStatus === "Full") return styles.statusFull;
    if (detail.fuelStatus === "Partial") return styles.statusPartial;
    return styles.statusEmpty;
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
        <Text style={styles.sectionTitle}>{t.fuelStatus}</Text>
        <Text style={[styles.statusValue, getStatusStyle()]}>{detail.fuelStatus}</Text>
        <Text style={styles.sectionTitle}>{t.queueWait}</Text>
        <Text style={styles.metaText}>{t.queueLength}: {detail.queueLength}</Text>
        <Text style={styles.metaText}>{t.estWait}: {detail.waitTime}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.reservePay}</Text>
        {!queueEnabled ? (
          <Text style={styles.errorText}>
            This station lacks a valid backend ObjectId. Update station data before queueing.
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
                {type}
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
        <Text style={styles.metaText}>{t.currentPrice} ({fuelType}): {selectedUnitPrice.toFixed(2)} ETB/L</Text>
        <Text style={styles.estimateText}>{t.estimatedTotal}: {estimatedAmount.toFixed(2)} ETB</Text>

        <Pressable
          style={[styles.actionButton, styles.primaryButton, (!queueEnabled || loading) && styles.disabled]}
          onPress={reserveAndInitiate}
          disabled={!queueEnabled || loading}
        >
          <Text style={styles.primaryButtonText}>{t.reservePayBtn}</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.secondaryButton, loading && styles.disabled]}
          onPress={checkReservationNow}
          disabled={loading || !reservationId}
        >
          <Text style={styles.secondaryButtonText}>{t.checkPaymentBtn}</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.infoButton, loading && styles.disabled]}
          onPress={refreshMyTicket}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>{t.refreshTicketBtn}</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.dangerButton, loading && styles.disabled]}
          onPress={leaveMyQueue}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>{t.leaveQueueBtn}</Text>
        </Pressable>

        {loading ? <ActivityIndicator size="small" color="#0F766E" style={styles.loader} /> : null}
        <Text style={styles.metaText}>phase: {paymentPhase}</Text>
        <Text style={styles.metaText}>reservationId: {reservationId || "-"}</Text>
        <Text style={styles.metaText}>prepayId: {prepayId || "-"}</Text>
        <Text style={styles.metaText}>rawRequest: {rawRequest || "-"}</Text>
        {message ? <Text style={styles.infoText}>{message}</Text> : null}

        {myTicket ? (
          <View style={styles.ticketCard}>
            <Text style={styles.ticketTitle}>{t.activeTicket}</Text>
            <Text style={styles.metaText}>ticketId: {String(myTicket.ticketId || "-")}</Text>
            <Text style={styles.metaText}>status: {String(myTicket.status || "-")}</Text>
            <Text style={styles.metaText}>position: {String(myTicket.position ?? "-")}</Text>
            <Text style={styles.metaText}>etaMinutes: {String(myTicket.etaMinutes ?? "-")}</Text>
            <Text style={styles.metaText}>fuelType: {String(myTicket.fuelType || fuelType)}</Text>
            <Text style={styles.metaText}>requestedLiters: {String(myTicket.requestedLiters ?? "-")}</Text>
            <Text style={styles.metaText}>estimatedAmount: {String(myTicket.estimatedAmount ?? "-")} ETB</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.checkInTitle}</Text>
        <Text style={styles.metaText}>
          {t.checkInDesc}
        </Text>

        <Pressable
          style={[styles.actionButton, styles.primaryButton, loading && styles.disabled]}
          onPress={startCheckInNow}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>{t.startCheckInBtn}</Text>
        </Pressable>

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
          OTP for attendant: {checkInSession?.otpCode || "-"}
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
  statusValue: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  statusFull: { color: "#15803D" },
  statusPartial: { color: "#B45309" },
  statusEmpty: { color: "#B91C1C" },
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
  primaryButton: { backgroundColor: "#0F766E" },
  secondaryButton: { backgroundColor: "#DBEAFE", borderWidth: 1, borderColor: "#1D4ED8" },
  infoButton: { backgroundColor: "#0EA5E9" },
  dangerButton: { backgroundColor: "#B91C1C" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  loader: { marginTop: 4, marginBottom: 4 },
  infoText: { fontSize: 12, color: "#0F766E", fontWeight: "700", marginBottom: 6 },
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
