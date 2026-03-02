import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "fuelfinder_language";

const STRINGS = {
  en: {
    loadingSession: "Loading session...",
    comingSoon: "Coming soon",
    profile: "Profile",
    name: "Name",
    email: "Email",
    logout: "Logout",
    switchToAm: "Switch to Amharic",
    switchToEn: "Switch to English",
    home: "Home",
    map: "Map",
    alerts: "Alerts",
    stationDetails: "Station Details",
  },
  am: {
    loadingSession: "\u1218\u130d\u1262\u12eb \u1260\u1218\u132b\u1295 \u120b\u12ed...",
    comingSoon: "\u1260\u1245\u122d\u1265 \u1240\u1295",
    profile: "\u1218\u1208\u12eb",
    name: "\u1235\u121d",
    email: "\u12a2\u121c\u12ed\u120d",
    logout: "\u12cd\u1323",
    switchToAm: "\u12c8\u12f0 \u12a0\u121b\u122d\u129b \u1240\u12ed\u122d",
    switchToEn: "Switch to English",
    home: "\u1218\u1290\u123b",
    map: "\u12ab\u122d\u1273",
    alerts: "\u121b\u1233\u12c8\u1242\u12eb",
    stationDetails: "\u12e8\u121b\u12f0\u12eb \u12dd\u122d\u12dd\u122d",
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("am");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && (saved === "en" || saved === "am")) {
          setLanguage(saved);
        }
      } finally {
        if (mounted) setIsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const changeLanguage = async (next) => {
    if (next !== "en" && next !== "am") return;
    setLanguage(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const toggleLanguage = async () => {
    const next = language === "am" ? "en" : "am";
    await changeLanguage(next);
  };

  const t = (key) => STRINGS[language]?.[key] || STRINGS.en[key] || key;

  const value = useMemo(
    () => ({ language, isReady, changeLanguage, toggleLanguage, t }),
    [language, isReady]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }
  return ctx;
}
