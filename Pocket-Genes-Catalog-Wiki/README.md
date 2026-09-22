# Pocket Genes Catalog Wiki

Strict schema-1 reference package for twenty Pocket Genes Object types, fifteen fictional service examples, six fictional providers, native PGI formats, transaction contracts and request-limit policy.

Run:

```sh
node generate_minimal_pgo_contracts.mjs
python3 validate_catalog.py
```

The generator rewrites every derived schema, example, service/provider fixture, bundled iOS catalog and Markdown reference. The validator rejects the retired envelope and unknown keys. `catalog/usage-policy.json` is intentionally outside the content redesign and must remain unchanged.
