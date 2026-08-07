// Public store links for the GC Fitness app.
//
// Kept in sync with the backoffice wiki (`backoffice/src/app/gc-fitness/wiki/wiki-data.ts`,
// entries `link-app-store` / `link-play-store`) and `gc-fitness/README.md`.
//
// #782 — the App Store URL carries a country segment.
//
// ⚠️ It was switched here from the short `apps.apple.com/app/id6771836254` on a premise that
// turned out to be FALSE: that `/ar/app/…` answers 200 while the short one's **301** was what
// broke the hand-off. On iOS there is no 200 to be had — EVERY apps.apple.com URL answers 301
// to an app scheme, and that redirect IS Apple's hand-off mechanism, not a bug. Verified with
// an iPhone user agent:
//
//     GET https://apps.apple.com/ar/app/gc-fitness/id6771836254
//     → HTTP/2 301
//        location: itms-appss://apps.apple.com/ar/app/gc-fitness/id6771836254
//
// So the country segment buys nothing for the reported bug. What it does cost is real, if
// small: a DESKTOP visitor outside Argentina lands on the Argentine storefront page instead of
// their own, which the short URL avoided. Kept as-is only because the app is free and nothing
// here is priced wrong for anyone — reverting to the short URL is a safe follow-up, not a fix.
//
// When the tap does reach the App Store APP, Apple resolves the listing against the signed-in
// account's country regardless of what this URL says.
export const APP_STORE_URL = 'https://apps.apple.com/ar/app/gc-fitness/id6771836254';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.goldencrow.fitness';

// #782 — the OS-owned schemes, used ONLY on the matching mobile platform AND only OUTSIDE an
// in-app browser.
//
// ⚠️ These do NOT rescue an in-app browser, which is what they were originally added for. A
// WKWebView does not hand unknown schemes to the OS: the host app has to implement
// `decidePolicyFor` and call `UIApplication.open()`, and Instagram doesn't — so the navigation
// is cancelled SILENTLY and the button stays dead. Inside a web view the page now keeps the
// `https` URL and tells the user to open the page in Safari instead; see the <script> in
// `GCFitnessDownloadPage.astro`.
//
// Where they DO earn their keep is a real browser, where the scheme reaches the OS directly
// and skips the 301. On Android keeping `https` inside a web view matters even more: a
// dropped `market://` leaves a dead button, while the `https` link at least renders the Play
// Store web page.
export const APP_STORE_APP_URL = 'itms-apps://apps.apple.com/app/id6771836254';
export const PLAY_STORE_APP_URL = 'market://details?id=com.goldencrow.fitness';

export const GC_FITNESS_BUNDLE_ID = 'com.goldencrow.fitness';
export const GC_FITNESS_SUPPORT_EMAIL = 'support@goldencrowvs.com';
