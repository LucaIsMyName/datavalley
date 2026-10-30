import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from '../locales/de/common.json'
import deDocs from '../locales/de/docs.json'
import en from '../locales/en/common.json'
import enDocs from '../locales/en/docs.json'

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
