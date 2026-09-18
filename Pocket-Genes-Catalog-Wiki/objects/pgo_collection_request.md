# Sample collection request — `pgo_collection_request`

A formal request to obtain an actual biological sample from a subject or biological source as part of a test order.

This object means sample collection in the clinical/laboratory sense: blood draw, buccal swab, saliva collection, tissue biopsy, embryo-material collection, or another explicitly supported specimen-acquisition procedure. It does not mean courier pickup, package pickup, truck pickup, route planning, or sample transport. Transport after collection must be represented by `pgs_sample_transport` or another explicit transport service.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Wet lab |
| Extension | .pgcollection.json |
| Icon asset | icons/pgo_collection_request.svg |
| Icon subject | A test tube with a plus mark representing biological sample collection. |
| JSON Schema | schemas/objects/pgo_collection_request.schema.json |
| Example record | examples/objects/pgo_collection_request.pgcollection.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `order_ref` | object | Yes | Parent test order. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `subject_ref` | object | Yes | Subject or biological source from whom/which the sample will actually be collected. |
| `subject_ref.subject_id` | string | Yes | Subject/source identifier. minLength: 1 |
| `requested_sample` | object | Yes | Biological material to obtain and the procedure used to obtain it. This is not package pickup. |
| `requested_sample.sample_type` | string | Yes | Biological material type. Options: blood, buccal_swab, saliva, tissue, embryo_material |
| `requested_sample.collection_method` | string | Yes | Procedure for obtaining the biological sample. Options: phlebotomy, buccal_swab, saliva_kit, tissue_biopsy, embryo_biopsy |
| `requested_sample.container` | string | Yes | Tube, kit or container required at collection. minLength: 1 |
| `requested_sample.minimum_quantity` | string | Yes | Minimum amount to obtain when applicable. minLength: 1 |
| `assigned_collector_provider_id` | string | Yes | Provider assigned to perform or coordinate the biological sample collection. minLength: 1 |
| `collection_site` | object | Yes | Site where the biological sample will be obtained from the subject/source. This is not a courier pickup location. |
| `collection_site.site_id` | string | Yes | Registered sample collection site identifier. minLength: 1 |
| `collection_site.name` | string | Yes | Collection site display name. minLength: 1 |
| `collection_site.address_line` | string | Yes | Address where the biological collection procedure happens. minLength: 1 |
| `collection_site.city` | string | Yes | City. minLength: 1 |
| `collection_site.country_code` | string | Yes | Country code. minLength: 1; pattern: ^[A-Z]{2}$ |
| `collection_site.contact_name` | string | Yes | Collection-site contact, such as the nurse, lab desk, or coordinator. minLength: 1 |
| `collection_site.contact_phone` | string | Yes | Phone used to coordinate the biological collection appointment; synthetic in the fixture. minLength: 1 |
| `collection_window_start` | string | Yes | Start of the requested biological sample collection appointment window. format: date-time; minLength: 1 |
| `collection_window_end` | string | Yes | End of the requested biological sample collection appointment window. format: date-time; minLength: 1 |
| `preparation_profile` | string | Yes | Patient/source preparation, tube/kit and immediate post-collection handling requirements. minLength: 1 |
| `post_collection_plan` | object | Yes | Expected next step after the sample has been obtained. Transport, if needed, must be a separate service. |
| `post_collection_plan.next_step` | string | Yes | Expected next action after collection. minLength: 1 |
| `post_collection_plan.receiving_lab_id` | string | Yes | Laboratory expected to receive the sample after collection, if known. minLength: 1 |
| `post_collection_plan.transport_required` | boolean | Yes | Whether a separate transport service is expected after collection. |
| `status` | string | Yes | Sample collection lifecycle status. Options: requested, scheduled, collected, cancelled, failed |


**Sample object record**

```json
{
  "object_id": "obj_demo_collection",
  "object_type": "pgo_collection_request",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:30:00Z",
  "created_by": "pgp_sample_logistics",
  "input_refs": [
    {
      "object_id": "obj_demo_form_collection_request",
      "revision": 1
    },
    {
      "object_id": "obj_demo_order",
      "revision": 1
    }
  ],
  "data": {
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "subject_ref": {
      "subject_id": "subject_demo_001"
    },
    "requested_sample": {
      "sample_type": "blood",
      "collection_method": "phlebotomy",
      "container": "EDTA tube",
      "minimum_quantity": "2 mL"
    },
    "assigned_collector_provider_id": "pgp_sample_logistics",
    "collection_site": {
      "site_id": "site_demo_collection_room",
      "name": "Demo clinical collection room",
      "address_line": "100 Example Avenue",
      "city": "Demo City",
      "country_code": "AR",
      "contact_name": "Demo collection nurse",
      "contact_phone": "+54-DEMO-0001"
    },
    "collection_window_start": "2026-09-16T13:00:00Z",
    "collection_window_end": "2026-09-16T15:00:00Z",
    "preparation_profile": "EDTA tube, subject identity check, consent confirmed before draw",
    "post_collection_plan": {
      "next_step": "register_physical_sample",
      "receiving_lab_id": "pgp_precision_lab",
      "transport_required": true
    },
    "status": "requested"
  },
  "files": []
}
```

**Validation and JSON logic**

- This object means actual biological sample collection from a subject/source. It never means courier pickup, package pickup, truck pickup or sample transport.
- `collection_window_end` must be later than `collection_window_start`.
- `requested_sample.collection_method` must match the requested biological material and the provider capability.
- The collection request is a virtual planning/coordination object. A physical sample object is created or linked only after the sample is actually obtained.
- Any movement after collection belongs to `pgs_sample_transport` or another explicit transport service.

**Linked mock services**

- Produced or updated by: `pgs_collection_request`
- Consumed by: `pgs_sample_transport`

**Other service opportunities**

- Test order plus form to biological sample collection request.
- Collection request plus actual collected sample to transported sample, only through a separate transport service.
- Recording the handoff to the selected laboratory after the sample exists.
