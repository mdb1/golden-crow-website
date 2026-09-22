# Meridian Clinical Planning — `pgp_clinical_planning`

Fictional multidisciplinary provider that structures request information, prioritizes candidate genes, records informed consent, prepares test orders, and produces form-based documents.

**Kind:** professional_services_organization  
**Stages:** test_planning  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_symptom_intake`
- `pgs_gene_prioritization`
- `pgs_informed_consent`
- `pgs_test_ordering`
- `pgs_form_to_pdf`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://meridianplanning.example",
    "operations_email": "operations@meridianplanning.example",
    "integration_email": "integrations@meridianplanning.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://meridianplanning.example/api/v1",
    "execution_modes": [
      "professional_review",
      "assisted_document_generation"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint"
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.
