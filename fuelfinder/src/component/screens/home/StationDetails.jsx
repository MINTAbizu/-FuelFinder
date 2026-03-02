import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import {
  getMyQueueTicket,
  getReservationStatus,
  getStationQueue,
  leaveQueue,
  reserveQueueSlot,
  startStationCheckIn,
  startTelebirrCheckout,
  verifyStationCheckIn
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
  const [checkInOtpInput, setCheckInOtpInput] = useState("");
  const [checkInQrInput, setCheckInQrInput] = useState("");
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
      address: station?.address || "Address not listed",
      contact: station?.contact || "Not listed",
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
  }, [liveQueueCount, station]);

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
      setMessage("Active queue ticket loaded.");
    } catch (error) {
      logReservationError("refreshMyTicket", error);
      setMyTicket(null);
      setMessage(error?.response?.data?.message || "No active ticket.");
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
            setMessage("Payment verified. Your queue ticket is now active.");
            if (pollRef.current) clearInterval(pollRef.current);
            return;
          }
          if (status.status === "expired") {
            setPaymentPhase("expired");
            setMessage("Reservation expired before payment confirmation.");
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
          setMessage("Waiting for payment confirmation. Tap Check Payment Status.");
        }
      }, 4000);
    },
    []
  );

  const reserveAndInitiate = useCallback(async () => {
    if (!queueEnabled) {
      Alert.alert("Station ID Missing", "This station does not have a valid backend stationId.");
      return;
    }

    setLoading(true);
    setMessage("");
    setPaymentPhase("reserving");
    try {
      if (!Number.isFinite(litersValue) || litersValue <= 0) {
        Alert.alert("Invalid Liters", "Enter a valid number of liters greater than 0.");
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
      setMessage("Payment initiated. Complete payment in Telebirr, then status will update.");
      await pollReservation(nextReservationId, true);
    } catch (error) {
      logReservationError("reserveAndInitiate", error);
      setPaymentPhase("failed");
      setMessage(error?.response?.data?.message || "Failed to start payment.");
    } finally {
      setLoading(false);
    }
  }, [fuelType, litersValue, pollReservation, queueEnabled, requestedBand, selectedUnitPrice, stationId]);

  const checkReservationNow = useCallback(async () => {
    if (!reservationId) {
      Alert.alert("Missing Reservation", "Start a reservation first.");
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
      Alert.alert("No Ticket", "No active ticket found.");
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
      setMessage("You left the queue.");
      if (pollRef.current) clearInterval(pollRef.current);
    } catch (error) {
      logReservationError("leaveMyQueue", error);
      setMessage(error?.response?.data?.message || "Failed to leave queue.");
    } finally {
      setLoading(false);
    }
  }, [myTicket]);

  const startCheckInNow = useCallback(async () => {
    const ticketId = myTicket?.ticketId || reservationId;
    if (!ticketId) {
      Alert.alert("Missing Ticket", "You need an active queue ticket before check-in.");
      return;
    }

    setLoading(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location Required", "Enable location permission to start station check-in.");
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
      setCheckInQrInput(session?.qrToken || "");
      setCheckInOtpInput("");
      setCheckInStatusText(`Check-in started. OTP expires at ${new Date(session.expiresAt).toLocaleTimeString()}.`);
    } catch (error) {
      logReservationError("startCheckInNow", error);
      setCheckInStatusText(error?.response?.data?.message || "Failed to start station check-in.");
    } finally {
      setLoading(false);
    }
  }, [myTicket, reservationId]);

  const verifyCheckInNow = useCallback(async () => {
    const ticketId = myTicket?.ticketId || reservationId;
    if (!ticketId) {
      Alert.alert("Missing Ticket", "No ticket found for verification.");
      return;
    }

    const otpCode = String(checkInOtpInput || "").trim();
    const qrToken = String(checkInQrInput || "").trim();
    if (!otpCode && !qrToken) {
      Alert.alert("Missing Proof", "Enter OTP or QR token to verify check-in.");
      return;
    }

    setLoading(true);
    try {
      const verify = await verifyStationCheckIn({
        ticketId,
        ...(otpCode ? { otpCode } : {}),
        ...(qrToken ? { qrToken } : {})
      });
      setCheckInStatusText(`Check-in verified at ${new Date(verify.verifiedAt).toLocaleTimeString()}.`);
    } catch (error) {
      logReservationError("verifyCheckInNow", error);
      setCheckInStatusText(error?.response?.data?.message || "Failed to verify check-in.");
    } finally {
      setLoading(false);
    }
  }, [checkInOtpInput, checkInQrInput, myTicket, reservationId]);

  const getStatusStyle = () => {
    if (detail.fuelStatus === "Full") return styles.statusFull;
    if (detail.fuelStatus === "Partial") return styles.statusPartial;
    return styles.statusEmpty;
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.stationName}>{detail.name}</Text>
        <Text style={styles.metaText}>Address: {detail.address}</Text>
        <Text style={styles.metaText}>Contact: {detail.contact}</Text>
        <Text style={styles.metaText}>Station ID: {stationId || "N/A"}</Text>
        <Text style={styles.metaText}>
          Coordinates: {Number.isFinite(detail.latitude) ? detail.latitude.toFixed(6) : "-"},{" "}
          {Number.isFinite(detail.longitude) ? detail.longitude.toFixed(6) : "-"}
        </Text>
        <Text style={styles.metaText}>Supported fuels: {detail.supportedFuels}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Fuel Status</Text>
        <Text style={[styles.statusValue, getStatusStyle()]}>{detail.fuelStatus}</Text>
        <Text style={styles.sectionTitle}>Queue & Wait</Text>
        <Text style={styles.metaText}>Queue Length: {detail.queueLength} cars</Text>
        <Text style={styles.metaText}>Estimated Wait: {detail.waitTime} min</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Queue Reservation & Payment</Text>
        {!queueEnabled ? (
          <Text style={styles.errorText}>
            This station lacks a valid backend ObjectId. Update station data before queueing.
          </Text>
        ) : null}

        <Text style={styles.metaText}>Requested Band</Text>
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

        <Text style={styles.metaText}>Fuel Type</Text>
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
        <Text style={styles.metaText}>How Many Liters</Text>
        <TextInput
          style={styles.input}
          value={requestedLiters}
          onChangeText={setRequestedLiters}
          keyboardType="numeric"
          placeholder="Enter liters (e.g. 25)"
          placeholderTextColor="#94A3B8"
        />
        <Text style={styles.metaText}>Current Price ({fuelType}): {selectedUnitPrice.toFixed(2)} ETB/L</Text>
        <Text style={styles.estimateText}>Estimated Total: {estimatedAmount.toFixed(2)} ETB</Text>

        <Pressable
          style={[styles.actionButton, styles.primaryButton, (!queueEnabled || loading) && styles.disabled]}
          onPress={reserveAndInitiate}
          disabled={!queueEnabled || loading}
        >
          <Text style={styles.primaryButtonText}>Reserve & Pay with Telebirr</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.secondaryButton, loading && styles.disabled]}
          onPress={checkReservationNow}
          disabled={loading || !reservationId}
        >
          <Text style={styles.secondaryButtonText}>Check Payment Status</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.infoButton, loading && styles.disabled]}
          onPress={refreshMyTicket}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>Refresh My Ticket</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.dangerButton, loading && styles.disabled]}
          onPress={leaveMyQueue}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>Leave Queue</Text>
        </Pressable>

        {loading ? <ActivityIndicator size="small" color="#0F766E" style={styles.loader} /> : null}
        <Text style={styles.metaText}>phase: {paymentPhase}</Text>
        <Text style={styles.metaText}>reservationId: {reservationId || "-"}</Text>
        <Text style={styles.metaText}>prepayId: {prepayId || "-"}</Text>
        <Text style={styles.metaText}>rawRequest: {rawRequest || "-"}</Text>
        {message ? <Text style={styles.infoText}>{message}</Text> : null}

        {myTicket ? (
          <View style={styles.ticketCard}>
            <Text style={styles.ticketTitle}>My Active Ticket</Text>
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
        <Text style={styles.sectionTitle}>Station Check-In (QR + OTP)</Text>
        <Text style={styles.metaText}>
          Start check-in when you are physically at the station, then share OTP/QR proof with attendant.
        </Text>

        <Pressable
          style={[styles.actionButton, styles.primaryButton, loading && styles.disabled]}
          onPress={startCheckInNow}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>Start Check-In</Text>
        </Pressable>

        <Text style={styles.metaText}>OTP From Session</Text>
        <View style={styles.readonlyBox}>
          <Text style={styles.readonlyText}>{checkInSession?.otpCode || "-"}</Text>
        </View>

        <Text style={styles.metaText}>QR Token (copy/share or scan in staff app)</Text>
        <TextInput
          style={styles.input}
          value={checkInQrInput}
          onChangeText={setCheckInQrInput}
          placeholder="QR token"
          placeholderTextColor="#94A3B8"
          multiline
        />

        <Text style={styles.metaText}>Verify With OTP</Text>
        <TextInput
          style={styles.input}
          value={checkInOtpInput}
          onChangeText={setCheckInOtpInput}
          placeholder="Enter 6-digit OTP"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
        />

        <Pressable
          style={[styles.actionButton, styles.secondaryButton, loading && styles.disabled]}
          onPress={verifyCheckInNow}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>Verify Check-In</Text>
        </Pressable>

        {checkInStatusText ? <Text style={styles.infoText}>{checkInStatusText}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>User Reports / Latest Updates</Text>
        {detail.reports.length ? detail.reports.map((report) => (
          <View key={report.id} style={styles.listItem}>
            <Text style={styles.listTitle}>{report.text}</Text>
            <Text style={styles.listSub}>{report.time}</Text>
          </View>
        )) : <Text style={styles.metaText}>No live reports for this station yet.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
        <Text style={styles.ratingHeadline}>Average Rating: {detail.avgRating || "-"}/5</Text>
        {detail.reviews.length ? detail.reviews.map((review) => (
          <View key={review.id} style={styles.listItem}>
            <Text style={styles.listTitle}>
              {review.user} ({review.rating}/5)
            </Text>
            <Text style={styles.listSub}>{review.text}</Text>
          </View>
        )) : <Text style={styles.metaText}>No live reviews for this station yet.</Text>}
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
