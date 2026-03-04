import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import i18n, { getDeviceLanguage, initI18n } from "../../i18n/i18n";
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "../../i18n/supportedLanguages";

const STORAGE_KEY = "fuelfinder_language";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = (await AsyncStorage.getItem(STORAGE_KEY)) || "";
        const startLang = isSupportedLanguage(saved) ? saved : getDeviceLanguage();
        await initI18n(startLang);
        if (mounted) setLanguage(startLang);
      } finally {
        if (mounted) setIsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const changeLanguage = async (next) => {
    if (!isSupportedLanguage(next)) return;
    setLanguage(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
    await i18n.changeLanguage(next);
  };

  const toggleLanguage = async () => {
    const order = SUPPORTED_LANGUAGES.map((l) => l.code);
    const idx = Math.max(0, order.indexOf(language));
    const next = order[(idx + 1) % order.length] || DEFAULT_LANGUAGE;
    await changeLanguage(next);
  };

  const t = (key, options) => i18n.t(key, options);

  const value = useMemo(
    () => ({
      language,
      isReady,
      supportedLanguages: SUPPORTED_LANGUAGES,
      changeLanguage,
      toggleLanguage,
      t,
    }),
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
