const fs = require('fs');
const path = require('path');

const langs = ["en","fr","de","ru","es"];
const paths = langs.map(lang => path.join(__dirname, `./public/locales/${lang}/common.json`));
const jsons = paths.map(path => JSON.parse(fs.readFileSync(path)));


const keys = [];
jsons.forEach(json => {
  const jsonKeys = Object.keys(json);
  keys.push(...jsonKeys);
});

const uniqueKeys = new Set(keys);
const missingKeys = [];
uniqueKeys.forEach(key => {
  const missingInLangs = langs.filter((lang, index) => !jsons[index][key]);
  if (missingInLangs.length > 0) {
    missingKeys.push({ key, missingInLangs });
  }
});

if (missingKeys.length > 0) {
  console.log('Missing translations:\n');
  missingKeys.forEach(({ key, missingInLangs }) => {
    console.log("'"+key+"'", missingInLangs,'exists in',langs.filter((lang, index) => jsons[index][key]));
  });
} else {
  console.log('All translations are present.');
}