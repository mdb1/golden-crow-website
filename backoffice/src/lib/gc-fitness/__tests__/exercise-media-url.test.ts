// exercise-media-url.test.ts
//
// #1104 — the thumbnail field's validation rule, which now runs in three
// places off ONE function: the quick-create panel (before the round trip), the
// exercise editor (through the zod resolver), and the Server Action (on write).
//
// The case that produced the bug is the first one: a coach pasted the IMAGE —
// a `data:image/jpeg;base64,…` blob copied out of an image app — into a field
// that wants a link. The old rule rejected it with "Enter a valid image link
// (https://…)", which is correct and useless: somebody who pasted a picture
// has no idea what "link" is missing. And they never read even that, because
// the Server Action threw it and production redacts thrown action errors.

import {
  THUMBNAIL_URL_INVALID,
  THUMBNAIL_URL_IS_DATA_URI,
  isDataUri,
  normalizeExternalUrl,
  thumbnailUrlIssue,
} from "@/lib/gc-fitness/exercise-media-url";

const DATA_URI =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBwg=";

describe("normalizeExternalUrl", () => {
  it("prepends https:// to a bare host", () => {
    // Links copied out of a phone's share sheet or address bar routinely
    // arrive without their scheme.
    expect(normalizeExternalUrl("youtu.be/ORoOn93dnh4")).toBe(
      "https://youtu.be/ORoOn93dnh4",
    );
    expect(normalizeExternalUrl("i.example.com/a.gif")).toBe(
      "https://i.example.com/a.gif",
    );
  });

  it("leaves a hierarchical scheme alone, typos included", () => {
    expect(normalizeExternalUrl("https://example.com/a.gif")).toBe(
      "https://example.com/a.gif",
    );
    expect(normalizeExternalUrl("gs://bucket/exercises/a.gif")).toBe(
      "gs://bucket/exercises/a.gif",
    );
    // A typo must reach the validator as a typo rather than become
    // `https://htttp://…`, which reads as a valid URL and isn't one.
    expect(normalizeExternalUrl("htttp://example.com")).toBe(
      "htttp://example.com",
    );
  });

  it("leaves a data: URI alone rather than building https://data:…", () => {
    // A data URI has no `//`, so a naive scheme test misses it and the
    // prefixing turns an identifiable mistake into unrecognizable garbage.
    expect(normalizeExternalUrl(DATA_URI)).toBe(DATA_URI);
  });

  it("does not mistake a host:port for a scheme", () => {
    expect(normalizeExternalUrl("example.com:8080/a.gif")).toBe(
      "https://example.com:8080/a.gif",
    );
  });

  it("returns empty for blank input", () => {
    expect(normalizeExternalUrl("   ")).toBe("");
  });
});

describe("isDataUri", () => {
  it("recognizes the pasted-image shape, whitespace and case included", () => {
    expect(isDataUri(DATA_URI)).toBe(true);
    expect(isDataUri("  DATA:image/png;base64,iVBOR")).toBe(true);
    expect(isDataUri("https://example.com/data:x")).toBe(false);
  });
});

describe("thumbnailUrlIssue", () => {
  it("names the pasted-image mistake specifically", () => {
    expect(thumbnailUrlIssue(DATA_URI)).toBe(THUMBNAIL_URL_IS_DATA_URI);
    // It must not be the generic copy — that is the whole point of the case.
    expect(thumbnailUrlIssue(DATA_URI)).not.toBe(THUMBNAIL_URL_INVALID);
  });

  it("accepts an https link and an in-bucket gs:// path", () => {
    expect(thumbnailUrlIssue("https://example.com/a.gif")).toBeNull();
    expect(thumbnailUrlIssue("http://example.com/a.gif")).toBeNull();
    // The upload dropzone writes gs:// paths; rejecting them would make every
    // uploaded thumbnail unsavable on the next edit.
    expect(thumbnailUrlIssue("gs://bucket/exercises/a.gif")).toBeNull();
  });

  it("treats blank as acceptable — the field is optional", () => {
    expect(thumbnailUrlIssue("")).toBeNull();
    expect(thumbnailUrlIssue("   ")).toBeNull();
  });

  it("stays a SCHEME-PREFIX test, not a strict URL parse", () => {
    // Deliberate: this rule also runs on UPDATE, over values already stored on
    // ~600 library docs. Tightening it into `new URL()` would turn "edit this
    // exercise" into "this exercise can no longer be saved" for any legacy
    // thumbnail that doesn't survive a strict parse.
    expect(thumbnailUrlIssue("https://legacy host/a b.gif")).toBeNull();
    expect(thumbnailUrlIssue("not-a-link")).toBe(THUMBNAIL_URL_INVALID);
  });
});
