import { useState, useEffect } from 'react';
import en from '../public/locales/en/common.json';
import es from '../public/locales/es/common.json';
import fr from '../public/locales/fr/common.json';
import de from '../public/locales/de/common.json';
import ru from '../public/locales/ru/common.json';
import { useRouter } from 'next/router';
import { stripBase } from '@/lib/basePath';

const langs = ["en", "es", "fr", "de", "ru"];
const langMap = { en, es, fr, de, ru };

export function getLangFromPath(path) {
  if(path.includes("/ru")) return "ru";
  if(path.includes("/es")) return "es";
  if(path.includes("/fr")) return "fr";
  if(path.includes("/de")) return "de";
  return null;
}

export function useTranslation() {
  const router = useRouter();

  const pathLang = getLangFromPath(stripBase(router.asPath));

  const [storedLang, setStoredLang] = useState(null);

  useEffect(() => {
    if(!pathLang) {
      try {
        const stored = window.localStorage.getItem("lang");
        if(stored && langs.includes(stored)) setStoredLang(stored);
      } catch(e) {}
    }
  }, [pathLang]);

  // URL path takes priority, then localStorage, then "en"
  const language = pathLang || storedLang || "en";

  return {
    lang: language,
    t: (key, vars) => {
      let string = langMap[language]?.[key];
      if(!string) {
        string = en[key] || key;
      }

      if(vars) {
        for(let v in vars) {
          string = string.replace(`{{${v}}}`, vars[v]);
        }
      }

      return string;
    }
  };
}