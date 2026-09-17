# Pocket Genes wiki starter package

Start with **Pocket-Genes-Wiki.md**. It is the complete standalone reference for 20 proposed object types and 15 fictional services across Test planning, Wet lab, and Bioinformatics.

Use `catalog/objects.json`, `catalog/services.json`, `catalog/usage-policy.json`, and `catalog/providers.json` to seed a wiki or catalog UI. Individual Markdown pages, object schemas, filled forms, request examples, native-file fixtures, and SVG icons are included.

Service requests instantiate existing service offers. Root `service_offers` use the canonical camelCase contract (`serviceId`, `name`, `providerId`, `providerKind`, `providerName`, `formShape`, `inputSlots`, `outputSlots`). A `pgo_form` appears only when the offer declares it as an input slot backed by `formShape`; there is no root `formRef` request field. The key final reporting contract is `pgo_form + test_order + pgo_interactive_report (.pgi1/.pgi2/.pgi3) -> PDF`. The native PGI rules live in `docs/pgi-native-formats.md`: `.pgi1.json` maps to `MDMAPIModel`, `.pgi2.json` maps to `AGAPIModel`, and `.pgi3.json` maps to `TwoPQAPIModel`. Native catalog file selection rules live in `docs/native-pgo-file-selection.md`: all 20 catalog object types are selected as strict PGO JSON wrappers, and large payloads are referenced through `files[]` instead of being embedded on device. All examples are synthetic.

Service request limits are defined at catalog level in `catalog/usage-policy.json`. The mock services do not carry variable token costs: each admitted transaction consumes one request limit, while daily usage is computed from authoritative root-level `service_transactions`.

## Validate the package

```bash
python -m pip install -r requirements.txt
python validate_catalog.py
```

See `validation-report.json` for the delivered checks. Native fixture parsing is separate from medical or assay validation.

Delivered validation: **198 checks passed**, covering 39 object snapshots, 20 object types, 15 services, six providers, PGI native payload schemas, the service request usage policy, native payloads, and representative invalid requests.

The entry-point Markdown is self-contained. The archive additionally supplies individual wiki pages, catalogs, schemas, native fixtures, the validator, and all 20 SVG icon assets.
