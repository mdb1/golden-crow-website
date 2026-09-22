# Firestore field-key conventions by collection

Firestore field naming is a collection-level contract. Consistency within a collection is more important than forcing one naming convention across unrelated persistence domains.

## Canonical convention table

| Collection | Field-key convention | Canonical examples |
| --- | --- | --- |
| `service_offers` | lower camel case | `serviceId`, `serviceVersion`, `isHiddenFromSearch`, `inputSlots`, `outputSlots` |
| `service_transactions` | lower camel case | `requestId`, `offerId`, `outputObjects`, `outputReports`, `objectType`, `objectCode`, `reportCode` |
| `uploaded_objects` | snake case | `object_type`, `object_code`, `object_owner_id`, `upload_version_count`, `tracking_progress_status` |
| `uploaded_reports` | snake case | `report_code`, `report_owner_id`, `upload_version_count`, `tracking_progress_status` |
| `file_storage` | snake case | `file_name`, `file_content`, `linked_object_code`, `linked_report_code` |
| `object_owners` | snake case | `owner_name`, `owner_company`, `owner_contact_email` |
| `report_owners` | snake case | `owner_name`, `owner_company`, `owner_contact_email` |
| `object_codes` | snake case | `uploaded_object_id`, `owner_id` |
| `report_codes` | snake case | `uploaded_report_id`, `owner_id` |

The convention applies to root fields and nested maps persisted inside that collection. Collection names are identifiers and keep their existing spelling.

## Intentional boundary difference

The same semantic value can use a different key at another persistence boundary:

```json
// service_transactions/{id}
{
  "outputObjects": [
    {
      "role": "informed_consent",
      "objectType": "pgo_informed_consent",
      "objectCode": "012345678"
    }
  ]
}
```

```json
// uploaded_objects/{uploadedObjectId}
{
  "object_type": "pgo_informed_consent",
  "object_code": "012345678",
  "object_owner_id": "owner_123",
  "upload_version_count": 1
}
```

This is deliberate. Service offers and transactions are camel-case service contracts. Uploaded assets, code maps, stored files, and owner profiles are snake-case storage contracts.

## Strictness

- Do not dual-read or dual-write the two conventions.
- Do not add aliases or migration flags that accept both spellings.
- Reject `output_objects`, `object_type`, or `object_code` inside `service_transactions`.
- Reject `outputObjects`, `objectType`, or `objectCode` inside `uploaded_objects`.
- Keep boundary-specific constants separate. An uploaded-object key constant must not be reused to decode a service-transaction snapshot.
- Update writers, readers, schemas, validators, fixtures, tests, and documentation together when a collection contract changes.

## PGO JSON file boundary

Versioned PGO JSON files are separate from Firestore metadata. Their schemas define snake-case serialized keys such as `object_type`, regardless of the Firestore collection that references the file. Decode the file through the PGO schema/model layer, then construct the target Firestore document according to the table above.
