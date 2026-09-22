#!/usr/bin/env node

// The strict PGO generator owns object content, frozen form snapshots and all
// repeated service/provider fixtures. Keeping one entry point prevents drift.
await import("./generate_minimal_pgo_contracts.mjs");
