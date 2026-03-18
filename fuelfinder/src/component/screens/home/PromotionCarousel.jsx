import React, { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Carousel from "react-native-reanimated-carousel";
import { Ionicons } from "@expo/vector-icons";

function formatSchedule(item, fallbackText) {
  if (item?.endsAt) {
    const endsAt = new Date(item.endsAt);
    if (!Number.isNaN(endsAt.getTime())) {
      return `${fallbackText} ${endsAt.toLocaleDateString()}`;
    }
  }
  return item?.stationName || "";
}

export default function PromotionCarousel({
  promotions,
  activeIndex,
  onSnapToItem,
  onPressPromotion,
  texts
}) {
  const { width } = useWindowDimensions();
  const cardWidth = useMemo(() => Math.max(300, width - 24), [width]);

  if (!Array.isArray(promotions) || !promotions.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{texts.eyebrow}</Text>
          <Text style={styles.title}>{texts.title}</Text>
          <Text style={styles.subtitle}>{texts.subtitle}</Text>
        </View>
        <View style={styles.counterWrap}>
          <Text style={styles.counterText}>
            {activeIndex + 1}/{promotions.length}
          </Text>
        </View>
      </View>

      <Carousel
        autoPlay={promotions.length > 1}
        autoPlayInterval={4800}
        data={promotions}
        height={208}
        loop={promotions.length > 1}
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.92,
          parallaxScrollingOffset: 54
        }}
        onSnapToItem={onSnapToItem}
        pagingEnabled
        renderItem={({ item }) => {
          const isVideo = item.mediaType === "video";
          const buttonLabel = item.ctaLabel || (isVideo ? texts.watchVideo : texts.viewStation);
          const schedule = formatSchedule(item, texts.endsLabel);

          return (
            <Pressable onPress={() => onPressPromotion(item)} style={[styles.card, { width: cardWidth }]}>
              <View style={styles.mediaWrap}>
                {item.previewUrl ? (
                  <Image source={{ uri: item.previewUrl }} style={styles.media} />
                ) : (
                  <View style={styles.placeholderMedia}>
                    <Ionicons
                      color="#E2E8F0"
                      name={isVideo ? "videocam" : "image"}
                      size={34}
                    />
                  </View>
                )}
                <View style={styles.mediaShade} />
                <View style={styles.mediaTopRow}>
                  <View style={styles.stationChip}>
                    <Ionicons color="#E2E8F0" name="location" size={12} />
                    <Text numberOfLines={1} style={styles.stationChipText}>
                      {item.stationName || texts.stationFallback}
                    </Text>
                  </View>
                  {isVideo ? (
                    <View style={styles.videoBadge}>
                      <Ionicons color="#082F49" name="play" size={11} />
                      <Text style={styles.videoBadgeText}>{texts.videoLabel}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.body}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text numberOfLines={2} style={styles.cardDescription}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.footerRow}>
                  <Text numberOfLines={1} style={styles.metaText}>
                    {schedule}
                  </Text>
                  <View style={styles.ctaPill}>
                    <Text style={styles.ctaText}>{buttonLabel}</Text>
                    <Ionicons color="#0F172A" name="arrow-forward" size={14} />
                  </View>
                </View>
              </View>
            </Pressable>
          );
        }}
        scrollAnimationDuration={900}
        snapEnabled
        width={cardWidth}
      />

      <View style={styles.dotsRow}>
        {promotions.map((item, index) => (
          <View
            key={String(item.id || index)}
            style={[styles.dot, index === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
    marginBottom: 10
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  eyebrow: {
    color: "#C2410C",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4
  },
  title: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900"
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4
  },
  counterWrap: {
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  counterText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "900"
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#1E293B"
  },
  mediaWrap: {
    height: 118,
    position: "relative",
    backgroundColor: "#172554"
  },
  media: {
    width: "100%",
    height: "100%"
  },
  placeholderMedia: {
    flex: 1,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center"
  },
  mediaShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.24)"
  },
  mediaTopRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  stationChip: {
    maxWidth: "72%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.65)"
  },
  stationChipText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "800"
  },
  videoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FDE68A"
  },
  videoBadgeText: {
    color: "#082F49",
    fontSize: 10,
    fontWeight: "900"
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: "#F8FAFC"
  },
  cardTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900"
  },
  cardDescription: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 6
  },
  footerRow: {
    marginTop: "auto",
    paddingTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  metaText: {
    flex: 1,
    color: "#334155",
    fontSize: 11,
    fontWeight: "800"
  },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FDBA74",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  ctaText: {
    color: "#0F172A",
    fontSize: 11,
    fontWeight: "900"
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 10
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#CBD5E1"
  },
  dotActive: {
    width: 24,
    backgroundColor: "#0F766E"
  }
});
