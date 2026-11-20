// Countries quiz landing URL. Home seeds the singleplayer screen with the mode
// before first paint (same path as /flags and /shapes).
import Home from '@/components/home';

export default function CountriesPage() {
  return <Home initialScreen="countries" />;
}
