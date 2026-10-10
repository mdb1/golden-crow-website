# Pocket Genes Catalog Wiki

Strict schema-1 reference package for twenty Pocket Genes Object types, fifteen fictional service examples, six fictional providers, native PGI formats, transaction contracts and request-limit policy.

The universal [deleted-identity continuity contract](docs/deleted-identity-continuity.md) defines non-cascading content retention, the shared `DeletedUserProvider` presentation boundary, platform parity, and the strict separation between deleted identity fallback and serialized PGO content.

The [downloaded-file update lifecycle](docs/downloaded-file-updates.md) defines canonical report/object identity and version checks, the three automatic/manual run intents, quiet current-file probing, blacklist and manual-update behavior, sequential safe replacement, privacy, failure recovery, and iOS/Android parity.

Run:

```sh
node generate_minimal_pgo_contracts.mjs
python3 validate_catalog.py
```

The generator rewrites every derived schema, example, service/provider fixture and Markdown reference. The validator rejects the retired envelope and unknown keys. `catalog/usage-policy.json` declares both authenticated and email-only requester accounting.
