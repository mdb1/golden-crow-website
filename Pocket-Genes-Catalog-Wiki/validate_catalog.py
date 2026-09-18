import copy
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

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
    except (ValueError, KeyError, ValidationError):
        return
    raise ValueError('Invalid counterexample was accepted')


objects = read('catalog/objects.json')['objects']
services_catalog = read('catalog/services.json')
services = services_catalog['services']
providers = read('catalog/providers.json')['providers']
usage_policy = read('catalog/usage-policy.json')
PGI_NATIVE_FORMATS = {
    '.pgi1.json': {
        'api_model': 'MDMAPIModel',
        'schema_path': 'schemas/protocol/pgi1-mdm.schema.json',
        'provider_format': 'mdm',
        'media_type': 'application/vnd.pocketgenes.pgi1+json'
    },
    '.pgi2.json': {
        'api_model': 'AGAPIModel',
        'schema_path': 'schemas/protocol/pgi2-ag.schema.json',
        'provider_format': 'ag',
        'media_type': 'application/vnd.pocketgenes.pgi2+json'
    },
    '.pgi3.json': {
        'api_model': 'TwoPQAPIModel',
        'schema_path': 'schemas/protocol/pgi3-2pq.schema.json',
        'provider_format': '2pq',
        'media_type': 'application/vnd.pocketgenes.pgi3+json'
    }
}
pgi_schemas = {extension: read(config['schema_path']) for extension, config in PGI_NATIVE_FORMATS.items()}
types = {item['id']: item for item in objects}
service_map = {item['serviceId']: item for item in services}
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


def minimal_instance(schema, root=None):
    root = root or schema
    if '$ref' in schema:
        ref = schema['$ref']
        prefix = '#/$defs/'
        require(ref.startswith(prefix), 'Unsupported schema ref: ' + ref)
        return minimal_instance(root['$defs'][ref[len(prefix):]], root)
    if 'const' in schema:
        return schema['const']
    if 'enum' in schema:
        return schema['enum'][0]
    if 'oneOf' in schema:
        return minimal_instance(schema['oneOf'][0], root)
    if 'anyOf' in schema:
        choices = [choice for choice in schema['anyOf'] if choice.get('type') != 'null']
        return minimal_instance(choices[0] if choices else schema['anyOf'][0], root)
    kind = schema.get('type')
    if isinstance(kind, list):
        kind = next(item for item in kind if item != 'null')
    if kind == 'object':
        required = schema.get('required', [])
        return {
            key: minimal_instance(schema['properties'][key], root)
            for key in required
            if key in schema.get('properties', {})
        }
    if kind == 'array':
        count = schema.get('minItems', 0)
        return [minimal_instance(schema.get('items', {}), root) for _ in range(count)]
    if kind == 'string':
        return 'x'
    if kind == 'integer':
        return max(1, schema.get('minimum', 1))
    if kind == 'number':
        return float(max(1, schema.get('minimum', 1)))
    if kind == 'boolean':
        return True
    if kind == 'null':
        return None
    return {}


def require_pgi_native_format(native_format):
    require(set(native_format) == {'extension', 'api_model', 'schema_path', 'provider_format', 'model_version'}, 'PGI native_format has unexpected keys')
    extension = native_format['extension']
    require(extension in PGI_NATIVE_FORMATS, 'Unknown PGI extension')
    expected = PGI_NATIVE_FORMATS[extension]
    for key in ['api_model', 'schema_path', 'provider_format']:
        require(native_format[key] == expected[key], 'PGI native_format mismatch for ' + key)
    require(isinstance(native_format['model_version'], str) and native_format['model_version'], 'PGI model_version is required')


def require_pgi_payload_descriptor(native_format, payload_ref):
    extension = native_format['extension']
    expected = PGI_NATIVE_FORMATS[extension]
    require(payload_ref['path'].endswith(extension), 'PGI payload path extension mismatch')
    require(payload_ref['media_type'] == expected['media_type'], 'PGI media type mismatch')


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
    require('formShape' in service, 'Form input requires a formShape')
    shape = service['formShape']
    require(isinstance(shape['version'], int) and shape['version'] >= 1, 'Form shape version must be an integer')
    require(shape.get('allowUnknownFields') is False, 'allowUnknownFields must be false')
    data = form['data']
    require(data['form_shape_id'] == shape['id'] and data['form_shape_version'] == shape['version'], 'Form shape/version mismatch')
    values = form_values(data)
    require(len(values) == len(data['fields']), 'Duplicate form fields')
    fields = {field['key']: field for field in shape['fields']}
    require(not (set(values) - set(fields)), 'Unknown form field')
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
    require(request['service_id'] == service['serviceId'] and request['service_version'] == service['serviceVersion'], 'Service/version mismatch')
    require('form_ref' not in request, 'form_ref is not a transaction field; pgo_form must be an input slot')
    slots = {slot['role']: slot for slot in service['inputSlots']}
    counts = Counter(item['role'] for item in request['inputs'])
    require(set(counts) <= set(slots), 'Unexpected input role')
    for role, slot in slots.items():
        require(slot['cardinality']['min'] <= counts[role] <= slot['cardinality']['max'], 'Wrong input cardinality: ' + role)
    for item in request['inputs']:
        obj = resolve(item['object_ref'])
        require(obj['object_type'] == slots[item['role']]['objectType'], 'Wrong object type for role: ' + item['role'])
        if obj['object_type'] == 'pgo_form':
            validate_form(service, form or obj)


def role_for_object_type(object_type):
    return 'form' if object_type == 'pgo_form' else object_label(object_type)


def object_label(object_type):
    return object_type[4:] if object_type.startswith('pgo_') else object_type


def calculated_short_contract(service):
    inputs = service['inputSlots']
    input_text = 'none' if not inputs else ' + '.join(
        slot['role'] + ':' + object_label(slot['objectType'])
        for slot in inputs
    )
    output_text = ' + '.join(
        slot['role'] + ':' + object_label(slot['objectType'])
        for slot in service['outputSlots']
    )
    return input_text + ' -> ' + output_text


PLANNING_OUTPUTS = {
    'pgo_bundle_of_symptoms',
    'pgo_bundle_of_candidate_genes',
    'pgo_informed_consent',
    'pgo_test_order'
}
LAB_OUTPUTS = {
    'pgo_collection_request',
    'pgo_blood_sample',
    'pgo_tissue_sample',
    'pgo_embryo_sample',
    'pgo_dna_sample',
    'pgo_sequence_reads',
    'pgo_sequence_data'
}
BIOINFORMATICS_OUTPUTS = {
    'pgo_aligned_reads',
    'pgo_unannotated_vcf',
    'pgo_annotated_vcf',
    'pgo_interactive_report',
    'pgo_karyotype_result',
    'pgo_flow_cytometry_data'
}


def stage_for_object_type(object_type):
    if object_type in PLANNING_OUTPUTS:
        return 'test_planning'
    if object_type in LAB_OUTPUTS:
        return 'wet_lab'
    if object_type in BIOINFORMATICS_OUTPUTS:
        return 'bioinformatics'
    return None


def predicted_stages(service):
    input_stages = {
        stage_for_object_type(slot['objectType'])
        for slot in service['inputSlots']
        if slot['objectType'] != 'pgo_form'
    }
    input_stages.discard(None)
    stages = set()
    for slot in service['outputSlots']:
        object_type = slot['objectType']
        if object_type == 'pgo_pdf_report':
            if 'bioinformatics' in input_stages:
                stages.add('bioinformatics')
            elif 'wet_lab' in input_stages:
                stages.add('wet_lab')
            else:
                stages.add('test_planning')
            continue
        stage = stage_for_object_type(object_type)
        if stage:
            stages.add(stage)
    if not stages:
        stages = input_stages
    return stages or {'test_planning'}


def service_contract_rules(service):
    require(isinstance(service['serviceVersion'], int) and service['serviceVersion'] >= 1, 'Service version must be an integer')
    require(service['status'] == 'active', 'Catalog offers must be active')
    require(service['providerKind'] in ['organization', 'individual'], 'Invalid provider kind')
    require(service['providerId'] in provider_map, 'Unknown provider')
    require(service['serviceId'] in provider_map[service['providerId']]['service_ids'], 'Provider service list mismatch')
    require(service['description'] and service['providerWork'], 'description and providerWork are required')
    require(service['description'] != service['providerWork'], 'description and providerWork must be distinct')
    require(service['shortContract'] == calculated_short_contract(service), 'shortContract must be calculated from slots')
    require(service['stages'], 'At least one stage must be selected')
    require(set(service['stages']) & predicted_stages(service), 'Selected stages do not match the calculated pipeline')
    require(service['outputSlots'], 'Service must declare at least one output slot')

    form_slots = []
    object_types = []
    for slot in service['inputSlots']:
        accepted = slot['acceptedTypes']
        require(len(accepted) == 1 and accepted[0] == slot['objectType'], 'acceptedTypes must contain exactly objectType: ' + slot['role'])
        require(slot['required'] is True, 'Input slots are always required: ' + slot['role'])
        require(slot['cardinality'] == {'min': 1, 'max': 1}, 'Input cardinality must be 1:1: ' + slot['role'])
        require(slot['role'] == role_for_object_type(slot['objectType']), 'Input role must be generated from objectType: ' + slot['role'])
        object_types.append(slot['objectType'])
        if slot['objectType'] == 'pgo_form':
            form_slots.append(slot)
    require(len(object_types) == len(set(object_types)), 'Duplicate input object types are not allowed')

    for slot in service['outputSlots']:
        require(slot['objectType'] != 'pgo_form', 'pgo_form cannot be an output type')
        require(slot['role'], 'Output role is required')
        require(slot['mutationMode'] in ['new_object', 'new_revision'], 'Invalid output mutationMode')

    has_form_shape = 'formShape' in service
    require(bool(form_slots) == has_form_shape, 'pgo_form input slots and formShape must appear together')
    if has_form_shape:
        require(len(form_slots) == 1, 'Only one pgo_form input slot is allowed')
        shape = service['formShape']
        require(shape['id'] == 'pgfs_' + service['serviceId'][4:], 'Form shape id must derive from service id')
        require(isinstance(shape['version'], int) and shape['version'] >= 1, 'Form shape version must be an integer')
        require(shape.get('allowUnknownFields') is False, 'allowUnknownFields must be false')
        keys = [field['key'] for field in shape['fields']]
        require(len(keys) == len(set(keys)), 'Duplicate form field keys')
        require({'requested_at', 'requested_by'} <= set(keys), 'Missing base form fields')
    else:
        require(all(slot['objectType'] != 'pgo_form' for slot in service['inputSlots']), 'pgo_form input requires Support form input/formShape')

    terms = service.get('commercialTerms')
    if terms:
        model = terms.get('pricingModel')
        if model:
            require(model in ['not_specified', 'free', 'fixed', 'calculated_after_submission'], 'Invalid pricing model')
        if model == 'fixed':
            price = terms.get('price', {})
            require('amount' in price and 'currency' in price, 'Fixed price requires amount and currency')
        if 'turnaround' in terms:
            require(re.match(r'^[1-9][0-9]*(w|d|h|m)$', terms['turnaround']), 'Turnaround must be compact: ' + terms['turnaround'])


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
    service_contract_rules(service)
    request = service['sampleRequest']
    result = service['sampleResult']
    validate_request(service, request)
    require(result['request_id'] == request['request_id'], 'Result belongs to another request')
    form_input = next((item for item in request['inputs'] if resolve(item['object_ref'])['object_type'] == 'pgo_form'), None)
    if 'formShape' in service:
        require(form_input is not None, 'Missing pgo_form input')
        form_object = resolve(form_input['object_ref'])
        form_data = service['sampleFormData']
        require(form_data['formShapeId'] == form_object['data']['form_shape_id'], 'Form shape id copy differs')
        require(form_data['formShapeVersion'] == form_object['data']['form_shape_version'], 'Form shape version copy differs')
        require(form_data['fields'] == form_object['data']['fields'], 'Form field copies differ')
        require(form_object == service['sampleFormObject'], 'Resolved form differs')
        requested_at = form_values(form_object['data'])['requested_at']
    else:
        requested_at = request.get('received_at', '9999-12-31T23:59:59Z')
    inputs = {item['role']: resolve(item['object_ref']) for item in request['inputs']}
    for slot in request['inputs']:
        obj = resolve(slot['object_ref'])
        require(obj['created_at'] <= requested_at, 'Input created after request')
        if types[obj['object_type']]['nature'] == 'physical':
            physical_available(slot['object_ref'], requested_at)
    slots = {slot['role']: slot for slot in service['outputSlots']}
    require(set(slots) == {item['role'] for item in result['outputs']}, 'Missing or unexpected output role')
    expected_refs = [item['object_ref'] for item in request['inputs']]
    for item in result['outputs']:
        obj = resolve(item['object_ref'])
        slot = slots[item['role']]
        expected = slot['objectType']
        if expected.startswith('same_as:'):
            source = inputs[expected.split(':')[1]]
            require(obj['object_id'] == source['object_id'] and obj['revision'] == source['revision'] + 1, 'Incorrect physical revision identity')
            expected = source['object_type']
        require(obj['object_type'] == expected, 'Wrong output type')
        require(obj['created_by'] == service['providerId'], 'Wrong output provider')
        require(obj['created_at'] >= requested_at, 'Output predates request')
        require(obj['input_refs'] == expected_refs, 'Missing generated output lineage')
    if 'test_order' in inputs:
        order = inputs['test_order']
        for obj in inputs.values():
            if 'analysis_support' in obj['data']:
                compatible(order, obj)


check('fixed_registry_counts', lambda: require(len(types) == 20 and len(service_map) == 15 and len(provider_map) == 6, 'Registry counts differ'))


def token_usage_policy():
    validate_schema(read('schemas/protocol/token-usage-policy.schema.json'), usage_policy)
    require(services_catalog['usagePolicyRef']['policyId'] == usage_policy['policy_id'], 'Services catalog usage policy mismatch')
    require(services_catalog['usagePolicyRef']['path'] == 'catalog/usage-policy.json', 'Services catalog usage policy path mismatch')
    defaults = usage_policy['token_status_defaults']
    require(defaults == {
        'token_balance': 20,
        'max_token_usage_per_day': 5,
        'cooldown_seconds': 300,
        'next_request_at': None
    }, 'Token defaults changed')
    require(usage_policy['calendar_timezone'] == 'UTC', 'Daily usage timezone must be UTC in v1')
    require(usage_policy['token_model']['tokens_consumed_per_admitted_transaction'] == 1, 'Each admitted transaction must consume one token')
    require(usage_policy['token_model']['automatic_replenishment'] == 'none', 'Automatic token replenishment is not allowed')
    accounting = usage_policy['transaction_accounting']
    require(accounting['authoritative_collection'] == 'service_transactions', 'Wrong transaction collection')
    require(accounting['charged_account_field'] == 'charged_user_id', 'Wrong charged account field')
    require(accounting['consumed_at_field'] == 'token_consumed_at', 'Wrong consumed timestamp field')
    require(accounting['refunded_at_field'] == 'token_refunded_at', 'Wrong refunded timestamp field')
    require(accounting['daily_count_source'] == 'global_service_transactions', 'Daily usage must be computed from global transactions')
    gate = usage_policy['admission_gate']
    require(gate['must_run_before_provider_dispatch'], 'Admission gate must run before provider dispatch')
    require(gate['must_resolve_idempotency_before_new_consumption'], 'Idempotency must resolve before token consumption')
    pipeline = usage_policy['pipeline_policy']
    require(pipeline['planning_consumes_tokens'] is False, 'Pipeline planning must not consume tokens')
    require(pipeline['each_admitted_service_step_consumes_tokens'], 'Each admitted pipeline service step must consume a token')
    require(pipeline['combined_published_service_consumes_tokens'] == 1, 'Combined published service must consume one token')
    require(pipeline['blocked_step_state'] == 'waiting_for_limits', 'Wrong blocked pipeline state')
    require(set(usage_policy['stable_error_codes']) == {
        'token_balance_exhausted',
        'token_daily_limit_reached',
        'token_cooldown_active'
    }, 'Stable token error codes differ')


check('token_usage_policy', token_usage_policy)


def pgi_native_schemas():
    for extension, schema in pgi_schemas.items():
        Draft202012Validator.check_schema(schema)
        title = schema['title']
        if extension == '.pgi1.json':
            require('MDMAPIModel' in title, 'PGI1 schema must target MDMAPIModel')
        elif extension == '.pgi2.json':
            require('AGAPIModel' in title, 'PGI2 schema must target AGAPIModel')
        elif extension == '.pgi3.json':
            require('TwoPQAPIModel' in title, 'PGI3 schema must target TwoPQAPIModel')
        valid_minimal = minimal_instance(schema)
        validate_schema(schema, valid_minimal)
        with_unknown_root = copy.deepcopy(valid_minimal)
        with_unknown_root['unexpected_root_field'] = True
        reject(lambda schema=schema, item=with_unknown_root: validate_schema(schema, item))
        missing_required = copy.deepcopy(valid_minimal)
        missing_required.pop(next(iter(schema['$defs'][schema['$ref'].split('/')[-1]]['required'])))
        reject(lambda schema=schema, item=missing_required: validate_schema(schema, item))


check('pgi_native_schemas', pgi_native_schemas)
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
    check('service_contract:' + service['serviceId'], lambda service=service: contract_integrity(service))
    schema_instances = [
        ('service-definition', service),
        ('service-request', service['sampleRequest']),
        ('service-result', service['sampleResult'])
    ]
    if 'formShape' in service:
        schema_instances.insert(1, ('form-shape', service['formShape']))
    for schema_name, instance in schema_instances:
        check(schema_name + ':' + service['serviceId'], lambda schema_name=schema_name, instance=instance: validate_schema(read('schemas/protocol/' + schema_name + '.schema.json'), instance))
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
    pgi = resolve({'object_id': 'obj_demo_interactive', 'revision': 1})
    pgi_data = pgi['data']
    native_format = pgi_data['native_format']
    require_pgi_native_format(native_format)
    payload_ref = pgi_data['payload_ref']
    require_pgi_payload_descriptor(native_format, payload_ref)
    payload_path = ROOT / payload_ref['path']
    payload = json.loads(payload_path.read_text())
    validate_schema(pgi_schemas[native_format['extension']], payload)
    require(payload_ref in pgi['files'], 'PGI payload descriptor missing from files')
    require(hashlib.sha256(payload_path.read_bytes()).hexdigest() == payload_ref['sha256'], 'PGI payload checksum mismatch')
    require(len(payload['variants']) == len(records['annotated']), 'PGI1 variant count does not match annotated VCF fixture')
    for row, variant in zip(records['annotated'], payload['variants']):
        require((row.contig, row.pos, row.ref, row.alts[0]) == (variant['chrom'], variant['position'], variant['reference'], variant['alternate']), 'PGI1 and VCF variants disagree')
        require(row.info['PGGENE'] in pgi_data['analysis_support']['evaluated_genes'], 'PGI1 support genes do not include annotated VCF gene')
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
    require(all(slot['objectType'] != 'pgo_bundle_of_symptoms' for slot in interpretation['inputSlots']), 'PGI unexpectedly requires symptoms')


check('consent_scope_and_physical_consumption', semantic_fixtures)


def counterexamples():
    service = service_map['pgs_informed_consent']
    form = copy.deepcopy(service['sampleFormObject'])
    form['data']['fields'].append(copy.deepcopy(form['data']['fields'][0]))
    reject(lambda: validate_form(service, form))
    form = copy.deepcopy(service['sampleFormObject'])
    next(field for field in form['data']['fields'] if field['key'] == 'signer_capacity')['value'] = 'invalid_option'
    reject(lambda: validate_form(service, form))
    ordering = service_map['pgs_test_ordering']
    request = copy.deepcopy(ordering['sampleRequest'])
    request['inputs'] = [item for item in request['inputs'] if resolve(item['object_ref'])['object_type'] != 'pgo_informed_consent']
    reject(lambda: validate_request(ordering, request))
    pgi_service = service_map['pgs_interactive_interpretation']
    request = copy.deepcopy(pgi_service['sampleRequest'])
    request['inputs'][0]['object_ref'] = {'object_id': 'obj_demo_unannotated_vcf', 'revision': 1}
    reject(lambda: validate_request(pgi_service, request))
    order = resolve({'object_id': 'obj_demo_order', 'revision': 1})
    result = copy.deepcopy(resolve({'object_id': 'obj_demo_interactive', 'revision': 1}))
    result['data']['analysis_support']['evaluated_genes'].pop()
    reject(lambda: compatible(order, result))
    result = copy.deepcopy(resolve({'object_id': 'obj_demo_interactive', 'revision': 1}))
    result['data']['subject_id'] = 'subject_other'
    reject(lambda: compatible(order, result))
    pgi = copy.deepcopy(resolve({'object_id': 'obj_demo_interactive', 'revision': 1}))
    pgi['data']['native_format']['api_model'] = 'AGAPIModel'
    reject(lambda: validate_schema(schemas['pgo_interactive_report'], pgi))
    pgi = copy.deepcopy(resolve({'object_id': 'obj_demo_interactive', 'revision': 1}))
    pgi['data']['payload_ref']['media_type'] = 'application/json'
    reject(lambda: validate_schema(schemas['pgo_interactive_report'], pgi))
    reject(lambda: physical_available({'object_id': 'obj_demo_blood', 'revision': 2}, '2026-09-18T12:00:00Z'))
    whole_embryo = resolve({'object_id': 'obj_demo_whole_embryo', 'revision': 1})
    reject(lambda: require(whole_embryo['data']['material_kind'] == 'embryo_biopsy', 'Extraction rejects whole embryo'))
    annotation = service_map['pgs_variant_annotation']
    request = copy.deepcopy(annotation['sampleRequest'])
    request['inputs'] = [item for item in request['inputs'] if item['role'] != 'test_order']
    reject(lambda: validate_request(annotation, request))
    bad_service = copy.deepcopy(service_map['pgs_informed_consent'])
    bad_service['inputSlots'][0]['role'] = 'request_form'
    reject(lambda: service_contract_rules(bad_service))
    bad_service = copy.deepcopy(annotation)
    duplicate = copy.deepcopy(bad_service['inputSlots'][1])
    duplicate['role'] = 'unannotated_vcf_copy'
    bad_service['inputSlots'].append(duplicate)
    reject(lambda: service_contract_rules(bad_service))
    bad_service = copy.deepcopy(annotation)
    bad_service['shortContract'] = 'free text is not allowed'
    reject(lambda: service_contract_rules(bad_service))
    bad_service = copy.deepcopy(annotation)
    bad_service['stages'] = []
    reject(lambda: service_contract_rules(bad_service))
    bad_service = copy.deepcopy(annotation)
    bad_service['status'] = 'draft'
    reject(lambda: service_contract_rules(bad_service))
    bad_service = copy.deepcopy(annotation)
    bad_service['commercialTerms'] = {'pricingModel': 'fixed', 'turnaround': '1d'}
    reject(lambda: service_contract_rules(bad_service))
    bad_service = copy.deepcopy(annotation)
    bad_service['outputSlots'][0]['objectType'] = 'pgo_form'
    reject(lambda: service_contract_rules(bad_service))
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
