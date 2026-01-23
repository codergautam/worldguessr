export default function formatNumber(number, identifyingDigits) {
  if(!number || isNaN(number)) {
    return '0';
  }
  if(!identifyingDigits) identifyingDigits = 2;
  const units = ['K', 'M', 'B', 'T'];
  if (number < 1000) return number.toString();

  const tier = Math.log10(number) / 3 | 0;
  const suffix = units[tier - 1];
  const scale = Math.pow(10, tier * 3);
  const scaledNumber = number / scale;

  // Calculate significant digits by fixing the decimal places to (identifyingDigits - 1)
  const precision = Math.max(0, Math.min(100, identifyingDigits - Math.floor(Math.log10(scaledNumber)) - 1));

  let formattedNumber = scaledNumber.toFixed(precision);

  // Remove trailing zeroes after decimal point (e.g., "1.50" → "1.5", "2.00" → "2")
  formattedNumber = formattedNumber.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

  return `${formattedNumber}${suffix}`;
}