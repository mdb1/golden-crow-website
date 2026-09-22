# 16. Interactive genomic report — `pgo_interactive_report`

A titled reference to a downloadable native PGI report decoded through the existing PGI format parsers.

**Nature:** virtual  
**Stages:** bioinformatics  
**Serialized extension:** `.pgi1.json / .pgi2.json / .pgi3.json`  
**Schema:** `schemas/objects/pgo_interactive_report.schema.json`  
**Example:** `examples/objects/pgo_interactive_report.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the native file. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Native file boundary

The PGO registers a readable `title` and one direct `download_url`. The downloaded native file retains its own domain content. No generic `files` array, payload descriptor, checksum, format tuple, record count, producer metadata, or duplicate header inventory is valid PGO content.



## Minimal example

```json
{
  "title": "Interactive genomic report",
  "download_url": "https://example.com/interactive-report"
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
