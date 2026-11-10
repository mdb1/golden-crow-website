# 2PQ three-letter case codes

Case creation, including biopsy submission, reserves the uppercase code in
`2pq_case_code_reservations/{CODE}` in the same transaction as the case write.
The Firestore transaction serializes claims on that document, so concurrent saves cannot
assign a code to different cases. A repeat claim by the same case is safe.

The reservation stores the code, case ID, and first reservation time and actor.
It is permanent: case deletion, code edits, and case creation rollback do not
release a code. A conflict returns HTTP 409. Report-code IDs continue to use
their existing format, including the `XXX` suffix.

There is no bulk rewrite on rollout. For a code that has no reservation yet,
the SDK checks bounded queries for surviving legacy cases and biopsy forms,
including archived forms, and checks the corresponding report-code document.
An existing case can claim its own code; a legacy case edit or deletion
preserves the old code before removing the evidence from the case. Codes whose
historical evidence was completely removed before rollout cannot be recovered
without a backup or audit record.
