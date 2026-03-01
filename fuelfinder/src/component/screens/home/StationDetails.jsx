import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const statusMap = {
  available: "Full",
  limited: "Partial",
  empty: "Empty",
};

const fallbackReports = [
  { id: "r1", text: "Queue moving normally", time: "12 min ago" },
  { id: "r2", text: "Diesel available", time: "34 min ago" },
];

const fallbackReviews = [
  { id: "v1", user: "Mikael", rating: 5, text: "Fast service and clean station." },
  { id: "v2", user: "Sara", rating: 4, text: "Good availability, line was moderate." },
];

const getWaitEstimate = (queueLength) => Math.max(2, Number(queueLength || 0) * 3);

export default function StationDetails({ route }) {
  const { station } = route.params || {};

  const detail = useMemo(() => {
    const queue = Number(station?.queue_length || 0);
    const fuelStatus = statusMap[station?.fuel_status] || "Partial";
    return {
      name: station?.name || "Fuel Station",
      address: station?.address || "Addis Ababa, Ethiopia",
      contact: station?.contact || "+251 900 000 000",
      fuelStatus,
      queueLength: queue,
      waitTime: getWaitEstimate(queue),
      reports: station?.reports?.length ? station.reports : fallbackReports,
      reviews: station?.reviews?.length ? station.reviews : fallbackReviews,
      avgRating:
        station?.reviews?.length
          ? (
              station.reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) /
              station.reviews.length
            ).toFixed(1)
          : "4.5",
    };
  }, [station]);

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
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Fuel Status</Text>
        <Text style={[styles.statusValue, getStatusStyle()]}>{detail.fuelStatus}</Text>
        <Text style={styles.sectionTitle}>Queue & Wait</Text>
        <Text style={styles.metaText}>Queue Length: {detail.queueLength} cars</Text>
        <Text style={styles.metaText}>Estimated Wait: {detail.waitTime} min</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>User Reports / Latest Updates</Text>
        {detail.reports.map((report) => (
          <View key={report.id} style={styles.listItem}>
            <Text style={styles.listTitle}>{report.text}</Text>
            <Text style={styles.listSub}>{report.time}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
        <Text style={styles.ratingHeadline}>Average Rating: {detail.avgRating}/5</Text>
        {detail.reviews.map((review) => (
          <View key={review.id} style={styles.listItem}>
            <Text style={styles.listTitle}>
              {review.user} ({review.rating}/5)
            </Text>
            <Text style={styles.listSub}>{review.text}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.actionButton, styles.primaryButton]}
        onPress={() => Alert.alert("Report", "Open report form for queue/fuel status.")}
      >
        <Text style={styles.primaryButtonText}>Report Queue / Fuel Status</Text>
      </Pressable>

      <Pressable
        style={[styles.actionButton, styles.secondaryButton]}
        onPress={() => Alert.alert("Alert Set", "You will be notified for status changes.")}
      >
        <Text style={styles.secondaryButtonText}>Set Alert</Text>
      </Pressable>

      <Pressable
        style={[styles.actionButton, styles.premiumButton]}
        onPress={() => Alert.alert("Premium", "Pre-book fuel slot is a premium feature.")}
      >
        <Text style={styles.primaryButtonText}>Pre-book Fuel Slot (Premium)</Text>
      </Pressable>
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
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  primaryButton: { backgroundColor: "#0F766E" },
  secondaryButton: { backgroundColor: "#DBEAFE", borderWidth: 1, borderColor: "#1D4ED8" },
  premiumButton: { backgroundColor: "#7C3AED" },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  secondaryButtonText: { color: "#1D4ED8", fontSize: 13, fontWeight: "800" },
});
