import React from "react";
import HomeScreen from "./HomeScreen";

const ELECTRIC_HOME_CONFIG = {
  stationType: "electric",
  defaultBrowseMode: "nationwide",
  nearbyRadiusMeters: 250000,
  showTypeFilter: false,
  browseModeOptions: [
    { id: "nationwide", label: "All chargers" },
    { id: "nearby", label: "Nearby chargers" },
  ],
  title: "FuelFinder EV",
  subtitle: "Discover charging stations, check charger readiness, and route to the best stop for your EV.",
  discoverySectionTitle: "Explore the charging network",
  searchPlaceholderNearby: "Search nearby charger",
  searchPlaceholderNationwide: "Search charger network",
  statusSectionTitle: "Charger availability",
  sortSectionTitle: "Sort chargers",
  countLabel: "chargers found",
  emptyTitle: "No charging stations found",
  emptySub: "Reload the charger network or switch to nearby chargers to try again.",
  queueMetricLabel: "Queued EVs",
  queueUnitLabel: "EVs",
  waitMetricLabel: "Charge wait",
  addressLabel: "Charging site",
  topPickLabel: "Best EV stop",
  routeShowLabel: "Get route",
  routeShownLabel: "Route ready",
  centerNearbyLabel: "Center on my location",
  centerNationwideLabel: "Center charger network",
  reloadNearbyLabel: "Reload nearby chargers",
  reloadNationwideLabel: "Reload all chargers",
  noNationwideStationsMessage: "No electric charging stations are stored yet.",
  heroEyebrow: "Electric mobility",
  heroTitle: "Find the right charger before you drive",
  heroBody:
    "Start with the full EV network, then switch to nearby chargers when you want the closest working stop.",
  heroHighlights: ["Nationwide EV view", "Nearby chargers", "Route-ready map"],
  statusLabels: {
    all: "All chargers",
    available: "Ready",
    limited: "Busy",
    empty: "Offline",
  },
};

export default function ElectricHomeScreen(props) {
  return <HomeScreen {...props} homeConfig={ELECTRIC_HOME_CONFIG} />;
}
