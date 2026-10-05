import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enTrans from "@/translations/resources/en/translation.json";
import viTrans from "@/translations/resources/vi/translation.json";

const resources = {
  en: { translation: enTrans },
  vi: { translation: viTrans },
};

i18n
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    supportedLngs: ["en", "vi"],
    resources,
    fallbackLng: "vi",
    ns: ["translation"],
    defaultNS: "translation",
    // Mặc định tiếng Việt; chỉ đổi khi người dùng chọn (lưu localStorage)
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "lang",
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
