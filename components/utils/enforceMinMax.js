export default function enforceMinMax(el, callback) {
  if (el.value !== "") {
    const value = parseInt(el.value);
    const min = parseInt(el.min);
    const max = parseInt(el.max);

    if (isNaN(value)) {
      el.value = min;
    } else if (value < min) {
      el.value = min;
    } else if (value > max) {
      el.value = max;
    } else {
      el.value = Math.floor(value);
    }
  }
  callback();
}