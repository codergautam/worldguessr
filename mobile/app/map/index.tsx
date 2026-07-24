import { Redirect, useLocalSearchParams } from 'expo-router';

// Old query-style map links (web pages/map.js contract): /map?s=<slug> or
// /map?slug=<slug>. The app claims the bare /map path in its intent filters,
// so these must resolve to the canonical /map/<slug> route instead of
// stranding on Unmatched Route. A slugless /map goes home (web redirects too).
export default function MapQueryLink() {
  const params = useLocalSearchParams<{ s?: string; slug?: string }>();
  const s = Array.isArray(params.s) ? params.s[0] : params.s;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const resolved = s || slug;
  return resolved ? <Redirect href={`/map/${resolved}`} /> : <Redirect href="/" />;
}
