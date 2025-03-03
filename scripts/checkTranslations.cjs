const fs = require('fs');
const path = require('path');
const readline = require('readline');
const translate = require('google-translate-free');

const langs = ["en","fr","de","ru","es"];
const paths = langs.map(lang => path.join(__dirname, `../public/locales/${lang}/common.json`));
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
  let missingList = {};
  missingKeys.forEach(({ key, missingInLangs }) => {
    const val = jsons[langs.indexOf('en')][key];
    const inEn = langs.filter((lang, index) => jsons[index][key]).includes('en');
    console.log("'"+key+"'", missingInLangs,'exists in',langs.filter((lang, index) => jsons[index][key]),
     inEn ? val : 'not in en');

    if(inEn) {
      missingList[key] = {
        en: val,
        key: key,
        missingInLangs: missingInLangs
      }
    }
  });

  if(Object.keys(missingList).length > 0) {
    console.log(Object.keys(missingList).length, 'translations can be filled using AI translation');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Do you want to fill missing translations using Google Translate? (y/n): ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        console.log('Translating missing texts...');

        let changes = {
          translated: [],
          reordered: []
        };

        // Get master key order from English file
        const enJson = jsons[langs.indexOf('en')];
        const masterKeyOrder = Object.keys(enJson);

        // Process translations
        for (const key in missingList) {
          const { en, missingInLangs } = missingList[key];

          for (const lang of missingInLangs) {
            try {
              const result = await translate(en, { from: 'en', to: lang, client: 'gtx' });
              const translatedText = result.text;

              // Find index of this language
              const langIndex = langs.indexOf(lang);

              // Add translation
              jsons[langIndex][key] = translatedText;

              changes.translated.push({
                key,
                lang,
                text: translatedText
              });

              console.log(`Translated "${key}" to ${lang}: "${translatedText}"`);
            } catch (error) {
              console.error(`Error translating "${key}" to ${lang}:`, error.message);
            }
          }
        }

        // Reorder all language files to match English key order
        for (let i = 0; i < langs.length; i++) {
          if (langs[i] === 'en') continue; // Skip English

          const reorderedJson = {};
          let reordered = false;

          // First add keys that exist in English, in the same order
          for (const key of masterKeyOrder) {
            if (jsons[i][key]) {
              reorderedJson[key] = jsons[i][key];
            }
          }

          // Then add any remaining keys that only exist in this language
          for (const key in jsons[i]) {
            if (!masterKeyOrder.includes(key)) {
              reorderedJson[key] = jsons[i][key];
              reordered = true;
            }
          }

          if (reordered) {
            changes.reordered.push(langs[i]);
          }

          // Save the reordered file
          jsons[i] = reorderedJson;
        }

        // Write all changes back to files
        for (let i = 0; i < langs.length; i++) {
          fs.writeFileSync(paths[i], JSON.stringify(jsons[i], null, 2));
        }

        // Report changes
        console.log('\nChanges summary:');
        console.log(`- Added ${changes.translated.length} translations`);
        console.log(`- Reordered keys in ${changes.reordered.length} language files to match English order`);

      } else {
        console.log('Translation skipped.');
      }
      rl.close();
    });
  }
} else {
  console.log('All translations are present.');
}