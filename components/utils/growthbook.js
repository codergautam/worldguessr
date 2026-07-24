// Lazy GrowthBook loader for the onboarding-flow A/B test. The SDK is
// dynamically imported so only brand-new users (onboarding undecided) pay the
// download + feature fetch; returning users never touch it. Any failure or a
// slow network (>2s) falls back to "modal" — old prod behavior — so the
// experiment can never strand a real user on a blank screen.
//
// Feature key: "onboarding-flow" (string) — "modal" = old mode-select overlay
// (control), "dropin" = straight into classic round 1 (treatment). Exposure
// events reach GA4 via thirdPartyTrackingPlugin (gtag stub queues pre-load).
let variantPromise = null;

export default function resolveOnboardingVariant() {
    if (!variantPromise) {
        variantPromise = (async () => {
            const [{ GrowthBook }, { autoAttributesPlugin, thirdPartyTrackingPlugin }] = await Promise.all([
                import("@growthbook/growthbook"),
                import("@growthbook/growthbook/plugins"),
            ]);
            const gb = new GrowthBook({
                apiHost: "https://cdn.growthbook.io",
                clientKey: "sdk-WONQWG92BNlreR1",
                // Exposes window._growthbook for the DevTools extension
                // (inspect/force variants). Dev builds only — in prod it's
                // a public console handle into the experiment config.
                enableDevMode: process.env.NODE_ENV !== "production",
                plugins: [
                    autoAttributesPlugin(),
                    thirdPartyTrackingPlugin({ trackers: ["ga4", "gtm"] }),
                ],
            });
            // skipCache: the decision is read ONCE right after init — a stale
            // localStorage payload (e.g. cached from a misconfigured SDK
            // connection) would win the race over the background refresh and
            // stick the user with the fallback. Real new users have no cache
            // anyway, so this costs nothing.
            await gb.init({ timeout: 2000, skipCache: true });
            return gb.getFeatureValue("onboarding-flow", "modal");
        })().catch(() => "modal");
    }
    return variantPromise;
}
