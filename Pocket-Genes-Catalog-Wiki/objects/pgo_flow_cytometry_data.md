# Flow cytometry data — `pgo_flow_cytometry_data`

Native FCS measurements with the panel and channel information a compatible cell-population analysis service requires.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Wet lab, Bioinformatics |
| Extension | .fcs |
| Icon asset | icons/pgo_flow_cytometry_data.svg |
| Icon subject | A small scatter plot with three distinct point clusters. |
| JSON Schema | schemas/objects/pgo_flow_cytometry_data.schema.json |
| Example record | examples/objects/pgo_flow_cytometry_data.pgobject.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `order_ref` | object | No | Related test order when applicable. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `source_sample_ref` | object | Yes | Physical sample used in acquisition. |
| `source_sample_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_sample_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `fcs_version` | string | Yes | Version of the native FCS format. minLength: 1 |
| `panel_id` | string | Yes | Versioned panel identifier. minLength: 1 |
| `channels` | array | Yes | Measurement channels present in the file. minItems: 1 |
| `channels[].name` | string | Yes | Native FCS channel name. minLength: 1 |
| `channels[].marker` | string | Yes | Marker or signal description. minLength: 1 |
| `channels[].unit` | string | Yes | Measurement unit or scale label. minLength: 1 |
| `event_count` | integer | Yes | Number of acquired events in the native payload. minimum: 1 |
| `instrument_id` | string | Yes | Instrument identifier. minLength: 1 |
| `acquired_at` | string | Yes | Acquisition time. format: date-time; minLength: 1 |
| `analysis_profile` | string | Yes | Panel and signal interpretation contract accepted by a receiving analysis service. minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_fcs",
  "object_type": "pgo_flow_cytometry_data",
  "schema_version": "1.0.0",
  "revision": 1,
  "created_at": "2026-09-16T12:20:00Z",
  "created_by": "platform_demo_import",
  "input_refs": [],
  "data": {
    "subject_id": "subject_demo_001",
    "order_ref": {
      "object_id": "obj_demo_order",
      "revision": 1
    },
    "source_sample_ref": {
      "object_id": "obj_demo_blood",
      "revision": 1
    },
    "fcs_version": "3.1",
    "panel_id": "panel_demo_three_signal_v1",
    "channels": [
      {
        "name": "FSC-A",
        "marker": "DEMO_SCATTER_1",
        "unit": "arbitrary"
      },
      {
        "name": "SSC-A",
        "marker": "DEMO_SCATTER_2",
        "unit": "arbitrary"
      },
      {
        "name": "PG-DEMO-A",
        "marker": "DEMO_SIGNAL_A",
        "unit": "arbitrary"
      }
    ],
    "event_count": 4,
    "instrument_id": "instrument_demo_001",
    "acquired_at": "2026-09-16T12:00:00Z",
    "analysis_profile": "pg_demo_cytometry_v1"
  },
  "files": [
    {
      "role": "primary",
      "path": "payloads/demo.fcs",
      "media_type": "application/octet-stream",
      "sha256": "cb95fb4a13bb59bb8adf02aeda7baaa7c46506fef8046428766169723e649d5b",
      "size_bytes": 692
    }
  ]
}
```

**Native content / decoded preview**

The following is a readable preview. The package also contains the actual binary file; this text is not its byte representation.

```text
{
  "format": "FCS 3.1",
  "purpose": "Decoded preview of the bundled binary file",
  "event_count": 4,
  "channel_count": 3,
  "channels": [
    "FSC-A",
    "SSC-A",
    "PG-DEMO-A"
  ],
  "events": [
    [
      100.0,
      40.0,
      12.0
    ],
    [
      140.0,
      60.0,
      25.0
    ],
    [
      180.0,
      90.0,
      40.0
    ],
    [
      250.0,
      100.0,
      60.0
    ]
  ]
}
```

**Validation and JSON logic**

- The primary payload is native binary FCS; channel descriptions and event_count must agree with its metadata.
- A matching .fcs extension is insufficient when the receiving service requires a particular panel or acquisition profile.
- This object represents measurements, not a diagnosis or finalized cell-population interpretation.

**Linked mock services**

- Produced or updated by: No service in the initial 15; retained as an accepted type for additional provider contracts.
- Consumed by: No service in the initial 15; retained as an accepted type for additional provider contracts.

**Other service opportunities**

- Blood specimen to FCS measurements.
- FCS data plus service form to analysis PDF.
- Independent gating or population-analysis service.
