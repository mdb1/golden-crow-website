# 18. Image bundle — `pgo_image_bundle`

A named collection of one or more directly downloadable images.

**Nature:** virtual  
**Stages:** test_planning, wet_lab, bioinformatics  
**Serialized extension:** `.pgimages.json`  
**Schema:** `schemas/objects/pgo_image_bundle.schema.json`  
**Example:** `examples/objects/pgo_image_bundle.pgimages.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `images` | `array<object>` | Yes |  |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Component structure

`images` is nonempty. Each image contains exactly `key`, `name`, and `download_url`; all are nonempty, keys are unique, and the URL resolves the component directly. No size, checksum, MIME type, role, path, source reference, or generic file descriptor is permitted.



## Minimal example

```json
{
  "title": "Metaphase images",
  "images": [
    {
      "key": "metaphase_1",
      "name": "Metaphase image 1",
      "download_url": "https://example.com/image-1.png"
    },
    {
      "key": "metaphase_2",
      "name": "Metaphase image 2",
      "download_url": "https://example.com/image-2.png"
    }
  ]
}
```

## Validation

- The content is standalone and does not require a Pocket Genes service or another registered object.
- Only the declared properties are allowed; platform identity, ownership, revision, provenance and storage metadata stay outside the content.
- Required strings must contain at least one non-whitespace character.
- notes is optional, may be empty, and must not be populated with discarded technical metadata.
- Required strings are nonempty after trimming whitespace.
- Any download URL is absolute HTTPS; query parameters are preserved and a filename suffix is not required.
- No compatibility alias, legacy envelope, or unknown property is accepted.

## Platform integration

The platform may store this content under an existing record's `data` field, but users create and edit only the domain content. Service input/output roles remain on the transaction. Ownership and authorization remain in their existing collections.
