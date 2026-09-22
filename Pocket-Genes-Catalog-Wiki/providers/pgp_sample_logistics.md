# Origin Sample Services — `pgp_sample_logistics`

Fictional provider coordinating real biological sample collection by qualified staff and, when a separate transport service is requested, transporting already collected specimens while preserving identity, custody and condition records.

**Kind:** sample_collection_and_transport_provider  
**Stages:** wet_lab  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_collection_request`
- `pgs_sample_transport`

## Contact and integration

```json
{
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
      "biological_sample_collection",
      "physical_transport"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "state_semantics": "A collection request schedules or records the intended biological sample collection event. Transport is a separate service that moves an already collected specimen and returns the same specimen object_id at a later revision with destination and custody evidence."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.
