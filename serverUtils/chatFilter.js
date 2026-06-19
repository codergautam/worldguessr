// Bad words filter for game chat
// Matches exact words, common letter substitutions, and partial obfuscations

const BAD_WORDS = [
  // English slurs and profanity
  'nigga', 'nigger', 'nigg3r', 'n1gger', 'n1gga', 'niga', 'niger',
  'faggot', 'fag', 'f4g', 'f4ggot',
  'retard', 'retarded',
  'kike',
  'chink',
  'spic', 'sp1c',
  'wetback',
  'coon',
  'tranny',
  // Common profanity
  'fuck', 'fuk', 'fck', 'f*ck', 'fucc', 'phuck', 'fuck you',
  'shit', 'sh1t', 'sht', 'sh!t',
  'bitch', 'b1tch', 'b!tch', 'biatch',
  'asshole', 'a$$hole', 'assh0le',
  'cunt', 'c*nt', 'cvnt',
  'dick', 'd1ck',
  'cock', 'c0ck',
  'pussy', 'pvssy', 'pu$$y',
  'whore', 'wh0re',
  'slut', 'sl*t',
  // Spanish
  'puta', 'puto', 'pendejo', 'pendeja', 'marica', 'maricón', 'maricon',
  'mierda', 'verga', 'chinga', 'pinche', 'cabron', 'cabrón', 'coño', 'cono',
  'negro de mierda', 'sudaca',
  // Portuguese
  'porra', 'caralho', 'viado', 'putinha',
  // French
  'putain', 'merde', 'enculé', 'encule', 'salope', 'connard', 'connasse',
  'nègre', 'negre',
  // German
  'scheiße', 'scheisse', 'hurensohn', 'fotze', 'wichser', 'arschloch',
  // Russian (transliterated)
  'suka', 'blyat', 'blyad', 'pidar', 'pidor', 'nahui', 'ebat',
  'mudak', 'gandon', 'huy',
  // Additional hate terms
  'nazi', 'hitler', 'heil',
  'kill yourself', 'kys',
];

// Build regex patterns that handle common substitutions
const SUBSTITUTIONS = {
  'a': '[a@4àáâãäå]',
  'e': '[e3èéêë€]',
  'i': '[i1!|ìíîï]',
  'o': '[o0òóôõö]',
  'u': '[uùúûü]',
  's': '[s$5]',
  'g': '[g9]',
  'l': '[l1|]',
  't': '[t7+]',
};

// Create regex-safe pattern from a word, replacing known chars with their substitution classes
function buildPattern(word) {
  let pattern = '';
  for (const ch of word.toLowerCase()) {
    if (SUBSTITUTIONS[ch]) {
      pattern += SUBSTITUTIONS[ch];
    } else if (/[.*+?^${}()|[\]\\]/.test(ch)) {
      pattern += '\\' + ch;
    } else {
      pattern += ch;
    }
  }
  return pattern;
}

// Pre-compile all patterns
const PATTERNS = BAD_WORDS.map(word => {
  const pattern = buildPattern(word);
  // For short words (<=3 chars), require word boundaries to avoid false positives
  if (word.length <= 3) {
    return new RegExp(`\\b${pattern}\\b`, 'i');
  }
  return new RegExp(pattern, 'i');
});

/**
 * Check if a message contains bad words.
 * Returns true if the message is clean, false if it contains bad words.
 */
export function isCleanMessage(message) {
  // Normalize: collapse repeated chars (e.g. "fuuuuck" -> "fuck")
  const normalized = message.replace(/(.)\1{2,}/g, '$1$1');

  for (const pattern of PATTERNS) {
    if (pattern.test(message) || pattern.test(normalized)) {
      return false;
    }
  }
  return true;
}

/**
 * Sanitize message - replace bad words with asterisks
 */
export function censorMessage(message) {
  let result = message;
  const normalized = message.replace(/(.)\1{2,}/g, '$1$1');

  for (let i = 0; i < PATTERNS.length; i++) {
    const pattern = PATTERNS[i];
    // Use global version for replacement
    const globalPattern = new RegExp(pattern.source, 'gi');
    result = result.replace(globalPattern, (match) => '*'.repeat(match.length));
  }
  return result;
}
