// Google Translate likes to mangle i18next placeholders ({{name}}) — it can
// translate them, drop the braces, or insert spaces. Mask them with a token
// that survives translation across language pairs, then restore after.
//
// Pure and side-effect free so test/checkTranslations.test.js can pin the
// safety properties without executing the interactive script.
const PH_TOKEN_RE = /xphx(\d+)xphx/gi;

function maskPlaceholders(text) {
  const placeholders = [];
  const masked = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, name) => {
    const idx = placeholders.length;
    placeholders.push(name.trim());
    return `xphx${idx}xphx`;
  });
  return { masked, placeholders };
}

function unmaskPlaceholders(text, placeholders) {
  const seen = Array(placeholders.length).fill(0);
  let unexpectedToken = false;
  const out = text.replace(PH_TOKEN_RE, (m, idx) => {
    const i = Number(idx);
    if (!Number.isInteger(i) || i < 0 || i >= placeholders.length) {
      unexpectedToken = true;
      return m;
    }
    seen[i]++;
    return `{{${placeholders[i]}}}`;
  });
  // Count every placeholder token exactly once. Merely comparing the total is
  // unsafe: a translator can duplicate xphx0xphx and drop xphx1xphx, which
  // previously passed while silently replacing the wrong runtime variable.
  const ok =
    !unexpectedToken &&
    seen.every(count => count === 1) &&
    !PH_TOKEN_RE.test(out);
  PH_TOKEN_RE.lastIndex = 0;
  return { out, ok };
}

module.exports = { maskPlaceholders, unmaskPlaceholders };
