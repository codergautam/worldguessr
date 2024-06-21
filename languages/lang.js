import english from './english.json';
import * as lg from '@ladjs/country-language';

const langs = {
  "EN": english,
}

export default function text(key, ...params) {
  // get my language
  const lang = navigator.language || navigator.userLanguage;
  console.log(lang);
}