export const DEFAULT_LANGUAGE = "en";

// This list is used for UI + validation. Add more Ethiopian languages here as you expand translations.
export const SUPPORTED_LANGUAGES = [
  { code: "am", nativeName: "አማርኛ", englishName: "Amharic" },
  { code: "om", nativeName: "Afaan Oromoo", englishName: "Oromo" },
  { code: "ti", nativeName: "ትግርኛ", englishName: "Tigrinya" },
  { code: "so", nativeName: "Soomaali", englishName: "Somali" },
  { code: "aa", nativeName: "Qafaraf", englishName: "Afar" },
  { code: "sid", nativeName: "Sidaamu Afo", englishName: "Sidama" },
  { code: "wal", nativeName: "Wolayttatto", englishName: "Wolaytta" },
  { code: "hdy", nativeName: "Hadiyisa", englishName: "Hadiyya" },
  { code: "har", nativeName: "Gey Sinan", englishName: "Harari" },
  { code: "stv", nativeName: "Siltʼe", englishName: "Silt'e" },
  { code: "kbr", nativeName: "Kafinoonoo", englishName: "Kafa" },
  { code: "gez", nativeName: "ግዕዝ", englishName: "Ge'ez" },
  { code: "en", nativeName: "English", englishName: "English" },
];

const SUPPORTED_SET = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

export function isSupportedLanguage(code) {
  if (!code) return false;
  return SUPPORTED_SET.has(String(code).toLowerCase());
}

export function normalizeLanguageTag(tag) {
  if (!tag) return "";
  const raw = String(tag).toLowerCase();
  // "en-US" -> "en", "am_ET" -> "am"
  const base = raw.split("-")[0].split("_")[0];
  return base;
}

export function getLanguageLabel(code) {
  const c = String(code || "").toLowerCase();
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === c);
  if (found) return found.nativeName;
  return c || DEFAULT_LANGUAGE;
}
