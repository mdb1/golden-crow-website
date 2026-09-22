# Native PGO File Selection

The user first selects one of the twenty PGO types. That external selection is required because the content does not repeat `object_type`. The file wizard loads the matching closed schema, edits only allowed domain keys, and writes root content with no envelope.

When loading by nine-digit object code, `object_codes` resolves `uploaded_objects`; the snake_case `object_type` on that platform record selects the schema. The linked stored file supplies the strict JSON content. The client rejects a type mismatch or any legacy/unknown key.

## Native files and URLs

All PGO download URLs are absolute HTTPS and preserve query parameters. URLs may be opaque and need no filename extension. The client downloads and inspects actual native content with the supported parser; it must report ambiguity rather than guess.

Native interactive-report mappings remain:

| File | Model | Provider format |
| --- | --- | --- |
| `.pgi1.json` | `MDMAPIModel` | `mdm` |
| `.pgi2.json` | `AGAPIModel` | `ag` |
| `.pgi3.json` | `TwoPQAPIModel` | `2pq` |

These mappings belong to native parser configuration, not each `pgo_interactive_report`. The six single-file PGOs contain exactly `title`, `download_url`, and optional `notes`; aligned reads may additionally contain `index_download_url`.

The explorer header and twenty dedicated content screens operate on the selected type and validated root content. File-bearing objects use direct URLs; image bundles use their own gallery; forms reconstruct from the frozen shape; physical samples show specimen facts without pretending that JSON transfer moves biological material.
