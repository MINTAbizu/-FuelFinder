import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

import en from "./locales/en.json";
import am from "./locales/am.json";
import om from "./locales/om.json";
import ti from "./locales/ti.json";
import so from "./locales/so.json";
import aa from "./locales/aa.json";
import sid from "./locales/sid.json";
import wal from "./locales/wal.json";
import hdy from "./locales/hdy.json";
import har from "./locales/har.json";
import stv from "./locales/stv.json";
import kbr from "./locales/kbr.json";
import gez from "./locales/gez.json";

import { DEFAULT_LANGUAGE, isSupportedLanguage, normalizeLanguageTag } from "./supportedLanguages";

const resources = {
  en: { translation: en },
  am: { translation: am },
  om: { translation: om },
  ti: { translation: ti },
  so: { translation: so },
  aa: { translation: aa },
  sid: { translation: sid },
  wal: { translation: wal },
  hdy: { translation: hdy },
  har: { translation: har },
  stv: { translation: stv },
  kbr: { translation: kbr },
  gez: { translation: gez },
};

export function getDeviceLanguage() {
  const tag = Localization.locale || "";
  const base = normalizeLanguageTag(tag);
  if (isSupportedLanguage(base)) return base;
  return DEFAULT_LANGUAGE;
}

let initPromise = null;

export async function initI18n(language) {
  if (i18n.isInitialized) {
    if (language && i18n.language !== language) {
      await i18n.changeLanguage(language);
    }
    return i18n;
  }

  if (!initPromise) {
    initPromise = i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: language || DEFAULT_LANGUAGE,
        fallbackLng: DEFAULT_LANGUAGE,
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
      });
  }

  await initPromise;
  if (language && i18n.language !== language) {
    await i18n.changeLanguage(language);
  }
  return i18n;
}

export default i18n;
