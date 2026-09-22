# Chromosome Image Services — `pgp_cytogenetics`

Fictional image-analysis provider accepting a compatible metaphase image bundle and returning a structured karyotype result. The digital analysis can be requested independently of specimen preparation or sequencing.

**Kind:** cytogenetics_analysis_company  
**Stages:** bioinformatics  
**Regions:** AR  
**Catalog status:** fictional example, not a live integration

## Services

- `pgs_karyotype_analysis`

## Contact and integration

```json
{
  "contacts": {
    "website": "https://chromosomeimages.example",
    "operations_email": "operations@chromosomeimages.example",
    "integration_email": "integrations@chromosomeimages.example"
  },
  "api_capability_proposal": {
    "status": "illustrative_not_live",
    "contract_id": "pg_api_service_requests_v1",
    "base_url": "https://chromosomeimages.example/api/v1",
    "execution_modes": [
      "image_analysis",
      "expert_review_when_included"
    ],
    "completion_model": "asynchronous",
    "callbacks": "signed_callback_to_preregistered_pocket_genes_endpoint",
    "stage_note": "Bioinformatics is the catalog bucket for digital analytical services, including this non-sequencing image-analysis branch."
  }
}
```

The provider identity belongs to Discover and the service offer. It is never repeated as required PGO content. Requests use authenticated, role-labelled transaction references; outputs are registered before delivery.
