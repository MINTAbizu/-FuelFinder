import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
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
  startchapaCheckout
} from "../../services/queueService";

const REQUESTED_BANDS = ["10-20", "20-40", "40+"];
const FUEL_TYPES = ["gasoline", "diesel", "other"];
const DEFAULT_FUEL_PRICES = { gasoline: 95, diesel: 92, other: 90 };
const getWaitEstimate = (queueLength) => Math.max(2, Number(queueLength || 0) * 3);

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
    estimatedAmount: Number(ticket.estimatedAmount || 0)
  };
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
  const { t: tr } = useLanguage();
  const t = useMemo(
    () => ({
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
      startCheckInFailed: tr("stationDetails.startCheckInFailed"),
      startForQr: tr("stationDetails.startForQr"),
      attendantNote: tr("stationDetails.attendantNote"),
      objectIdError: tr("stationDetails.objectIdError"),
      otpForAttendant: tr("stationDetails.otpForAttendant"),
    }),
    [tr]
  );

  const statusLabels = useMemo(() => ({
    available: tr("homeScreen.status.available"),
    limited: tr("homeScreen.status.limited"),
    empty: tr("homeScreen.status.empty"),
  }), [tr]);

  const { station } = route.params || {};
  const [requestedBand, setRequestedBand] = useState("10-20");
  const [fuelType, setFuelType] = useState("gasoline");
  const [requestedLiters, setRequestedLiters] = useState("10");
  const [reservationId, setReservationId] = useState("");
  const [reservationCode, setReservationCode] = useState("");
  const [prepayId, setPrepayId] = useState("");
  const [rawRequest, setRawRequest] = useState("");
  const [myTicket, setMyTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState("idle");
  const [liveQueueCount, setLiveQueueCount] = useState(null);
  const [liveFuel, setLiveFuel] = useState(null);
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
      gasoline: Number(fromMap.gasoline ?? station?.gasoline_price ?? DEFAULT_FUEL_PRICES.gasoline),
      diesel: Number(fromMap.diesel ?? station?.diesel_price ?? DEFAULT_FUEL_PRICES.diesel),
      other: Number(fromMap.other ?? station?.other_price ?? DEFAULT_FUEL_PRICES.other),
    };
  }, [station]);

  const selectedUnitPrice = Number(fuelPrices[fuelType] || 0);
  const litersValue = Number(requestedLiters);
  const estimatedAmount = Number.isFinite(litersValue) && litersValue > 0
    ? Number((litersValue * selectedUnitPrice).toFixed(2))
    : 0;

  const detail = useMemo(() => {
    const queue = Number(liveQueueCount ?? station?.queue_length ?? 0);
    const fuelStatus = String(liveFuel?.fuelStatus ?? station?.fuel_status ?? "limited");
    const fuelInventory = {
      gasolineLiters: Number(liveFuel?.fuelInventory?.gasolineLiters ?? station?.fuelInventory?.gasolineLiters ?? 0),
      dieselLiters: Number(liveFuel?.fuelInventory?.dieselLiters ?? station?.fuelInventory?.dieselLiters ?? 0),
      otherLiters: Number(liveFuel?.fuelInventory?.otherLiters ?? station?.fuelInventory?.otherLiters ?? 0),
    };
    return {
      name: station?.name ?? t.stationFallback,
      address: station?.address ?? t.address,
      contact: station?.contact ?? t.contact,
      latitude: Number(station?.latitude),
      longitude: Number(station?.longitude),
      supportedFuels: formatSupportedFuels(station?.supportedFuels),
      fuelStatus,
      fuelInventory,
      queueLength: queue,
      waitTime: getWaitEstimate(queue),
      reports: Array.isArray(station?.reports) ? station.reports : [],
      reviews: Array.isArray(station?.reviews) ? station.reviews : [],
      avgRating: station?.reviews?.length
        ? (station.reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / station.reviews.length).toFixed(1)
        : "4.5",
    };
  }, [liveFuel, liveQueueCount, station, t.address, t.contact, t.stationFallback]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (!queueEnabled) return;
    let active = true;
    const fetchLive = async () => {
      try {
        const queue = await getStationQueue(stationId);
        if (!active) return;
        setLiveQueueCount(Number(queue?.waitingCount || 0));
        setLiveFuel({
          fuelStatus: String(queue?.fuelStatus ?? ""),
          fuelInventory: {
            gasolineLiters: Number(queue?.fuelInventory?.gasolineLiters ?? 0),
            dieselLiters: Number(queue?.fuelInventory?.dieselLiters ?? 0),
            otherLiters: Number(queue?.fuelInventory?.otherLiters ?? 0),
            updatedAt: queue?.fuelInventory?.updatedAt ?? null,
          }
        });
      } catch { if (!active) setLiveQueueCount(null); }
    };
    fetchLive();
    const id = setInterval(fetchLive, 10000);
    return () => { active = false; clearInterval(id); };
  }, [queueEnabled, stationId]);

  useEffect(() => {
    if (!queueEnabled) return;
    let active = true;
    const fetchMyTicket = async () => {
      try {
        const ticket = await getMyQueueTicket(stationId);
        if (!active) return;
        setMyTicket(normalizeTicketPayload(ticket));
        if (ticket?.reservationCode) setReservationCode(ticket.reservationCode);
      } catch (error) {
        if (!active) return;
        if (Number(error?.response?.status ?? 0) === 404) setMyTicket(null);
      }
    };
    fetchMyTicket();
    const id = setInterval(fetchMyTicket, 8000);
    return () => { active = false; clearInterval(id); };
  }, [queueEnabled, stationId]);

  // ---------- Reservation Polling ----------
  const pollReservation = useCallback(async (nextReservationId, immediate = false) => {
    if (!nextReservationId) return;
    if (pollRef.current) clearInterval(pollRef.current);

    const runPoll = async () => {
      try {
        const status = await getReservationStatus(nextReservationId);
        if (status.status === "waiting" || status.status === "called") {
          setMyTicket({
            ticketId: String(status.reservationId),
            reservationCode: String(status.reservationCode ?? ""),
            status: status.status,
            position: status.position,
            etaMinutes: Number(status.position ?? 0) * 3,
            fuelType: status.fuelType,
            requestedLiters: status.requestedLiters,
            estimatedAmount: status.estimatedAmount
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
      } catch (_error) { /* silent retry */ }
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
  }, [t.paymentVerified, t.reservationExpired, t.waitingPaymentConfirm]);

  // ---------- Reserve & Start Telebirr ----------
  const reserveAndStartTelebirr = useCallback(async () => {
    if (!queueEnabled) return Alert.alert(t.stationIdMissingTitle, t.stationIdMissingBody);
    if (!Number.isFinite(litersValue) || litersValue <= 0) return Alert.alert(t.invalidLitersTitle, t.invalidLitersBody);

    setLoading(true);
    setMessage("");
    setPaymentPhase("reserving");

    try {
      const reserve = await reserveQueueSlot({ stationId, requestedBand, fuelType, requestedLiters: litersValue, unitPrice: selectedUnitPrice });
      const nextReservationId = reserve.reservationId;
      const nextReservationCode = reserve.reservationCode;
      setReservationId(nextReservationId);
      setReservationCode(nextReservationCode);
      setPaymentPhase("initiating");

      const initiate = await startTelebirrCheckout(nextReservationId);
      setPrepayId(initiate.prepayId ?? "");
      setRawRequest(initiate.rawRequest ?? "");
      setPaymentPhase("pending");
      setMessage(t.paymentInitiated);
      await pollReservation(nextReservationId, true);
    } catch (error) {
      console.error(error);
      setPaymentPhase("failed");
      setMessage(error?.response?.data?.message ?? t.failedStartPayment);
    } finally { setLoading(false); }
  }, [queueEnabled, stationId, litersValue, fuelType, requestedBand, selectedUnitPrice, pollReservation]);

  // ---------- Start Chapa Payment ----------
  const startChapaPayment = useCallback(async () => {
    if (!queueEnabled) return Alert.alert(t.stationIdMissingTitle, t.stationIdMissingBody);
    if (!Number.isFinite(litersValue) || litersValue <= 0) return Alert.alert(t.invalidLitersTitle, t.invalidLitersBody);

    setLoading(true);
    setMessage("");
    setPaymentPhase("initiating");

    try {
      const res = await startchapaCheckout({ reservationId, amount: estimatedAmount, email: "user@example.com", firstName: "Fuel", lastName: "User" });
      const checkoutUrl = res?.data?.checkout_url;
      if (!checkoutUrl) throw new Error("Chapa checkout URL not returned");

      setPaymentPhase("pending");
      setMessage(t.paymentInitiated);
      Linking.openURL(checkoutUrl);

      // Start polling
      await pollReservation(reservationId, true);
    } catch (error) {
      console.error(error);
      setPaymentPhase("failed");
      setMessage(error?.response?.data?.message ?? t.failedStartPayment);
    } finally { setLoading(false); }
  }, [queueEnabled, reservationId, estimatedAmount, litersValue, pollReservation]);

  // ---------- UI Helpers ----------
  const refreshMyTicket = useCallback(async () => {
    if (!queueEnabled) return;
    setLoading(true);
    try {
      const ticket = await getMyQueueTicket(stationId);
      setMyTicket(normalizeTicketPayload(ticket));
      setReservationCode(ticket?.reservationCode ?? "");
      setMessage(t.activeTicketLoaded);
    } catch {
      setMyTicket(null);
      setMessage(t.noActiveTicket);
    } finally { setLoading(false); }
  }, [queueEnabled, stationId]);

  const leaveMyQueue = useCallback(async () => {
    if (!myTicket?.ticketId) return Alert.alert(t.noTicketTitle, t.noTicketBody);
    setLoading(true);
    try {
      await leaveQueue(myTicket.ticketId);
      setMyTicket(null);
      setReservationId("");
      setReservationCode("");
      setPrepayId("");
      setRawRequest("");
      setPaymentPhase("idle");
      setMessage(t.leftQueue);
      if (pollRef.current) clearInterval(pollRef.current);
    } catch { setMessage(t.failedLeaveQueue); } finally { setLoading(false); }
  }, [myTicket]);

  const startCheckInNow = useCallback(async () => {
    const ticketId = myTicket?.ticketId || reservationId;
    if (!ticketId) return Alert.alert(t.checkInMissingTicketTitle, t.checkInMissingTicketBody);

    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return Alert.alert(t.locationRequiredTitle, t.locationRequiredBody);

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const session = await startStationCheckIn({ ticketId, lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy });
      setCheckInSession(session);
      setCheckInStatusText(t.startCheckInBtn);
    } catch {
      setCheckInStatusText(t.startCheckInFailed);
    } finally { setLoading(false); }
  }, [myTicket, reservationId]);

  // ---------- Render ----------
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Station Info */}
      <View style={styles.card}>
        <Text style={styles.stationName}>{detail.name}</Text>
        <Text style={styles.metaText}>{t.address}: {detail.address}</Text>
        <Text style={styles.metaText}>{t.contact}: {detail.contact}</Text>
        <Text style={styles.metaText}>{t.stationId}: {stationId || "N/A"}</Text>
        <Text style={styles.metaText}>{t.supportedFuels}: {detail.supportedFuels}</Text>
        <Text style={styles.metaText}>{t.fuelStatus}: {statusLabels[detail.fuelStatus] ?? "Unknown"}</Text>
        <Text style={styles.metaText}>{t.queueLength}: {detail.queueLength}</Text>
        <Text style={styles.metaText}>{t.estWait}: {detail.waitTime} min</Text>
      </View>

      {/* Payment Section */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t.reservePay}</Text>

        <Text>{t.requestedBand}: {requestedBand}</Text>
        <Text>{t.fuelType}: {fuelType}</Text>
        <Text>{t.liters}: {requestedLiters}</Text>
        <Text>{t.currentPrice}: {selectedUnitPrice}</Text>
        <Text>{t.estimatedTotal}: {estimatedAmount}</Text>

        <TextInput
          style={styles.input}
          value={String(requestedLiters)}
          keyboardType="numeric"
          onChangeText={setRequestedLiters}
          placeholder={t.litersPlaceholder}
        />

        <Pressable style={[styles.actionButton, styles.primaryButton]} onPress={reserveAndStartTelebirr} disabled={loading}>
          {loading && paymentPhase === "reserving" ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Pay with Telebirr</Text>}
        </Pressable>

        <Pressable style={[styles.actionButton, styles.secondaryButton]} onPress={startChapaPayment} disabled={loading}>
          <Text style={styles.secondaryButtonText}>Pay with Chapa</Text>
        </Pressable>

        {message ? <Text style={styles.messageText}>{message}</Text> : null}
      </View>

      {/* Active Ticket Section */}
      {myTicket && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.activeTicket}</Text>
          <Text>Code: {myTicket.reservationCode}</Text>
          <Text>Status: {myTicket.status}</Text>
          <Text>Position: {myTicket.position}</Text>
          <Text>ETA: {myTicket.etaMinutes} min</Text>
          {checkInSession && <QRCode value={checkInSession.qrData} size={150} />}
          <Pressable style={styles.actionButton} onPress={refreshMyTicket}><Text>Refresh Ticket</Text></Pressable>
          <Pressable style={styles.actionButton} onPress={leaveMyQueue}><Text>{t.leaveQueueBtn}</Text></Pressable>
          <Pressable style={styles.actionButton} onPress={startCheckInNow}><Text>{t.startCheckInBtn}</Text></Pressable>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f4f4" },
  content: { padding: 16 },
  card: { backgroundColor: "#fff", padding: 16, borderRadius: 12, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 10 },
  stationName: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  metaText: { fontSize: 14, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, marginBottom: 12 },
  actionButton: { padding: 12, borderRadius: 8, alignItems: "center", marginVertical: 6 },
  primaryButton: { backgroundColor: "#007bff" },
  secondaryButton: { backgroundColor: "#28a745" },
  primaryButtonText: { color: "#fff", fontWeight: "bold" },
  secondaryButtonText: { color: "#fff", fontWeight: "bold" },
  messageText: { marginTop: 8, fontSize: 14, color: "#555" },
});