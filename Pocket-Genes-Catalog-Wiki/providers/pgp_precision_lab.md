# Atlas Precision Laboratory — `pgp_precision_lab`

Fictional laboratory extracting DNA from accepted specimens and producing the agreed sequencing-read deliverable for the scope and fulfillment requirements in a test order.

**Kind:** laboratory  
**Stages:** wet_lab  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_dna_extraction`
- `pgs_sequencing`

## Contact and integration

```json
{
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

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.
