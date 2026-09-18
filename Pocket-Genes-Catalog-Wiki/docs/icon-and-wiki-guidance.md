
## Wiki presentation and icon system

Use professional catalog cards with a restrained sense of collecting and connecting useful pieces. Each card has one recognizable symbol, a name, its stable keyword, a physical/virtual badge, supported stages, and a short description. Show compatible services beneath it.

### Asset contract

- Each object has `icons/<pgo_key>.svg`: 24 × 24 viewBox, transparent background, 1.65-unit rounded strokes, `currentColor`, and an accessible title.
- Use 24 px in tables, 32 px in lists, and 40–48 px inside catalog-card containers.
- Suggested stage accents: Test planning `#6F42C1`, Wet lab `#087F8C`, Bioinformatics `#B42F7D`. Neutral text `#242239`; borders `#E3E0ED`; background `#F7F7FC`.
- Use the declared icon symbol to identify type. Stage, availability, completion, and physical/virtual nature are separate labels or badges.
- `icons/catalog-preview.png` and `.svg` show all 20 draft assets. These are new catalog assets, not replacements for the Pocket Genes application logo.
- Object images and clinical photos belong to payloads. They are not the catalog icons.

### Card content

1. Icon and name.
2. Keyword and extension.
3. Stage and physical/virtual badges.
4. What the object represents.
5. Available transformations: accepted inputs, produced outputs, provider, price, and turnaround.
6. “Use in a service” for an owned object, or “View services that produce this” for a catalog type.

### Light gamification

Make each completed stage visibly add useful objects to the user's case inventory. Show filled and missing input slots before requesting a service; mark a compatible next step as available. A pipeline progress indicator can show planned, in progress, awaiting input, and delivered steps. Keep the status about workflow completion. Do not use rarity, competitive rankings, or colored object tiers to imply that a health result is better or worse.

### Wiki page structure

An object page should expose definition, type key, format, fields, examples, validation rules, providers that produce it, services that accept it, and revision history. A service page should expose provider, input slots, form shape, sample request, outputs, scope requirements, turnaround, pricing basis, and failure behavior. A provider page should expose organization/professional identity, service list, geographical coverage, integration profile, and contact details.

Use filters for stage, object type, physical/virtual nature, input owned, and desired output. A “Can I obtain this result?” view should trace compatible services while checking the test-order requirements; a line between two matching file extensions is only an initial candidate connection.
