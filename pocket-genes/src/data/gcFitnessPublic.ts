// Public store links for the GC Fitness app.
//
// Kept in sync with the backoffice wiki (`backoffice/src/app/gc-fitness/wiki/wiki-data.ts`,
// entries `link-app-store` / `link-play-store`) and `gc-fitness/README.md`.
//
// #782 — the App Store URL is the CANONICAL one, redirect and all included.
//
// It used to be the short `apps.apple.com/app/id6771836254`, on purpose: without a country
// segment Apple sends each visitor to their own storefront. What that costs is a **301**, and
// the 301 is what kept breaking the button — the hand-off to the App Store app only happens
// while the user's gesture is still alive, and a redirect outlives it in a new tab (Safari,
// fixed once by dropping `target="_blank"`) and inside an in-app browser (Instagram, this
// round). The sibling that always worked is the tell: Pocket Genes points at a canonical
// `/ar/app/…` URL.
//
// The storefront is not really lost. This URL is what a WEB visitor lands on; when the tap
// reaches the App Store APP, Apple resolves the listing against the signed-in account's
// country. And the app is free, so nothing here is priced wrong for anyone.
export const APP_STORE_URL = 'https://apps.apple.com/ar/app/gc-fitness/id6771836254';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.goldencrow.fitness';

// #782 — the OS-owned schemes, used ONLY on the matching mobile platform.
//
// An in-app browser (Instagram, Facebook, TikTok…) is a WKWebView / Android WebView, and an
// `https://apps.apple.com/…` navigation inside one is just a page load: the host app decides
// whether to hand it to the App Store, and Instagram does not. That is the reported symptom
// exactly — "el botón de Apple no hace nada, a menos que le dé force touch + open link"
// (force-touch → "Open Link" leaves the WebView and lands in Safari, which does hand off).
//
// A custom scheme has no such ambiguity: the WebView cannot load it, so it goes to the OS.
// Same story on Android, where the `https` Play link renders the Play Store WEB page inside
// the WebView — also reported — while `market://` opens the app.
export const APP_STORE_APP_URL = 'itms-apps://apps.apple.com/app/id6771836254';
export const PLAY_STORE_APP_URL = 'market://details?id=com.goldencrow.fitness';

export const GC_FITNESS_BUNDLE_ID = 'com.goldencrow.fitness';
export const GC_FITNESS_SUPPORT_EMAIL = 'support@goldencrowvs.com';
