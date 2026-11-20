// Capitals quiz landing URL. Home seeds the singleplayer screen with the mode
// before first paint (same path as /flags and /countries).
import Home from '@/components/home';

export default function CapitalsPage() {
  return <Home initialScreen="capitals" />;
}
