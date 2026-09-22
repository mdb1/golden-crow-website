# Clarity Report Studio — `pgp_report_studio`

Fictional report provider combining a self-contained test order with a symptom-independent .pgi1.json result and the service form to produce a final PDF. Request-specific presentation options belong to the form.

**Kind:** report_production_company  
**Stages:** bioinformatics  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_final_report`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://clarityreports.example",
    "operations_email": "operations@clarityreports.example",
    "integration_email": "integrations@clarityreports.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://clarityreports.example/api/v1",
    "execution_modes": [
      "document_generation"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "clinical_role": "Any required professional interpretation or authorization must be explicitly part of the contracted service and attributable to its actual performer. Rendering a PDF does not itself supply that authorization."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.
