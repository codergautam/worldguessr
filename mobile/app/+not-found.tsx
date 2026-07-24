import { Redirect } from 'expo-router';

// Catch-all: iOS applinks cover the whole worldguessr.com domain, so any web
// path without a matching app route lands here. Never strand the user on the
// Unmatched Route screen — route through "/" (app/index.tsx), which owns the
// onboarding-vs-home decision.
export default function NotFound() {
  return <Redirect href="/" />;
}
