# 2PQ service transaction naming

Every new `service_transactions` document has a server-owned root `name`. Ordinary requests default it to the selected offer name without changing the frozen `offerSnapshot`.

An automatically created 2PQ case transaction uses `Solicitud de estudio de XXX`, where `XXX` is the case's canonical uppercase three-letter code. The case is linked to the transaction by the deterministic request ID `pgr_2pq_<normalized_case_id>` after the case record is persisted and before File Storage and report-code synchronization begin.
