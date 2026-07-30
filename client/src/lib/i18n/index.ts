import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import uz from './locales/uz.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'uz', name: 'Uzbek', nativeName: "O'zbek" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

function isSupportedLanguage(value: unknown): value is LanguageCode {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += 1) {
    if (SUPPORTED_LANGUAGES[i].code === value) return true;
  }
  return false;
}

// Get saved language, otherwise default to Uzbek
const getSavedLanguage = (): LanguageCode => {
  try {
    const saved = localStorage.getItem('beneficial-knowledge-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      const savedLanguage = settings.state?.settings?.language;
      if (isSupportedLanguage(savedLanguage)) {
        return savedLanguage;
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return 'uz';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      uz: { translation: uz },
    },
    lng: getSavedLanguage(),
    fallbackLng: ['uz', 'en'],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export const changeLanguage = (lang: LanguageCode) => {
  i18n.changeLanguage(lang);
};

export default i18n;
