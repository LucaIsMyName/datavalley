import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from '../locales/de/common.json'
import deDocs from '../locales/de/docs.json'
import en from '../locales/en/common.json'
import enDocs from '../locales/en/docs.json'

// Screen readers and hyphenation pick their language from <html lang>, so it follows the UI language.
i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
})

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en, docs: enDocs },
    de: { common: de, docs: deDocs },
  },
  lng: localStorage.getItem('locale') ?? 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export { i18n }
