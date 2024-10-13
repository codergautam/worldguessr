import en from '../public/locales/en/common.json';
import es from '../public/locales/es/common.json';
import fr from '../public/locales/fr/common.json';
import de from '../public/locales/de/common.json';
import ru from '../public/locales/ru/common.json';
import { useRouter } from 'next/router';

export function useTranslation() {
  const router = useRouter();
  return {t: (key, vars) => {



    let language = "en";

    // if /ru or /es or /fr or /de, ignore query params in url
      let path = router.asPath;
      if(path.includes("/ru")) {
        language = "ru";
      } else if(path.includes("/es")) {
        language = "es";
      } else if(path.includes("/fr")) {
        language = "fr";
      } else if(path.includes("/de")) {
        language = "de";
      }

    let langObj = language === "en" ? en : language === "es" ? es : language === "fr" ? fr : language === "de" ? de : language === "ru" ? ru : en;
    let string = langObj[key];
    if(!string) {
      return en[key] || key;
    }

    // {{variable}}
    // vars => {variable: "value"}
    if(vars) {
      for(let v in vars) {
        string = string.replace(`{{${v}}}`, vars[v]);
      }
    }

    return string;


  }}
}