# Native PGI Formats

## Native files and URLs

All PGO download URLs are absolute HTTPS and preserve query parameters. URLs may be opaque and need no filename extension. The client downloads and inspects actual native content with the supported parser; it must report ambiguity rather than guess.

Native interactive-report mappings remain:

| File | Model | Provider format |
| --- | --- | --- |
| `.pgi1.json` | `MDMAPIModel` | `mdm` |
| `.pgi2.json` | `AGAPIModel` | `ag` |
| `.pgi3.json` | `TwoPQAPIModel` | `2pq` |

These mappings belong to native parser configuration, not each `pgo_interactive_report`. The six single-file PGOs contain exactly `title`, `download_url`, and optional `notes`; aligned reads may additionally contain `index_download_url`.

The PGI models are provider-native report payloads and do not gain PGO registration fields or `notes`. A `pgo_interactive_report` is only a title and HTTPS reference to one supported native file. Parsing happens after download from actual bytes, not from a guessed URL suffix.

## PGI3 2PQ case scope

A `.pgi3.json` File Storage snapshot is always rooted in one current 2PQ case. Its `entities.cases` array contains exactly that case; it is not a batch export and never contains sibling cases.

The `entities.batches` array contains zero items when there is no linked batch, or one compact snapshot of the directly linked batch. That snapshot is intentionally flat and scalar-only. It does not contain case IDs, nested records, relationship arrays, arbitrary maps, or the batch's case tree.

Snapshot generation may read the current case, its direct parent batch, and the samplings linked to the current case. It must not traverse the batch to discover or serialize any other case.
