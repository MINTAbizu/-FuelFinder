// src/component/screens/StationDetails.jsx
import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity, Alert } from "react-native";
import { Card, Button } from "react-native-paper";
// import { Ionicons } from "@expo/vector-icons";

// Dummy data for demonstration
const station = {
  id: 1,
  name: "Addis Fuel Station",
  address: "123 Main St, Addis Ababa",
  contact: "+251 911 234 567",
  fuelStatus: "Partial", // Full / Partial / Empty
  queueLength: 7,
  estimatedWait: "15 mins",
  rating: 4.2,
  reviews: [
    { id: 1, user: "Mikael", comment: "Queue was short, fuel available!", stars: 5 },
    { id: 2, user: "Sara", comment: "Partial fuel, had to wait 10 mins.", stars: 3 },
  ],
  userReports: [
    { id: 1, report: "Fuel running low", time: "5 mins ago" },
    { id: 2, report: "Queue short", time: "15 mins ago" },
  ],
};

export default function StationDetails({ navigation }) {
  const [fuelStatus, setFuelStatus] = useState(station.fuelStatus);
  const [queueLength, setQueueLength] = useState(station.queueLength);

  const handleReport = () => {
    Alert.alert("Report", "Open modal to report queue/fuel status");
  };

  const handleSetAlert = () => {
    Alert.alert("Set Alert", "You will be notified when fuel is restocked!");
  };

  // Render user reports
  const renderReport = ({ item }) => (
    <Card style={styles.reportCard}>
      <Card.Content>
        <Text>{item.report}</Text>
        <Text style={styles.reportTime}>{item.time}</Text>
      </Card.Content>
    </Card>
  );

  // Render reviews
  const renderReview = ({ item }) => (
    <Card style={styles.reviewCard}>
      <Card.Content>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewUser}>{item.user}</Text>
          <View style={styles.stars}>
            {/* {Array.from({ length: 5 }).map((_, i) => (
            //   <View
            //     key={i}
            //     name={i < item.stars ? "star" : "star-outline"}
            //     size={16}
            //     color="#FFD700"
            //   />
            ))} */}
          </View>
        </View>
        <Text>{item.comment}</Text>
      </Card.Content>
    </Card>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Station Info */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.name}>{station.name}</Text>
          <Text>{station.address}</Text>
          <Text>Contact: {station.contact}</Text>
        </Card.Content>
      </Card>

      {/* Fuel & Queue Status */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Fuel Status</Text>
          <Text style={[styles.status, fuelStatus === "Full" ? styles.full : fuelStatus === "Partial" ? styles.partial : styles.empty]}>
            {fuelStatus}
          </Text>

          <Text style={styles.sectionTitle}>Queue Info</Text>
          <Text>{queueLength} cars waiting</Text>
          <Text>Estimated wait: {station.estimatedWait}</Text>
        </Card.Content>
      </Card>

      {/* User Reports */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>User Reports</Text>
          <FlatList
            data={station.userReports}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderReport}
            scrollEnabled={false}
          />
        </Card.Content>
      </Card>

      {/* Ratings & Reviews */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Rating & Reviews</Text>
          <FlatList
            data={station.reviews}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderReview}
            scrollEnabled={false}
          />
        </Card.Content>
      </Card>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button mode="contained" onPress={handleReport} style={styles.button}>
          Report Queue / Fuel Status
        </Button>
        <Button mode="outlined" onPress={handleSetAlert} style={styles.button}>
          Set Alert
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 10 },
  card: { marginVertical: 5, borderRadius: 10 },
  name: { fontSize: 20, fontWeight: "bold" },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginVertical: 5 },
  status: { fontSize: 16, fontWeight: "bold", marginBottom: 5 },
  full: { color: "green" },
  partial: { color: "orange" },
  empty: { color: "red" },
  reportCard: { marginVertical: 3, borderRadius: 8, padding: 5 },
  reviewCard: { marginVertical: 3, borderRadius: 8, padding: 5 },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  reviewUser: { fontWeight: "bold" },
  stars: { flexDirection: "row" },
  reportTime: { fontSize: 12, color: "#888" },
  buttonContainer: { flexDirection: "row", justifyContent: "space-around", marginVertical: 15 },
  button: { flex: 0.45 },
});