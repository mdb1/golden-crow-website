import copy
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
FORMAT = FormatChecker()
checks = []


def read(path):
    return json.loads((ROOT / path).read_text())


def check(name, action):
    try:
        action()
        checks.append({'check': name, 'status': 'passed'})
    except Exception as error:
        checks.append({'check': name, 'status': 'failed', 'detail': str(error)})


def require(condition, message):
    if not condition:
        raise ValueError(message)


def reject(action):
    try:
        action()
    except (ValueError, KeyError):
        return
    raise ValueError('Invalid counterexample was accepted')


objects = read('catalog/objects.json')['objects']
services = read('catalog/services.json')['services']
providers = read('catalog/providers.json')['providers']
types = {item['id']: item for item in objects}
service_map = {item['service_id']: item for item in services}
provider_map = {item['provider_id']: item for item in providers}
schemas = {key: read('schemas/objects/' + key + '.schema.json') for key in types}
snapshots = {}
for path in [*ROOT.glob('examples/objects/*.json'), *ROOT.glob('examples/forms/*.json')]:
    item = json.loads(path.read_text())
    key = (item['object_id'], item['revision'])
    if key in snapshots:
        require(snapshots[key] == item, 'Conflicting duplicate snapshot: ' + str(key))
    snapshots[key] = item


def resolve(ref):
    return snapshots[(ref['object_id'], ref['revision'])]


def validate_schema(schema, instance):
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FORMAT).validate(instance)


def refs(value):
    if isinstance(value, dict):
        if set(value) == {'object_id', 'revision'}:
            yield value
        else:
            for child in value.values():
                yield from refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from refs(child)


def form_values(data):
    return {field['key']: field['value'] for field in data['fields']}


def validate_form(service, form):
    shape = service['form_shape']
    data = form['data']
    require(data['form_shape_id'] == shape['id'] and data['form_shape_version'] == shape['version'], 'Form shape/version mismatch')
    values = form_values(data)
    require(len(values) == len(data['fields']), 'Duplicate form fields')
    fields = {field['key']: field for field in shape['fields']}
    require(shape['allow_unknown_fields'] or not (set(values) - set(fields)), 'Unknown form field')
    require({'requested_at', 'requested_by'} <= set(values), 'Missing request metadata')
    for key, field in fields.items():
        require(not field['required'] or key in values, 'Missing required field: ' + key)
        if key not in values:
            continue
        value = values[key]
        kind = field['type']
        valid = {
            'text': isinstance(value, str),
            'number': isinstance(value, (float, int)) and not isinstance(value, bool),
            'integer': isinstance(value, int) and not isinstance(value, bool),
            'boolean': isinstance(value, bool),
            'date': isinstance(value, str),
            'datetime': isinstance(value, str),
            'enum': isinstance(value, str),
            'multi_enum': isinstance(value, list) and all(isinstance(v, str) for v in value),
            'string_list': isinstance(value, list) and all(isinstance(v, str) for v in value)
        }.get(kind, False)
        require(valid, 'Wrong form value type: ' + key)
        if kind in ['enum', 'multi_enum']:
            options = {option['value'] for option in field['options']}
            require(set(value if isinstance(value, list) else [value]) <= options, 'Invalid enum option: ' + key)
        if kind in ['date', 'datetime']:
            FORMAT.check(value, 'date-time' if kind == 'datetime' else 'date')


def validate_request(service, request, form=None):
    require(request['service_id'] == service['service_id'] and request['service_version'] == service['service_version'], 'Service/version mismatch')
    validate_form(service, form or resolve(request['form_ref']))
    slots = {slot['role']: slot for slot in service['input_slots']}
    counts = Counter(item['role'] for item in request['inputs'])
    require(set(counts) <= set(slots), 'Unexpected input role')
    for role, slot in slots.items():
        require(slot['cardinality']['min'] <= counts[role] <= slot['cardinality']['max'], 'Wrong input cardinality: ' + role)
    for item in request['inputs']:
        require(resolve(item['object_ref'])['object_type'] in slots[item['role']]['accepted_types'], 'Wrong object type for role: ' + item['role'])


def compatible(order, result):
    wanted = order['data']
    data = result['data']
    support = data['analysis_support']
    require(data['subject_id'] == wanted['patient']['subject_id'], 'Wrong subject')
    require(data['reference_id'] == wanted['scope']['reference_id'], 'Wrong reference')
    require(data['profile_id'] == wanted['fulfillment']['required_profile'], 'Wrong analysis profile')
    require(support['status'] == 'sufficient', 'Insufficient or unknown scope support')
    require(set(wanted['scope']['genes']) <= set(support['evaluated_genes']), 'Requested gene is unsupported')
    require(set(wanted['scope']['variant_classes']) <= set(support['supported_variant_classes']), 'Requested variant class is unsupported')
    require(bool(support['evidence']), 'Missing analysis-support evidence')


def physical_available(ref, at):
    item = resolve(ref)
    history = [obj for (oid, rev), obj in snapshots.items() if oid == item['object_id'] and obj['created_at'] <= at]
    current = max(history, key=lambda obj: obj['revision'])
    require(current['revision'] == ref['revision'], 'Stale physical snapshot')
    require(current['data']['state'] not in ['consumed', 'unavailable'], 'Physical item is unavailable')
    require(current['data']['quantity']['value'] > 0, 'No remaining material')


def contract_integrity(service):
    request = service['sample_request']
    result = service['sample_result']
    validate_request(service, request)
    require(result['request_id'] == request['request_id'], 'Result belongs to another request')
    require(service['provider_id'] in provider_map, 'Unknown provider')
    require(service['service_id'] in provider_map[service['provider_id']]['service_ids'], 'Provider service list mismatch')
    require(service['sample_form_data'] == service['sample_form_object']['data'], 'Form copies differ')
    require(resolve(request['form_ref']) == service['sample_form_object'], 'Resolved form differs')
    requested_at = form_values(resolve(request['form_ref'])['data'])['requested_at']
    inputs = {item['role']: resolve(item['object_ref']) for item in request['inputs']}
    for slot in request['inputs']:
        obj = resolve(slot['object_ref'])
        require(obj['created_at'] <= requested_at, 'Input created after request')
        if types[obj['object_type']]['nature'] == 'physical':
            physical_available(slot['object_ref'], requested_at)
    slots = {slot['role']: slot for slot in service['output_slots']}
    require(set(slots) == {item['role'] for item in result['outputs']}, 'Missing or unexpected output role')
    expected_refs = [request['form_ref']] + [item['object_ref'] for item in request['inputs']]
    for item in result['outputs']:
        obj = resolve(item['object_ref'])
        slot = slots[item['role']]
        expected = slot['object_type']
        if expected.startswith('same_as:'):
            source = inputs[expected.split(':')[1]]
            require(obj['object_id'] == source['object_id'] and obj['revision'] == source['revision'] + 1, 'Incorrect physical revision identity')
            expected = source['object_type']
        require(obj['object_type'] == expected, 'Wrong output type')
        require(obj['created_by'] == service['provider_id'], 'Wrong output provider')
        require(obj['created_at'] >= requested_at, 'Output predates request')
        require(obj['input_refs'] == expected_refs, 'Missing generated output lineage')
    if 'test_order' in inputs:
        order = inputs['test_order']
        for obj in inputs.values():
            if 'analysis_support' in obj['data']:
                compatible(order, obj)


check('fixed_registry_counts', lambda: require(len(types) == 20 and len(service_map) == 15 and len(provider_map) == 6, 'Registry counts differ'))
for key, item in snapshots.items():
    check('object_schema:' + str(key), lambda item=item: validate_schema(schemas[item['object_type']], item))
    check('object_references:' + str(key), lambda item=item: [resolve(ref) for ref in refs(item)])
    for descriptor in item['files']:
        def file_check(descriptor=descriptor):
            path = ROOT / descriptor['path']
            require(path.is_file(), 'Missing native payload')
            require(path.stat().st_size == descriptor['size_bytes'], 'Incorrect byte count')
            require(hashlib.sha256(path.read_bytes()).hexdigest() == descriptor['sha256'], 'Incorrect SHA-256')
        check('file_integrity:' + descriptor['path'], file_check)
for service in services:
    check('service_contract:' + service['service_id'], lambda service=service: contract_integrity(service))
    for schema_name, instance in [('service-definition', service), ('form-shape', service['form_shape']), ('service-request', service['sample_request']), ('service-result', service['sample_result'])]:
        check(schema_name + ':' + service['service_id'], lambda schema_name=schema_name, instance=instance: validate_schema(read('schemas/protocol/' + schema_name + '.schema.json'), instance))
for provider in providers:
    check('provider_schema:' + provider['provider_id'], lambda provider=provider: validate_schema(read('schemas/protocol/provider-definition.schema.json'), provider))
for obj in objects:
    check('svg_asset:' + obj['id'], lambda obj=obj: ElementTree.parse(ROOT / 'icons' / (obj['id'] + '.svg')))


def native_files():
    import pysam
    from flowio import FlowData
    from pypdf import PdfReader
    with pysam.FastxFile(str(ROOT / 'payloads/demo.fastq')) as stream:
        reads = list(stream)
    require(len(reads) == 3 and all(len(row.sequence) == len(row.quality) == 20 for row in reads), 'FASTQ fixture mismatch')
    with pysam.FastxFile(str(ROOT / 'payloads/demo.fasta')) as stream:
        fasta = list(stream)
    require(len(fasta) == 1 and len(fasta[0].sequence) == 1000, 'FASTA fixture mismatch')
    with pysam.AlignmentFile(str(ROOT / 'payloads/demo.bam'), 'rb') as stream:
        require(stream.has_index(), 'Missing BAM index')
        alignments = list(stream.fetch())
    require(len(alignments) == 3 and [row.query_sequence for row in alignments] == [row.sequence for row in reads], 'BAM and FASTQ disagree')
    records = {}
    for name in ['unannotated', 'annotated']:
        with pysam.VariantFile(str(ROOT / ('payloads/demo-' + name + '.vcf'))) as stream:
            require(list(stream.header.samples) == ['subject_demo_001'], 'VCF subject mismatch')
            records[name] = list(stream)
        require(len(records[name]) == 3, 'VCF fixture count mismatch')
    require([row.pos for row in records['unannotated']] == [row.pos for row in records['annotated']], 'Annotation changed loci')
    pgi = resolve({'object_id': 'obj_demo_interactive', 'revision': 1})['data']
    for row, finding in zip(records['annotated'], pgi['findings']):
        variant = finding['variant']
        require((row.contig, row.pos, row.ref, row.alts[0]) == (variant['contig'], variant['position'], variant['reference'], variant['alternate']), 'PGI and VCF variants disagree')
        require(row.info['PGGENE'] == finding['gene_id'], 'PGI and VCF genes disagree')
        require(tuple(row.samples['subject_demo_001']['GT']) == (1, 1) and finding['genotype'] == '1/1', 'Genotype mismatch')
    flow = FlowData(str(ROOT / 'payloads/demo.fcs'))
    require(flow.event_count == 4 and flow.channel_count == 3, 'FCS event/channel mismatch')
    pdf = PdfReader(ROOT / 'payloads/demo-report.pdf')
    require(len(pdf.pages) == 1, 'PDF page count mismatch')
    content = '\n'.join(page.extract_text() for page in pdf.pages)
    order = resolve({'object_id': 'obj_demo_order', 'revision': 1})['data']
    for required in [order['patient']['full_name'], order['objective'], order['clinical_suspicion'], 'Clarity Report Studio', *order['scope']['genes']]:
        require(required in content, 'Missing standalone report content: ' + required)
    require(len(PdfReader(ROOT / 'payloads/demo-form-report.pdf').pages) == 1, 'Form PDF page count mismatch')


check('native_payload_parsing_and_consistency', native_files)


def semantic_fixtures():
    order = resolve({'object_id': 'obj_demo_order', 'revision': 1})
    consent = resolve(order['data']['consent_ref'])
    form = form_values(resolve(consent['data']['source_form_ref'])['data'])
    require(consent['data']['status'] == 'completed' and form['accepted'] is True, 'Consent is incomplete')
    require(consent['data']['text_version'] == form['consent_text_version'], 'Consent version mismatch')
    require(consent['data']['acceptance']['evidence_reference'] == form['signature_evidence_id'], 'Consent evidence mismatch')
    require(consent['data']['subject_id'] == order['data']['patient']['subject_id'], 'Consent subject mismatch')
    require(set(order['data']['scope']['genes']) <= set(consent['data']['scope']['genes']), 'Order exceeds consent scope')
    for object_id in ['obj_demo_fastq', 'obj_demo_bam', 'obj_demo_unannotated_vcf', 'obj_demo_annotated_vcf', 'obj_demo_interactive']:
        compatible(order, resolve({'object_id': object_id, 'revision': 1}))
    require(resolve({'object_id': 'obj_demo_blood', 'revision': 3})['data']['state'] == 'consumed', 'Missing blood consumption')
    require(resolve({'object_id': 'obj_demo_dna', 'revision': 2})['data']['quantity']['value'] == 0, 'Missing DNA consumption')
    interpretation = service_map['pgs_interactive_interpretation']
    require(all('pgo_bundle_of_symptoms' not in slot['accepted_types'] for slot in interpretation['input_slots']), 'PGI unexpectedly requires symptoms')


check('consent_scope_and_physical_consumption', semantic_fixtures)


def counterexamples():
    service = service_map['pgs_informed_consent']
    form = copy.deepcopy(service['sample_form_object'])
    form['data']['fields'].append(copy.deepcopy(form['data']['fields'][0]))
    reject(lambda: validate_form(service, form))
    form = copy.deepcopy(service['sample_form_object'])
    next(field for field in form['data']['fields'] if field['key'] == 'signer_capacity')['value'] = 'invalid_option'
    reject(lambda: validate_form(service, form))
    ordering = service_map['pgs_test_ordering']
    request = copy.deepcopy(ordering['sample_request'])
    request['inputs'] = [item for item in request['inputs'] if resolve(item['object_ref'])['object_type'] != 'pgo_informed_consent']
    reject(lambda: validate_request(ordering, request))
    pgi_service = service_map['pgs_interactive_interpretation']
    request = copy.deepcopy(pgi_service['sample_request'])
    request['inputs'][0]['object_ref'] = {'object_id': 'obj_demo_unannotated_vcf', 'revision': 1}
    reject(lambda: validate_request(pgi_service, request))
    order = resolve({'object_id': 'obj_demo_order', 'revision': 1})
    result = copy.deepcopy(resolve({'object_id': 'obj_demo_interactive', 'revision': 1}))
    result['data']['analysis_support']['evaluated_genes'].pop()
    reject(lambda: compatible(order, result))
    result = copy.deepcopy(resolve({'object_id': 'obj_demo_interactive', 'revision': 1}))
    result['data']['subject_id'] = 'subject_other'
    reject(lambda: compatible(order, result))
    reject(lambda: physical_available({'object_id': 'obj_demo_blood', 'revision': 2}, '2026-09-18T12:00:00Z'))
    whole_embryo = resolve({'object_id': 'obj_demo_whole_embryo', 'revision': 1})
    reject(lambda: require(whole_embryo['data']['material_kind'] == 'embryo_biopsy', 'Extraction rejects whole embryo'))
    annotation = service_map['pgs_variant_annotation']
    request = copy.deepcopy(annotation['sample_request'])
    request['inputs'] = [item for item in request['inputs'] if item['role'] != 'test_order']
    validate_request(annotation, request)
    for object_type, source_key in [('pgo_sequence_reads', 'source_sample_ref'), ('pgo_sequence_data', 'source_object_ref'), ('pgo_aligned_reads', 'source_reads_ref'), ('pgo_unannotated_vcf', 'source_object_ref'), ('pgo_annotated_vcf', 'source_vcf_ref'), ('pgo_interactive_report', 'source_variants_ref')]:
        imported = copy.deepcopy(types[object_type]['example'])
        imported['input_refs'] = []
        imported['data'].pop(source_key, None)
        imported['data'].pop('order_ref', None)
        imported['data']['provenance'] = {'source_kind': 'imported', 'source_label': 'External synthetic fixture', 'imported_at': '2026-09-18T12:00:00Z'}
        validate_schema(schemas[object_type], imported)


check('eight_negative_and_seven_independent_entry_examples', counterexamples)


def documentation():
    text = (ROOT / 'Pocket-Genes-Wiki.md').read_text()
    require(len(re.findall(r'^```', text, re.M)) % 2 == 0, 'Unbalanced code fences')
    for payload in re.findall(r'^```json\s*\n(.*?)^```', text, re.M | re.S):
        json.loads(payload)
    for folder, count in [('objects', 20), ('services', 15), ('providers', 6)]:
        require(len(list((ROOT / folder).glob('*.md'))) == count, 'Missing wiki pages: ' + folder)


check('wiki_json_examples_and_pages', documentation)
report = {
    'status': 'passed' if all(item['status'] == 'passed' for item in checks) else 'failed',
    'object_types': len(types), 'services': len(services), 'providers': len(providers),
    'object_snapshots': len(snapshots), 'checks_run': len(checks),
    'scope': 'Structural, reference, contract and native-fixture checks. Synthetic analytical support declarations are not clinical validation.',
    'checks': checks
}
(ROOT / 'validation-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: value for key, value in report.items() if key != 'checks'}, indent=2))
for failure in [item for item in checks if item['status'] == 'failed']:
    print(json.dumps(failure))
sys.exit(0 if report['status'] == 'passed' else 1)
