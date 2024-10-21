export default function make6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000);
}