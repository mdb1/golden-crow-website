# Pocket Genes wiki starter package

Start with **Pocket-Genes-Wiki.md**. It is the complete standalone reference for 20 proposed object types and 15 fictional services across Test planning, Wet lab, and Bioinformatics.

Use `catalog/objects.json`, `catalog/services.json`, `catalog/usage-policy.json`, and `catalog/providers.json` to seed a wiki or catalog UI. Individual Markdown pages, object schemas, filled forms, request examples, native-file fixtures, and SVG icons are included.

Service requests instantiate existing service offers. Root `service_offers` use the canonical contract (`serviceId`, `name`, `providerId`, `providerKind`, `providerName`, `formShape`, `inputSlots`, `outputSlots`) plus the exact discovery boolean `isHiddenFromSearch`. Native available-service search lists only active offers where that flag is false; transactions remain visible independently of it. A `pgo_form` appears only when the offer declares it as an input slot backed by `formShape`; there is no root `formRef` request field. The key final reporting contract is `pgo_form + test_order + pgo_interactive_report (.pgi1/.pgi2/.pgi3) -> PDF`. The native PGI rules live in `docs/pgi-native-formats.md`: `.pgi1.json` maps to `MDMAPIModel`, `.pgi2.json` maps to `AGAPIModel`, and `.pgi3.json` maps to `TwoPQAPIModel`. Native catalog file selection and administration rules live in `docs/native-pgo-file-selection.md`: all 20 catalog object types are selected as strict PGO JSON wrappers, large payloads are referenced through `files[]`, object access uses a nine-digit code through `object_codes` -> `uploaded_objects` -> `object_owners`, clinician ownership uses `community_users.owned_objects`, and shared stored files have mutually exclusive immutable report/object links. The current Services Hub, resumable authentication, admission-first request state machine, provider-owned form, navigation, account status, service contract, result download/update, and PGO explorer behavior live in `docs/native-services-current-state.md`. All examples are synthetic.

The complete creator, provenance, terms, requester, and fulfillment contract lives in `docs/ownership-and-service-fulfillment.md`. It defines report owners and object owners as creators/seeders, documents the exact `is_clinician` capability boundary, separates offers from time-bound transactions, and reserves transaction status/output management for the web backoffice and trusted backend. It also specifies the full non-clinician path from requesting a service through downloading and exploring delivered objects.

Service request limits are defined at catalog level in `catalog/usage-policy.json`. The mock services do not carry variable token costs: each admitted transaction consumes one request limit. The global transaction ledger is historical authority, while an atomic UTC-day admission mirror and pending reservations prevent concurrent overspending. Admission is reserved before any submitted form object is persisted; the final transaction batch consumes that reservation without re-running endogenous limit checks.

Successful service transactions end only in `delivered`. The root transaction contract is defined in `schemas/protocol/service-transaction.schema.json`: `outputObjects` must cover every promised output role with a matching catalog type and nine-digit object code before delivery, while optional six-character `outputReports` snapshots never satisfy the object contract. The collection-specific Firestore naming table lives in `docs/firestore-field-naming.md`.

## Validate the package

```bash
python -m pip install -r requirements.txt
python validate_catalog.py
```

See `validation-report.json` for the delivered checks. Native fixture parsing is separate from medical or assay validation.

Delivered validation: **199 checks passed**, covering 39 object snapshots, 20 object types, 15 services, six providers, PGI native payload schemas, the service request usage policy, strict root transaction delivery, native payloads, and representative invalid requests.

The entry-point Markdown is self-contained. The archive additionally supplies individual wiki pages, catalogs, schemas, native fixtures, the validator, and all 20 SVG icon assets.
