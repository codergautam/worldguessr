export interface OnboardingLocation {
  lat: number;
  long: number;
  heading: number;
  pitch?: number;
  country: string;
  otherOptions: string[];
  /** Shown on the result banner during onboarding — same copy the web uses. */
  fact: string;
}

// Mirrors components/home.js:879-881 — three universally recognizable spots.
// The `fact` strings are the exact `onboardingFact1-3` translations from
// public/locales/en/common.json so mobile and web stay in sync.
export const ONBOARDING_LOCATIONS: OnboardingLocation[] = [
  {
    lat: 29.9773337,
    long: 31.1321796,
    heading: 223,
    pitch: 5,
    country: 'EG',
    otherOptions: ['TR', 'BR', 'IN'],
    fact: "These are the Pyramids of Giza in Egypt! They're over 4,500 years old.",
  },
  {
    lat: 40.7566514,
    long: -73.986534,
    heading: 31,
    country: 'US',
    otherOptions: ['GB', 'JP', 'AU'],
    fact: 'This is Times Square in New York City! About 50 million people visit every year.',
  },
  {
    lat: 48.8583601,
    long: 2.2915727,
    heading: 41,
    country: 'FR',
    otherOptions: ['IT', 'ES', 'DE'],
    fact: "This is the Eiffel Tower in Paris, France! It was built in 1889 for the World's Fair.",
  },
];
