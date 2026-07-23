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
                enableDevMode: true,
                plugins: [
                    autoAttributesPlugin(),
                    thirdPartyTrackingPlugin({ trackers: ["ga4", "gtm"] }),
                ],
            });
            await gb.init({ timeout: 2000 });
            return gb.getFeatureValue("onboarding-flow", "modal");
        })().catch(() => "modal");
    }
    return variantPromise;
}
