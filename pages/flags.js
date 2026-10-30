// Flags quiz landing URL. Home seeds the singleplayer screen with the mode
// before first paint (same path as /daily and /china).
import Home from '@/components/home';

export default function FlagsPage() {
  return <Home initialScreen="flags" />;
}
