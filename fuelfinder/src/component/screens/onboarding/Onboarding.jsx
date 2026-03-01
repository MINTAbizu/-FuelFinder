import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity } from "react-native";

const { width } = Dimensions.get("window");

const slides = [
  { id: "1", title: "Find nearby fuel stations instantly." },
  { id: "2", title: "See queue lengths and fuel availability." },
  { id: "3", title: "Get instant alerts when stations restock." },
];

export default function Onboarding({ navigation }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const ref = useRef();

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      ref.current.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      navigation.replace("Home"); // Navigate to HomeScreen
    }
  };

  const handleSkip = () => {
    navigation.replace("Home");
  };

  const renderItem = ({ item }) => (
    <View style={[styles.slide, { width }]}>
      <Text style={styles.title}>{item.title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={ref}
        data={slides}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />

      {/* Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
          <Text style={styles.next}>{currentIndex === slides.length - 1 ? "Get Started" : "Next"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", justifyContent: "center" },
  slide: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center" },
  footer: { flexDirection: "row", justifyContent: "space-between", padding: 20 },
  skip: { fontSize: 16, color: "#888" },
  nextButton: { backgroundColor: "#FF6B00", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  next: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});