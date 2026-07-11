// No-op replacement for components/utils/audio.js inside the standalone embed.
//
// The WebView must NOT carry the Web Audio engine: it would play sounds
// governed by the WebView's own private localStorage volumes that the app's
// native sound settings can never reach. Map interactions that want SFX (pin
// placement) are surfaced to React Native over the bridge and played by the
// native sound service instead.
//
// Mirrors the real module's full export surface so any future embed-side
// import keeps building without touching this file.

export function subscribeVolumes() {
  return () => {};
}
export function preloadSfx() {}
export function playSfx() {}
export function stopSfx() {}
export function getSfxVolume() {
  return 0;
}
export function setSfxVolume() {}
export function attachUiClickSounds() {
  return () => {};
}
export function setMusicAllowed() {}
export function startMusic() {}
export function setMusicPlaylist() {}
export function stopMusic() {}
export function getMusicVolume() {
  return 0;
}
export function setMusicVolume() {}
export function duckAudio() {}
