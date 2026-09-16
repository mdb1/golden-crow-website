# Atlas Precision Laboratory

Fictional provider profile.

```json
{
  "provider_id": "pgp_precision_lab",
  "name": "Atlas Precision Laboratory",
  "kind": "laboratory",
  "description": "Fictional laboratory extracting DNA from accepted specimens and producing the agreed sequencing-read deliverable for the scope and fulfillment requirements in a test order.",
  "supported_stages": [
    "wet_lab"
  ],
  "country_codes": [
    "AR"
  ],
  "service_ids": [
    "pgs_dna_extraction",
    "pgs_sequencing"
  ],
  "contacts": {
    "website": "https://atlasprecision.example",
    "operations_email": "operations@atlasprecision.example",
    "integration_email": "integrations@atlasprecision.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://atlasprecision.example/api/v1",
    "execution_modes": [
      "specimen_receipt",
      "laboratory_processing"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "acceptance_checks": [
      "test_order_scope",
      "accepted_specimen_type_and_state",
      "quantity_and_quality_requirements",
      "agreed_output_profile"
    ]
  }
}
```
