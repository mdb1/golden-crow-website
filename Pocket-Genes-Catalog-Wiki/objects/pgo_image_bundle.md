# Image bundle — `pgo_image_bundle`

A manifest grouping images that form one service input, such as metaphase images, specimen photographs or embryo images.

| Attribute | Value |
| --- | --- |
| Nature | virtual |
| Stages | Test planning, Wet lab, Bioinformatics |
| Extension | .pgimages.json |
| Icon asset | icons/pgo_image_bundle.svg |
| Icon subject | Two overlapping image frames with a microscope dot pattern. |
| JSON Schema | schemas/objects/pgo_image_bundle.schema.json |
| Example record | examples/objects/pgo_image_bundle.pgimages.json |


**Properties inside `data`**

| Property | Type | Required within parent | Meaning / constraints |
| --- | --- | --- | --- |
| `subject_id` | string | Yes | Synthetic or platform-assigned subject identifier; do not infer identity from a filename. minLength: 1 |
| `order_ref` | object | No | Related test order when this image service belongs to one. |
| `order_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `order_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `image_kind` | string | Yes | Semantic class of the image set. Options: metaphase, embryo, microscopy, specimen_photo, other; minLength: 1 |
| `source_object_ref` | object | Yes | Physical or virtual source that was imaged. |
| `source_object_ref.object_id` | string | Yes | Stable object identifier. minLength: 1; pattern: ^obj_[A-Za-z0-9_]+$ |
| `source_object_ref.revision` | integer | Yes | Pinned object revision. minimum: 1 |
| `acquired_at` | string | Yes | Image acquisition time. format: date-time; minLength: 1 |
| `acquired_by` | string | Yes | Provider or operator responsible for acquisition. minLength: 1 |
| `images` | array | Yes | Images included as files in this bundle. minItems: 1 |
| `images[].image_id` | string | Yes | Identifier unique within the bundle. minLength: 1 |
| `images[].file_role` | string | Yes | Role identifying the file in the common files list. minLength: 1 |
| `images[].format` | string | Yes | Native image format. Options: png, jpeg, tiff, svs; minLength: 1 |
| `images[].width_px` | integer | Yes | Image width in pixels. minimum: 1 |
| `images[].height_px` | integer | Yes | Image height in pixels. minimum: 1 |
| `images[].caption` | string | Yes | Description of what this particular image represents. minLength: 1 |
| `acquisition_profile` | string | Yes | Image-acquisition contract accepted by the analysis service. minLength: 1 |


**Sample object record**

```json
{
  "object_id": "obj_demo_images",
  "object_type": "pgo_image_bundle",
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
    "image_kind": "metaphase",
    "source_object_ref": {
      "object_id": "obj_demo_blood",
      "revision": 1
    },
    "acquired_at": "2026-09-16T12:00:00Z",
    "acquired_by": "pgp_cytogenetics",
    "images": [
      {
        "image_id": "image_demo_001",
        "file_role": "image_001",
        "format": "png",
        "width_px": 640,
        "height_px": 400,
        "caption": "Synthetic metaphase-like illustration 1 for catalog demonstration only."
      },
      {
        "image_id": "image_demo_002",
        "file_role": "image_002",
        "format": "png",
        "width_px": 640,
        "height_px": 400,
        "caption": "Synthetic metaphase-like illustration 2 for catalog demonstration only."
      }
    ],
    "acquisition_profile": "pg_demo_metaphase_v1"
  },
  "files": [
    {
      "role": "image_001",
      "path": "payloads/demo-image-1.png",
      "media_type": "image/png",
      "sha256": "3912a97626f8724df64d60e94111308be261b38690f28bd2764aab3e80ba88a6",
      "size_bytes": 6870
    },
    {
      "role": "image_002",
      "path": "payloads/demo-image-2.png",
      "media_type": "image/png",
      "sha256": "c3b79c5d395bf3f4f6147f0de38dc4fcbbeec6319bd0072e37611d8943f31137",
      "size_bytes": 6968
    }
  ]
}
```
The `files` array resolves the manifest entries to two PNG payloads. These are explicitly marked synthetic illustrations, not patient microscopy images.

**Validation and JSON logic**

- Each image file_role must resolve to exactly one file in the common files list.
- Image identifiers must be unique and stated pixel dimensions must match the payload.
- An analysis service can require a specific image_kind, image count, quality and acquisition profile.
- One bundle remains one input object even when it contains many native image files.

**Linked mock services**

- Produced or updated by: No service in the initial 15; retained as an accepted type for additional provider contracts.
- Consumed by: `pgs_karyotype_analysis`

**Other service opportunities**

- Specimen to microscopy image bundle.
- Metaphase images to karyotype result.
- Embryo images to an assessment PDF.
