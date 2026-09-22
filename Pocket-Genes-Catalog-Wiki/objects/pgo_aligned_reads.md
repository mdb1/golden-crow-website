# 13. Aligned reads — `pgo_aligned_reads`

A titled reference to downloadable aligned reads with an optional index.

**Nature:** virtual  
**Stages:** wet_lab, bioinformatics  
**Serialized extension:** `.bam`  
**Schema:** `schemas/objects/pgo_aligned_reads.schema.json`  
**Example:** `examples/objects/pgo_aligned_reads.pgobject.json`

## Content boundary

The uploaded JSON root is the domain content shown below. It has no object envelope. The externally selected platform record supplies type, identity, owner, access, revision, creator, and transaction relationships. This content neither requires a service nor another registered object.

Every unlisted property is invalid. Optional `notes` may be absent or an empty string and is only for additional human information.

## Fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | Yes | Human-facing title. |
| `download_url` | `string` | Yes | HTTPS URL used to download the aligned reads. |
| `index_download_url` | `string` | No | HTTPS URL used to download the optional alignment index. |
| `notes` | `string` | No | Optional additional information the person wants to communicate. It may be empty. |

### Alignment files

`download_url` points directly to the aligned reads. Optional `index_download_url` expresses index availability without a duplicate boolean. No generic file list is allowed.



## Minimal example

```json
{
  "title": "Aligned reads",
  "download_url": "https://example.com/sample.bam",
  "index_download_url": "https://example.com/sample.bam.bai"
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
