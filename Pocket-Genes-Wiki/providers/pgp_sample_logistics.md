# Origin Sample Logistics

Fictional provider profile.

```json
{
  "provider_id": "pgp_sample_logistics",
  "name": "Origin Sample Logistics",
  "kind": "specimen_logistics_company",
  "description": "Fictional provider issuing formal specimen pickup requests and transporting existing specimens to their nominated destination while preserving identity and recording custody and condition changes.",
  "supported_stages": [
    "wet_lab"
  ],
  "country_codes": [
    "AR"
  ],
  "service_ids": [
    "pgs_collection_request",
    "pgs_sample_transport"
  ],
  "contacts": {
    "website": "https://originsamples.example",
    "operations_email": "operations@originsamples.example",
    "integration_email": "integrations@originsamples.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://originsamples.example/api/v1",
    "execution_modes": [
      "dispatcher_review",
      "physical_transport"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "state_semantics": "Transport returns the same specimen object_id at a later revision with destination and custody evidence. The service does not imply specimen extraction from a person."
  }
}
```
