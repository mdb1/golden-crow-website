// exercise-media-url.ts
//
// Validation for the two media links a coach can type on an exercise: the
// thumbnail / preview image and the YouTube demo. Pure and firebase-free so
// the SAME rule runs in three places — the Zod schema (server-side, on write),
// the exercise editor form (via the zod resolver), and the quick-create panel
// inside the workout builder (which validates before the round trip).
//
// WHY IT'S ITS OWN MODULE (#1104). A coach pasted a base64 `data:image/jpeg`
// blob — the image ITSELF, copied out of an image app — into the thumbnail
// field. The old schema regex rejected it with "Enter a valid image link
// (https://…)", which is the right message for a typo'd link but says nothing
// to someone who pasted a picture and cannot see why a "link" is missing. And
// the message never arrived anyway: the Server Action THREW it, and Next.js
// redacts thrown action errors in production, so the coach got "Minified React
// error #441". Two separate failures, one screen.
//
// So: name the data-URI case explicitly, and keep the rule in one place.

/** Copy — kept here so the schema, the form and the panel can't drift. */
export const THUMBNAIL_URL_INVALID = "Enter a valid image link (https://…).";
export const THUMBNAIL_URL_IS_DATA_URI =
  "That's the image itself, not a link to it. Paste an https:// link, or upload the file from the exercise editor's image box.";

/** True for an inline `data:` payload — the pasted-the-image-itself case. */
export function isDataUri(raw: string): boolean {
  return /^data:/i.test(raw.trim());
}

/**
 * Prepends `https://` when the coach pasted a bare host (`i.imgur.com/x.png`,
 * `youtu.be/abc`) — copying a link out of a mobile app or an address bar very
 * often drops the scheme.
 *
 * Anything that already carries a scheme is left ALONE, including a `data:`
 * URI (which has no `//` and would otherwise become the nonsense
 * `https://data:image/jpeg;base64,…`) and a typo'd `htttp://` (so the
 * validator below can reject it instead of us papering over it).
 */
export function normalizeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // A `data:` URI carries no `//`, so the hierarchical test below would miss
  // it and we'd build the nonsense `https://data:image/jpeg;base64,…`. Leave
  // it alone and let the validators name it for what it is.
  if (isDataUri(trimmed)) return trimmed;
  // Any hierarchical scheme (http, https, gs, or a typo like `htttp://`) is
  // left alone so the validators can reject it instead of us papering over
  // it. Note the `//` is required: `example.com:8080/x` is a bare host with a
  // port, not a scheme, and must still get the prefix.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Mirrors what `z.string().url()` accepts, narrowed to http(s). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}

/**
 * Returns the message to show for a thumbnail value, or `null` when it is
 * acceptable. Blank is acceptable — the field is optional; callers turn it
 * into `null` on the wire (an empty string is a real value on Firestore).
 *
 * `gs://` is accepted because the upload dropzone writes in-bucket paths.
 * External `https://` is accepted on purpose: the no-hotlinking invariant
 * from 03-CONTEXT.md is relaxed for small static previews, unlike `mediaURL`.
 */
export function thumbnailUrlIssue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isDataUri(trimmed)) return THUMBNAIL_URL_IS_DATA_URI;
  // Deliberately the SAME scheme-prefix test the pre-#1104 schema regex used,
  // not a full `new URL()` parse. This runs on UPDATE too, over values already
  // stored on ~600 library docs — tightening it here would turn "edit this
  // exercise" into "this exercise can no longer be saved" for any doc whose
  // legacy thumbnail doesn't survive a strict parse. The only behavior added
  // is the data-URI branch above.
  return /^(gs:\/\/|https?:\/\/)/i.test(trimmed) ? null : THUMBNAIL_URL_INVALID;
}
