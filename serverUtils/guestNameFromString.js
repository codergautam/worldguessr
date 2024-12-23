export default function guestNameString(input) {
  // if already in format Guest #[four digits], return as is
  if (input.match(/^Guest #[0-9]{4}$/)) {
    return input;
  }

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 10000; // Keep it within 4 digits
  }
  return 'Guest #'+hash.toString().padStart(4, '0'); // Ensure it is always 4 digits
}
