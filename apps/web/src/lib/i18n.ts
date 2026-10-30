import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from '../locales/de/common.json'
import en from '../locales/en/common.json'

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    de: { common: de },
  },
  lng: localStorage.getItem('locale') ?? 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export { i18n }
