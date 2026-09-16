# Pocket Genes wiki starter package

Start with **Pocket-Genes-Wiki.md**. It is the complete standalone reference for 20 proposed object types and 15 fictional services across Test planning, Wet lab, and Bioinformatics.

Use `catalog/objects.json`, `catalog/services.json`, and `catalog/providers.json` to seed a wiki or catalog UI. Individual Markdown pages, object schemas, filled forms, request examples, native-file fixtures, and SVG icons are included.

Every service request includes a form validated against its service's form_shape. The key final reporting contract is `form + test_order + .pgi1.json → PDF`. All examples are synthetic. This specification does not claim to mirror an unseen production `.pgi1.json` schema.

## Validate the package

```bash
python -m pip install -r requirements.txt
python validate_catalog.py
```

See `validation-report.json` for the delivered checks. Native fixture parsing is separate from medical or assay validation.

Delivered validation: **195 checks passed**, covering 39 object snapshots, 20 object types, 15 services, six providers, native payloads, and representative invalid requests.

The entry-point Markdown is self-contained. The archive additionally supplies individual wiki pages, catalogs, schemas, native fixtures, the validator, and all 20 SVG icon assets.
