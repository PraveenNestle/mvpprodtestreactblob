#!/usr/bin/env python3
"""
Stability Data Collection Tool - schema generator (Azure Blob Storage is the only data store).

Reads the single source of truth (field_catalog.csv, vocabularies.csv, domains.csv, templates.json)
and emits everything downstream that must stay in sync with it:

  out/blob/observation.schema.json        JSON Schema for the observation document (observations container)
  out/blob/template.schema.json           JSON Schema for template documents (config container)
  out/blob/reference_bundle.schema.json   JSON Schema for the reference data bundle (reference container)
  out/blob/curated_datasets.json          column definitions of the curated NDJSON datasets (the "tables" Power BI reads)
  out/blob/BLOB_LAYOUT.md                 containers, paths, naming, versioning, indexes: the Blob equivalent of DDL
  out/powerbi/power_query_blob.m          Power Query (M): reference tables, current observations, one column per field,
                                          defect incidence, plan progress, media coverage, audit
  out/SCHEMA_SUMMARY.md                   counts, field list, traceability
  ../../frontend/src/data/catalog.json    consumed by the React app
  ../api/src/data/catalog.json            consumed by the Express API validator (+ the two JSON Schemas)

Usage:  python3 generate_schema.py [--out out]
"""
import argparse
import csv
import json
import os
import shutil
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))

# Header fields live on the observation document header (and the observation_header dataset); everything else is a typed row in values[] / observation_value.
HEADER_FIELDS = OrderedDict([
    ("project_code", "PROJECT_CODE"),
    ("ar_number", "AR_NUMBER"),
    ("trial_number", "TRIAL_NUMBER"),
    ("variant_number", "VARIANT_NUMBER"),
    ("sample_code", "SAMPLE_CODE"),
    ("time_point", "TIME_POINT_CODE"),
    ("temperature_condition", "CONDITION_CODE"),
    ("formulation_class", "FORMULATION_CLASS"),
    ("result_type", "RESULT_TYPE"),
    ("observer_user_id", "OBSERVER_USER_ID"),
    ("observation_timestamp", "OBSERVED_AT"),
    ("test_status", "TEST_STATUS"),
    ("overall_result", "OVERALL_RESULT"),
])

DATA_TYPES = ["ref", "text", "longtext", "boolean", "integer", "number", "percent", "select", "code", "multiselect", "datetime", "media_photo", "media_video", "guidance"]
# Power Query (M) type per catalog data type, used when pivoting observation_value into one column per field
PQ_TYPES = {
    "ref": "type text", "text": "type text", "longtext": "type text", "boolean": "type logical", "integer": "Int64.Type",
    "number": "type number", "percent": "type number", "select": "type text", "code": "type text", "multiselect": "type text",
    "datetime": "type datetimezone", "media_photo": "type text", "media_video": "type text", "guidance": "type logical",
}
# Days after the plan start for each standard time point (also used by the API and the React app)
TIME_POINT_OFFSET_DAYS = OrderedDict([("T0", 0), ("1D", 1), ("1W", 7), ("2W", 14), ("1M", 30), ("2M", 61), ("3M", 91), ("4M", 122), ("6M", 182), ("9M", 273), ("12M", 365), ("15M", 456), ("18M", 548)])
JSON_TYPES = {
    "ref": {"type": "string", "maxLength": 64}, "text": {"type": "string", "maxLength": 500},
    "longtext": {"type": "string", "maxLength": 4000}, "boolean": {"type": "boolean"},
    "integer": {"type": "integer"}, "number": {"type": "number"}, "percent": {"type": "number", "minimum": 0, "maximum": 100},
    "select": {"type": "string", "maxLength": 64}, "code": {"type": "string", "maxLength": 64},
    "multiselect": {"type": "array", "items": {"type": "string", "maxLength": 64}, "uniqueItems": True},
    "datetime": {"type": "string", "format": "date-time"},
    # media fields hold one or several MEDIA_ASSET_IDs (up to 5 photos per test per R-33); the media[] array carries the file facts
    "media_photo": {"anyOf": [{"type": "string", "maxLength": 64}, {"type": "array", "items": {"type": "string", "maxLength": 64}, "minItems": 1, "maxItems": 10}]},
    "media_video": {"anyOf": [{"type": "string", "maxLength": 64}, {"type": "array", "items": {"type": "string", "maxLength": 64}, "minItems": 1, "maxItems": 3}]}, "guidance": {"type": "boolean"},
}


def load_inputs():
    with open(os.path.join(HERE, "field_catalog.csv"), newline="", encoding="utf-8") as f:
        fields = list(csv.DictReader(f))
    with open(os.path.join(HERE, "vocabularies.csv"), newline="", encoding="utf-8") as f:
        vocab_rows = list(csv.DictReader(f))
    with open(os.path.join(HERE, "domains.csv"), newline="", encoding="utf-8") as f:
        domains = list(csv.DictReader(f))
    with open(os.path.join(HERE, "templates.json"), encoding="utf-8") as f:
        templates = json.load(f)
    for r in fields:
        r["sort_order"] = int(r["sort_order"])
    for d in domains:
        d["sort_order"] = int(d["sort_order"])
    domains.sort(key=lambda d: d["sort_order"])
    order = {d["domain_code"]: d["sort_order"] for d in domains}
    fields.sort(key=lambda r: (order.get(r["domain_code"], 999), r["sort_order"]))
    validate(fields, vocab_rows, domains, templates)
    return fields, vocab_rows, domains, templates


def validate(fields, vocab_rows, domains, templates):
    codes = [f["field_code"] for f in fields]
    dupes = {c for c in codes if codes.count(c) > 1}
    assert not dupes, f"duplicate field codes: {dupes}"
    dom_codes = {d["domain_code"] for d in domains}
    vocab_codes = {v["vocabulary_code"] for v in vocab_rows}
    for f in fields:
        assert f["domain_code"] in dom_codes, f"{f['field_code']}: unknown domain {f['domain_code']}"
        assert f["data_type"] in DATA_TYPES, f"{f['field_code']}: unknown data_type {f['data_type']}"
        if f["vocabulary_code"]:
            assert f["vocabulary_code"] in vocab_codes, f"{f['field_code']}: unknown vocabulary {f['vocabulary_code']}"
        if f["depends_on_field"]:
            assert f["depends_on_field"] in codes, f"{f['field_code']}: depends on unknown field {f['depends_on_field']}"
        if f["data_type"] in ("select", "code", "multiselect"):
            assert f["vocabulary_code"], f"{f['field_code']}: select/code fields need a vocabulary"
    for t in templates:
        for s in t["sections"]:
            for c in s["fields"]:
                assert c in codes, f"template {t['templateId']}: unknown field {c}"


# --------------------------------------------------------------------------------------
# Shared catalog (front end + API)
# --------------------------------------------------------------------------------------

def build_catalog(fields, vocab_rows, domains, templates):
    vocabs = OrderedDict()
    for v in vocab_rows:
        vocabs.setdefault(v["vocabulary_code"], {"code": v["vocabulary_code"], "name": v["vocabulary_name"], "values": []})
        vocabs[v["vocabulary_code"]]["values"].append({
            "code": v["value_code"], "label": v["label"], "sortOrder": int(v["sort_order"]),
            "isActive": v["is_active"].upper() == "Y",
        })
    for v in vocabs.values():
        v["values"].sort(key=lambda x: x["sortOrder"])
    cat_fields = []
    for f in fields:
        cat_fields.append({
            "fieldCode": f["field_code"], "domainCode": f["domain_code"], "subDomain": f["sub_domain"],
            "label": f["field_name"], "dataType": f["data_type"], "unit": f["unit"] or None,
            "vocabularyCode": f["vocabulary_code"] or None,
            "requiredDefault": f["required_default"].upper() == "Y", "allowNA": f["allow_na"].upper() == "Y",
            "dependsOnField": f["depends_on_field"] or None,
            "dependsOnValues": f["depends_on_value"].split("|") if f["depends_on_value"] else None,
            "taxonomyGroup": f["taxonomy_group"], "sourceReq": f["source_req"], "mvpScope": f["mvp_scope"],
            "sortOrder": f["sort_order"], "description": f["description"],
            "isHeader": f["field_code"] in HEADER_FIELDS,
            "systemDerived": f["data_type"] == "ref" or f["field_code"] in ("observation_timestamp", "test_status"),
        })
    return {
        "catalogVersion": "1.0",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "coreFieldCount": sum(1 for f in fields if f["taxonomy_group"] == "CORE"),
        "sopFieldCount": sum(1 for f in fields if f["taxonomy_group"] == "SOP"),
        "extensionFieldCount": sum(1 for f in fields if f["taxonomy_group"] == "EXT"),
        "domains": [{"domainCode": d["domain_code"], "name": d["domain_name"], "shortName": d["short_name"],
                     "sortOrder": d["sort_order"], "mvpScope": d["mvp_scope"], "sourceReq": d["source_req"],
                     "description": d["description"]} for d in domains],
        "vocabularies": list(vocabs.values()),
        "fields": cat_fields,
        "templates": templates,
        "headerFields": list(HEADER_FIELDS.keys()),
    }



def observation_json_schema(fields, vocabs):
    vocab_enum = {v["code"]: [x["code"] for x in v["values"]] for v in vocabs}
    field_rules = []
    for f in fields:
        val = dict(JSON_TYPES[f["data_type"]])
        if f["vocabulary_code"] and f["data_type"] in ("select", "code", "ref") and f["vocabulary_code"] in vocab_enum:
            val = {"type": "string", "enum": vocab_enum[f["vocabulary_code"]]}
        if f["data_type"] == "multiselect" and f["vocabulary_code"] in vocab_enum:
            val = {"type": "array", "uniqueItems": True, "items": {"type": "string", "enum": vocab_enum[f["vocabulary_code"]]}}
        rule = {
            "if": {"properties": {"fieldCode": {"const": f["field_code"]}}},
            "then": {
                "properties": {
                    "dataType": {"const": f["data_type"]},
                    "domainCode": {"const": f["domain_code"]},
                },
                "if": {"properties": {"isNA": {"const": True}}},
                "then": {"properties": {"value": {"type": "null"}}},
                "else": {"properties": {"value": val}},
            },
        }
        field_rules.append(rule)
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://nhsc.example/schemas/stability/observation.schema.json",
        "title": "Stability observation document (Blob landing format)",
        "description": "One document per observation version, written by the API to the observations container. Generated from field_catalog.csv.",
        "type": "object",
        "required": ["schemaVersion", "observationId", "versionNo", "status", "context", "template", "observer", "observedAt", "values", "media", "audit"],
        "additionalProperties": False,
        "properties": {
            "schemaVersion": {"const": "1.0"},
            "observationId": {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$"},
            "versionNo": {"type": "integer", "minimum": 1},
            "status": {"type": "string", "enum": ["DRAFT", "SUBMITTED", "REVIEWED", "REJECTED"]},
            "context": {
                "type": "object",
                "required": ["projectCode", "arNumber", "trialNumber", "sampleCode", "timePointCode", "conditionCode", "formulationClass"],
                "properties": {
                    "projectCode": {"type": "string"}, "arNumber": {"type": "string"}, "trialNumber": {"type": "string"},
                    "variantId": {"type": ["string", "null"]}, "variantNumber": {"type": ["string", "null"]}, "sampleCode": {"type": "string"},
                    "timePointCode": {"type": "string", "enum": vocab_enum["TIME_POINT"]},
                    "conditionCode": {"type": "string", "enum": vocab_enum["TEMP_CONDITION"]},
                    "formulationClass": {"type": "string", "enum": vocab_enum["FORMULATION_CLASS"]},
                    "planId": {"type": ["string", "null"]}, "planVersion": {"type": ["integer", "null"]},
                    "sourceSystem": {"type": "string", "default": "REFERENCE_STORE"},
                },
            },
            "template": {"type": "object", "required": ["templateId", "templateVersion"],
                         "properties": {"templateId": {"type": "string"}, "templateVersion": {"type": "integer"}, "templateName": {"type": "string"}}},
            "resultType": {"type": ["string", "null"], "enum": vocab_enum["RESULT_TYPE"] + [None]},
            "overallResult": {"type": ["string", "null"], "enum": vocab_enum["OVERALL_RESULT"] + [None]},
            "overallResultNA": {"type": "boolean"},
            # review outcome (R-30): written by the API when a reviewer acts; absent on first submission
            "reviewedBy": {"type": ["string", "null"]}, "reviewedAt": {"type": ["string", "null"], "format": "date-time"}, "reviewNote": {"type": ["string", "null"]},
            # storage facts echoed back to clients (blob path and version id of this document); never authored by the device
            "storage": {"type": "object", "properties": {"container": {"type": "string"}, "blobPath": {"type": "string"}, "versionId": {"type": ["string", "null"]}}},
            "observer": {"type": "object", "required": ["userId"],
                         "properties": {"userId": {"type": "string"}, "displayName": {"type": "string"}, "upn": {"type": "string"},
                                        "role": {"type": "string", "enum": ["SCIENTIST", "REVIEWER", "ADMIN"]}}},
            "observedAt": {"type": "string", "format": "date-time"},
            "submittedAt": {"type": ["string", "null"], "format": "date-time"},
            "device": {"type": "object", "properties": {"userAgent": {"type": "string"}, "platform": {"type": "string"}, "online": {"type": "boolean"}}},
            "values": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["fieldCode", "domainCode", "dataType"],
                    "properties": {
                        "fieldCode": {"type": "string", "enum": [f["field_code"] for f in fields]},
                        "domainCode": {"type": "string"}, "dataType": {"type": "string"},
                        "value": {}, "unit": {"type": ["string", "null"]}, "isNA": {"type": "boolean"},
                        "naReason": {"type": ["string", "null"]}, "mediaAssetId": {"type": ["string", "null"]},
                    },
                    "allOf": field_rules,
                },
            },
            "media": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["mediaAssetId", "fieldCode", "mediaType", "blobContainer", "blobPath", "standardFilename", "contentType"],
                    "properties": {
                        "mediaAssetId": {"type": "string"}, "fieldCode": {"type": "string"}, "mediaType": {"enum": ["PHOTO", "VIDEO"]},
                        "blobContainer": {"type": "string"}, "blobPath": {"type": "string"}, "blobUri": {"type": "string"},
                        "standardFilename": {"type": "string", "pattern": "^[A-Z0-9]+(_[A-Z0-9-]+){6,8}_[0-9]{8}-[0-9]{6}_[0-9]{2}\\.[a-z0-9]+$"},
                        "originalFilename": {"type": ["string", "null"]}, "contentType": {"type": "string"}, "sizeBytes": {"type": "integer"},
                        "widthPx": {"type": ["integer", "null"]}, "heightPx": {"type": ["integer", "null"]}, "durationS": {"type": ["number", "null"]},
                        "capturedAt": {"type": ["string", "null"]}, "deviceModel": {"type": ["string", "null"]}, "checksumSha256": {"type": ["string", "null"]},
                    },
                },
            },
            "audit": {"type": "object", "required": ["createdBy", "createdAt", "correlationId"],
                      "properties": {"createdBy": {"type": "string"}, "createdAt": {"type": "string", "format": "date-time"},
                                     "correlationId": {"type": "string"}, "previousVersionUri": {"type": ["string", "null"]}}},
        },
    }


def template_json_schema(fields):
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://nhsc.example/schemas/stability/template.schema.json",
        "title": "Questionnaire template document (config container)",
        "type": "object",
        "required": ["templateId", "templateName", "formulationClass", "version", "status", "sections"],
        "properties": {
            "templateId": {"type": "string", "pattern": "^TPL_[A-Z0-9_]+$"},
            "templateName": {"type": "string", "maxLength": 200},
            "formulationClass": {"enum": ["LIQUID_RTD", "POWDER", "VMS"]},
            "version": {"type": "integer", "minimum": 1},
            "status": {"enum": ["DRAFT", "ACTIVE", "RETIRED"]},
            "description": {"type": "string"},
            "createdBy": {"type": "string"}, "createdAt": {"type": "string"},
            "sections": {"type": "array", "minItems": 1, "items": {
                "type": "object", "required": ["label", "fields"],
                "properties": {"label": {"type": "string"},
                               "fields": {"type": "array", "items": {"type": "string", "enum": [f["field_code"] for f in fields]}},
                               "requiredOverrides": {"type": "object", "additionalProperties": {"type": "boolean"}}}}},
        },
    }


# --------------------------------------------------------------------------------------
# Power Query
# --------------------------------------------------------------------------------------


# --------------------------------------------------------------------------------------
# Reference data (NESTMS / LIMS exports landed in the "reference" container)
# --------------------------------------------------------------------------------------

REFERENCE_ENTITIES = OrderedDict([
    ("projects", {"key": "projectCode", "blob": "reference/projects.json", "props": {
        "projectCode": {"type": "string"}, "projectName": {"type": "string"}, "businessUnit": {"type": ["string", "null"]}, "i2lCode": {"type": ["string", "null"]},
        "consumerUsagePeriodHours": {"type": ["number", "null"], "description": "e.g. 24 for tube-fed products; drives the serum re-separation check"},
        "status": {"enum": ["ACTIVE", "ON_HOLD", "CLOSED"]}, "formulationClass": {"enum": ["LIQUID_RTD", "POWDER", "VMS"]}},
        "required": ["projectCode", "projectName", "status", "formulationClass"]}),
    ("ars", {"key": "arNumber", "blob": "reference/ars.json", "props": {
        "arNumber": {"type": "string"}, "projectCode": {"type": "string"}, "arTitle": {"type": "string"}, "requestedBy": {"type": ["string", "null"]},
        "arType": {"enum": ["STABILITY_STUDY", "OTHER", None]}, "forecastedDate": {"type": ["string", "null"], "format": "date"},
        "plannedStart": {"type": ["string", "null"], "format": "date"}, "status": {"enum": ["ACTIVE", "ON_HOLD", "CLOSED"]}},
        "required": ["arNumber", "projectCode", "arTitle", "status"]}),
    ("trials", {"key": "arNumber+trialNumber", "blob": "reference/trials.json", "props": {
        "trialNumber": {"type": "string"}, "arNumber": {"type": "string"}, "trialDescription": {"type": ["string", "null"]},
        "formulationClass": {"enum": ["LIQUID_RTD", "POWDER", "VMS"]}, "productFormat": {"type": ["string", "null"]},
        "processScale": {"enum": ["MICROTHERMICS", "PILOT_PLANT", "INDUSTRIAL_TRIAL", "FACTORY", None]},
        "status": {"enum": ["ACTIVE", "FAILED_DISCONTINUED", "COMPLETE", "CANCELLED", None]}, "terminationReason": {"type": ["string", "null"]}},
        "required": ["trialNumber", "arNumber", "formulationClass"]}),
    ("variants", {"key": "variantId", "blob": "reference/variants.json", "props": {
        "variantId": {"type": "string"}, "trialNumber": {"type": "string"}, "arNumber": {"type": "string"}, "variantNumber": {"type": "string"},
        "variantDescription": {"type": ["string", "null"]}, "recipeId": {"type": ["string", "null"]},
        "phTarget": {"type": ["number", "null"]}, "containsHydrolysates": {"type": ["boolean", "null"], "description": "hydrolysate recipes are more prone to serum (Mural)"}},
        "required": ["variantId", "trialNumber", "arNumber", "variantNumber"]}),
    ("samples", {"key": "sampleCode", "blob": "reference/samples.json", "props": {
        "sampleCode": {"type": "string"}, "variantId": {"type": "string"}, "conditionCode": {"type": "string"}, "containerType": {"type": ["string", "null"]},
        "packageVolumeMl": {"type": ["number", "null"]}, "fillHeightMm": {"type": ["number", "null"]},
        "bottleClarity": {"enum": ["CLEAR", "OPAQUE", None]}, "bottleBaseGeometry": {"enum": ["FLAT", "RAISED_CENTER", None], "description": "SOP: a rating of 4 needs 4 mm on a raised-center BOOST bottle"},
        "packagingDescription": {"type": ["string", "null"]}, "sourceFactory": {"type": ["string", "null"]}},
        "required": ["sampleCode", "variantId", "conditionCode"]}),
    ("plans", {"key": "planId+planVersion", "blob": "reference/plans.json", "props": {
        "planId": {"type": "string"}, "planVersion": {"type": "integer", "minimum": 1}, "arNumber": {"type": "string"},
        "intervalScheme": {"type": "string"}, "durationMonths": {"type": "integer"}, "planStatus": {"enum": ["ACTIVE", "CANCELLED_EARLY", "COMPLETE"]},
        "conditions": {"type": "array", "items": {"type": "string"}, "minItems": 1}, "timePoints": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "sourceSystem": {"type": ["string", "null"]}, "validFrom": {"type": "string", "format": "date"}},
        "required": ["planId", "planVersion", "arNumber", "intervalScheme", "durationMonths", "planStatus", "conditions", "timePoints", "validFrom"]}),
    ("users", {"key": "userId", "blob": "reference/users.json", "props": {
        "userId": {"type": "string"}, "displayName": {"type": "string"}, "upn": {"type": "string"}, "role": {"enum": ["SCIENTIST", "REVIEWER", "ADMIN"]}, "title": {"type": ["string", "null"]}},
        "required": ["userId", "displayName", "upn", "role"]}),
])


def reference_bundle_schema(vocabs):
    vocab_enum = {v["code"]: [x["code"] for x in v["values"]] for v in vocabs}
    props = {}
    for name, spec in REFERENCE_ENTITIES.items():
        p = json.loads(json.dumps(spec["props"]))
        if name == "samples":
            p["conditionCode"] = {"type": "string", "enum": vocab_enum["TEMP_CONDITION"]}
        if name == "plans":
            p["conditions"]["items"] = {"type": "string", "enum": vocab_enum["TEMP_CONDITION"]}
            p["timePoints"]["items"] = {"type": "string", "enum": vocab_enum["TIME_POINT"]}
        props[name] = {"type": "array", "items": {"type": "object", "required": spec["required"], "properties": p, "additionalProperties": True}}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://nhsc.example/schemas/stability/reference_bundle.schema.json",
        "title": "Reference data bundle (reference container)",
        "description": "Exports from NESTMS (projects, ARs, trials, variants, samples, plans) plus the user directory. Lab results are typed into the questionnaire; there is no LIMS integration. Uploaded through the Admin screen or backend/api/tools/import_reference.mjs; the API stores one JSON array per entity under reference/ and a _manifest.json. Generated from vocabularies.csv so condition and time point codes match the capture vocabulary.",
        "type": "object",
        "required": ["projects", "ars", "trials", "variants", "samples", "plans"],
        "additionalProperties": False,
        "properties": {**props, "exportedAt": {"type": "string", "format": "date-time"}, "source": {"type": "string", "description": "e.g. NESTMS weekly export, LIMS nightly export"}},
    }


# --------------------------------------------------------------------------------------
# Curated datasets: the NDJSON "tables" the API appends and Power BI reads
# --------------------------------------------------------------------------------------

def curated_datasets(fields, domains):
    col = lambda n, t, d="": {"name": n, "type": t, "description": d}
    header = [col("observationId", "string", "UUID of the observation; stable across versions"), col("versionNo", "integer"), col("isCurrent", "boolean", "true on every appended row; the latest appendedAt per observationId is the current one"),
              col("status", "string", "SUBMITTED | REVIEWED | REJECTED"), col("projectCode", "string"), col("arNumber", "string"), col("trialNumber", "string"), col("variantId", "string"), col("variantNumber", "string"),
              col("sampleCode", "string"), col("timePointCode", "string"), col("conditionCode", "string"), col("formulationClass", "string"), col("planId", "string"), col("planVersion", "integer"),
              col("templateId", "string"), col("templateVersion", "integer"), col("resultType", "string"), col("overallResult", "string", "ACCEPTABLE | WATCH | UNACCEPTABLE | null"), col("overallResultNA", "boolean"),
              col("observerUserId", "string"), col("observerName", "string"), col("observedAt", "datetime"), col("submittedAt", "datetime"), col("reviewedBy", "string"), col("reviewedAt", "datetime"),
              col("mediaCount", "integer"), col("blobPath", "string", "observations/{PROJECT}/{AR}/{TRIAL}/{observationId}.json"), col("blobVersionId", "string", "Blob version id of the document this row describes"),
              col("previousVersionNo", "integer"), col("appendedAt", "datetime", "server time the row was appended; used to pick the current row")]
    value = [col("observationId", "string"), col("versionNo", "integer"), col("fieldCode", "string", "one of the catalog field codes"), col("domainCode", "string"), col("dataType", "string"),
             col("valueText", "string", "string form of the value; multiselect codes joined with |; null when N/A"), col("valueNumber", "number", "numeric fields only"), col("valueBoolean", "boolean", "boolean and guidance fields only"),
             col("unit", "string"), col("isNA", "boolean"), col("naReason", "string"), col("mediaAssetId", "string", "first media asset for media fields"),
             col("sampleCode", "string"), col("timePointCode", "string"), col("conditionCode", "string"), col("arNumber", "string"), col("projectCode", "string"), col("observedAt", "datetime")]
    media = [col("mediaAssetId", "string"), col("observationId", "string"), col("versionNo", "integer"), col("fieldCode", "string"), col("mediaType", "string", "PHOTO | VIDEO"), col("blobContainer", "string"),
             col("blobPath", "string", "{PROJECT}/{AR}/{TRIAL}/{standardFilename}"), col("blobUri", "string"), col("standardFilename", "string"), col("originalFilename", "string"), col("contentType", "string"),
             col("sizeBytes", "integer"), col("widthPx", "integer"), col("heightPx", "integer"), col("durationS", "number"), col("capturedAt", "datetime"), col("deviceModel", "string"), col("checksumMd5", "string"),
             col("sampleCode", "string"), col("timePointCode", "string"), col("conditionCode", "string"), col("arNumber", "string"), col("projectCode", "string")]
    audit = [col("auditId", "string"), col("eventTime", "datetime"), col("actorUserId", "string"), col("actorName", "string"), col("actorRole", "string"),
             col("action", "string", "CREATE | UPDATE | REVIEW | REJECT | MEDIA_UPLOAD | CONFIG_CHANGE"), col("entityType", "string", "OBSERVATION | MEDIA_ASSET | TEMPLATE | VOCABULARY | REFERENCE"),
             col("entityId", "string"), col("entityVersion", "integer"), col("correlationId", "string"), col("detail", "string")]
    flat = [{"name": f["field_code"], "type": f["data_type"], "domainCode": f["domain_code"], "label": f["field_name"], "unit": f["unit"] or None, "pqType": PQ_TYPES[f["data_type"]]} for f in fields if f["field_code"] not in HEADER_FIELDS]
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "container": "curated",
        "layout": "{dataset}/{yyyy}/{mm}/{dd}.ndjson, one JSON object per line, appended by the API at submit / review / config change",
        "timePointOffsetDays": TIME_POINT_OFFSET_DAYS,
        "datasets": {
            "observation_header": {"grain": "one row per observation version event (submit, amend, review)", "primaryKey": ["observationId", "versionNo", "appendedAt"], "columns": header},
            "observation_value": {"grain": "one row per captured field per observation version", "primaryKey": ["observationId", "versionNo", "fieldCode"], "columns": value},
            "media_asset": {"grain": "one row per photo or video per observation version", "primaryKey": ["mediaAssetId", "observationId", "versionNo"], "columns": media},
            "audit_log": {"grain": "one row per audited action", "primaryKey": ["auditId"], "columns": audit},
        },
        "derived": {
            "ObservationCurrent": "latest observation_header row per observationId (max appendedAt), status <> REJECTED",
            "ObservationFlat": "ObservationCurrent joined to observation_value pivoted to one column per field code (list below)",
            "DefectIncidence": "presence flag per defect domain per current observation",
            "PlanProgress": "reference plans expanded to time point x condition cells with CAPTURED / DUE / OVERDUE / PLANNED",
            "MediaCoverage": "media counts and overview-photo flag per current observation",
        },
        "flatColumns": flat,
        "domains": [{"domainCode": d["domain_code"], "name": d["domain_name"]} for d in domains],
    }


# --------------------------------------------------------------------------------------
# Blob layout: the DDL equivalent
# --------------------------------------------------------------------------------------

def blob_layout_md(fields):
    n_fields = len(fields)
    return f"""# Blob layout (the data store)

Azure Blob Storage is the only persistence layer. One storage account, five containers, blob versioning on. Everything below is created by `backend/infra/main.bicep`; the API never creates paths outside this layout.

| Container | Path | Content | Written by | Read by |
|---|---|---|---|---|
| `reference` | `projects.json`, `ars.json`, `trials.json`, `variants.json`, `samples.json`, `plans.json`, `users.json`, `_manifest.json` | NESTMS exports as JSON arrays (schema: `reference_bundle.schema.json`); manifest holds counts, source, updatedAt, updatedBy | Admin import (API) or `backend/api/tools/import_reference.mjs` on a schedule | API (context cascade, context verification), Power BI (`Reference_*` queries) |
| `observations` | `{{PROJECT}}/{{AR}}/{{TRIAL}}/{{observationId}}.json` | One document per observation (schema: `observation.schema.json`, {n_fields} catalog fields). Amendments overwrite the document; blob versioning keeps every prior version; `versionNo` and `audit.previousVersionUri` link them | API only (create-only on first write) | API (review, detail), Power BI is not pointed here |
| `observations` | `_index/{{AR}}.json` | Current header per observation for that AR (fast list without scanning); updated with ETag concurrency | API | API |
| `media` | `{{PROJECT}}/{{AR}}/{{TRIAL}}/{{standard filename}}` | Photos and videos, renamed on upload to `{{PROJECT}}_{{AR}}_{{TRIAL}}_V{{VARIANT}}_{{TP}}_{{COND}}_{{DOMAIN}}_{{FIELD}}_{{YYYYMMDD-HHMMSS}}_{{SEQ}}.{{ext}}` | Device, with a 15-minute write-only SAS scoped to that exact path | API (existence check before commit), Power BI (blobUri), reviewers |
| `curated` | `observation_header/yyyy/mm/dd.ndjson`, `observation_value/...`, `media_asset/...`, `audit_log/...` | Append-only NDJSON datasets (columns: `curated_datasets.json`) | API, at submit / review / config change | Power BI (`power_query_blob.m`) |
| `config` | `templates/{{templateId}}/v{{n}}.json`, `vocabularies.json` | Versioned questionnaire templates (schema: `template.schema.json`) and the live vocabulary list | API (reviewer / admin actions) | API, React app |

## Rules the API enforces

1. **No partial records**: media blobs must exist before the observation document is written; the document is written create-only; curated rows and the audit event follow; a failure after the write deletes the document.
2. **Versioning**: a resubmission of an existing `observationId` becomes `versionNo + 1`; the previous document version stays retrievable through blob versioning and `audit.previousVersionUri`.
3. **Naming**: a SAS is only issued for a path that matches the convention regex, and a document is only accepted when every media entry's path matches it.
4. **Identity**: `observer` is rewritten from the Entra token; the client's claim is ignored.
5. **Reference integrity**: project / AR / trial / sample / condition must exist in `reference/` (FK check) before anything is written.

## Retention and cost

- `media`: lifecycle policy cools blobs after 90 days and archives after 3 years; documents and curated data stay hot (tens of MB per year at URS volumes).
- Blob versioning and 30-day soft delete on all containers; the change feed is enabled for a year so any external system can replay events.
- URS sizing (~120k observations, ~127 values each, ~6 media each over 2 years) lands at roughly 15M curated value rows (~5 GB NDJSON) and ~700k media files: comfortable for Blob and for Power BI import mode with monthly partitions.

## How this maps to what a database would have given you

| Relational concept | Where it lives here |
|---|---|
| Reference tables (project, AR, trial, variant, sample, plan, user) | `reference/*.json` |
| Transaction table OBSERVATION | `observations/**/*.json` (record) + `curated/observation_header` (analytics) |
| Typed EAV table OBSERVATION_VALUE | `values[]` in each document + `curated/observation_value` |
| MEDIA_ASSET | `media[]` in each document + `curated/media_asset` + the files in `media/` |
| AUDIT_LOG | `curated/audit_log` (append-only) |
| Views (current, flat per field, incidence, plan progress) | Power Query queries in `power_query_blob.m` (refresh in Power BI or a dataflow) |
| Primary key / uniqueness | create-only writes (`If-None-Match: *`) and ETag-guarded index updates |
| Foreign keys | API reference check before write |
| Transactions | ordered writes with compensating delete |
"""


# --------------------------------------------------------------------------------------
# Power Query (M): the analytical layer on top of the curated NDJSON
# --------------------------------------------------------------------------------------

DEFECT_FLAGS = [  # (domain, field, M predicate on the flat column)
    ("HOMOG", "homog_unshaken_homogeneous", '[homog_unshaken_homogeneous] = false'),
    ("CREAMING", "cream_unsh_present", '[cream_unsh_present] = true'),
    ("SERUM", "serum_unsh_present", '[serum_unsh_present] = true'),
    ("SEDIMENT", "sed_unsh_present", '[sed_unsh_present] = true'),
    ("GELLING", "gel_gelled", '[gel_gelled] = true'),
    ("NON_HOMOG", "nh_lumps_present", '[nh_lumps_present] = true'),
    ("PROTEIN_SAG", "psag_vertical_stripes_present", '[psag_vertical_stripes_present] = true'),
    ("EXT_POWDER", "pwd_caking", '[pwd_caking] <> null and [pwd_caking] <> "NONE"'),
    ("EXT_VMS", "vms_appearance_change", '[vms_appearance_change] <> null and [vms_appearance_change] <> "NONE"'),
]


def power_query_blob(fields, domains):
    flat_fields = [f for f in fields if f["field_code"] not in HEADER_FIELDS]
    codes = ", ".join(f'"{f["field_code"]}"' for f in flat_fields)
    types = ",\n            ".join(f'{{"{f["field_code"]}", {PQ_TYPES[f["data_type"]]}}}' for f in flat_fields)
    tp_rows = ",\n            ".join(f'{{"{k}", {v}}}' for k, v in TIME_POINT_OFFSET_DAYS.items())
    flag_steps = "\n".join(f'    Flags{i + 1} = Table.AddColumn({"ObservationFlatExpanded" if i == 0 else f"Flags{i}"}, "{d}", each if [{fld}] = null then null else if {pred} then 1 else 0, Int64.Type),' for i, (d, fld, pred) in enumerate(DEFECT_FLAGS))
    n_flags = len(DEFECT_FLAGS)
    flag_cols = ", ".join(f'"{d}"' for d, _, _ in DEFECT_FLAGS)
    ref_queries = "\n".join(f'''    Reference_{name[0].upper() + name[1:]} = Table.FromRecords(Json.Document(Reference{{[Name = "{spec["blob"].split("/")[1]}"]}}[Content]), null, MissingField.UseNull),''' for name, spec in REFERENCE_ENTITIES.items())
    return f'''// Power Query (M) for the R&D Stability Data Platform. Azure Blob Storage is the only source.
// Paste into Power BI Desktop > Get data > Blank query > Advanced editor, then split the "let" bindings into separate queries
// (Reference_*, ObservationCurrent, ObservationFlat, DefectIncidence, PlanProgress, MediaCoverage, AuditLog) or keep as one and reference it.
// Replace <storageaccount>. Authentication: Organizational account (Storage Blob Data Reader) or account key.
// Generated from field_catalog.csv: the pivot below has one column per catalog field, typed. Regenerate when the catalog changes.
let
    Account = "https://<storageaccount>.blob.core.windows.net/",
    Source = AzureStorage.Blobs(Account),
    Curated = Source{{[Name = "curated"]}}[Data],
    Reference = Source{{[Name = "reference"]}}[Data],

    // ---- generic NDJSON folder reader: curated/{{dataset}}/yyyy/mm/dd.ndjson
    ReadFolder = (folder as text) as table =>
        let
            Files = Table.SelectRows(Curated, each Text.StartsWith([Name], folder & "/") and Text.EndsWith([Name], ".ndjson")),
            Lines = Table.AddColumn(Files, "Lines", each Lines.FromBinary([Content], null, null, 65001)),
            Expanded = Table.ExpandListColumn(Table.SelectColumns(Lines, {{"Lines"}}), "Lines"),
            NonEmpty = Table.SelectRows(Expanded, each [Lines] <> null and [Lines] <> ""),
            Parsed = Table.AddColumn(NonEmpty, "Row", each Json.Document([Lines])),
            Records = Table.FromRecords(Table.Column(Parsed, "Row"), null, MissingField.UseNull)
        in
            Records,

    // ---- reference data (NESTMS / LIMS exports)
{ref_queries}

    // ---- observation header: append-only; the current row per observation is the one with the latest appendedAt
    ObservationHeader = Table.TransformColumnTypes(ReadFolder("observation_header"),
        {{{{"versionNo", Int64.Type}}, {{"observedAt", type datetimezone}}, {{"submittedAt", type datetimezone}}, {{"reviewedAt", type datetimezone}}, {{"appendedAt", type datetimezone}}, {{"mediaCount", Int64.Type}}, {{"overallResultNA", type logical}}}}),
    HeaderRanked = Table.AddColumn(
        Table.Group(ObservationHeader, {{"observationId"}}, {{{{"Rows", each Table.Sort(_, {{{{"appendedAt", Order.Descending}}}}), type table}}}}),
        "Current", each Table.First([Rows])),
    ObservationCurrent = Table.SelectRows(Table.FromRecords(Table.Column(HeaderRanked, "Current"), null, MissingField.UseNull), each [status] <> "REJECTED"),

    // ---- values for the current versions only
    ObservationValue = Table.TransformColumnTypes(ReadFolder("observation_value"),
        {{{{"versionNo", Int64.Type}}, {{"valueNumber", type number}}, {{"valueBoolean", type logical}}, {{"isNA", type logical}}, {{"observedAt", type datetimezone}}}}),
    CurrentKeys = Table.SelectColumns(ObservationCurrent, {{"observationId", "versionNo"}}),
    ObservationValueCurrent = Table.Join(ObservationValue, {{"observationId", "versionNo"}}, CurrentKeys, {{"observationId", "versionNo"}}, JoinKind.Inner),

    // ---- one column per catalog field (N/A becomes null; booleans and numbers typed)
    FieldCodes = {{{codes}}},
    ValueForPivot = Table.AddColumn(ObservationValueCurrent, "v", each if [isNA] = true then null else if [valueBoolean] <> null then Text.From([valueBoolean]) else if [valueNumber] <> null then Text.From([valueNumber]) else [valueText], type text),
    Pivoted = Table.Pivot(Table.SelectColumns(ValueForPivot, {{"observationId", "versionNo", "fieldCode", "v"}}), FieldCodes, "fieldCode", "v"),
    TypedFlat = Table.TransformColumnTypes(Pivoted,
        {{
            {types}
        }}),
    ObservationFlat = Table.NestedJoin(ObservationCurrent, {{"observationId", "versionNo"}}, TypedFlat, {{"observationId", "versionNo"}}, "Flat", JoinKind.LeftOuter),
    ObservationFlatExpanded = Table.ExpandTableColumn(ObservationFlat, "Flat", FieldCodes, FieldCodes),

    // ---- defect incidence: 1 = present, 0 = assessed and absent, null = not assessed
{flag_steps}
    DefectIncidence = Table.UnpivotOtherColumns(Table.SelectColumns(Flags{n_flags}, {{"observationId", "versionNo", "projectCode", "arNumber", "trialNumber", "variantNumber", "sampleCode", "timePointCode", "conditionCode", "observedAt", {flag_cols}}}),
        {{"observationId", "versionNo", "projectCode", "arNumber", "trialNumber", "variantNumber", "sampleCode", "timePointCode", "conditionCode", "observedAt"}}, "domainCode", "defectPresent"),

    // ---- plan progress: plan cells x captured observations
    TimePointOffsets = #table({{"timePointCode", "offsetDays"}}, {{
            {tp_rows}
        }}),
    PlanCells0 = Table.ExpandListColumn(Table.ExpandListColumn(Reference_Plans, "conditions"), "timePoints"),
    PlanCells1 = Table.RenameColumns(PlanCells0, {{{{"conditions", "conditionCode"}}, {{"timePoints", "timePointCode"}}}}),
    PlanCells2 = Table.NestedJoin(PlanCells1, {{"timePointCode"}}, TimePointOffsets, {{"timePointCode"}}, "Off", JoinKind.LeftOuter),
    PlanCells3 = Table.AddColumn(Table.ExpandTableColumn(PlanCells2, "Off", {{"offsetDays"}}), "dueDate", each Date.AddDays(Date.From([validFrom]), [offsetDays]), type date),
    Captured = Table.Group(ObservationCurrent, {{"arNumber", "timePointCode", "conditionCode"}}, {{{{"capturedCount", each Table.RowCount(_), Int64.Type}}, {{"firstCapturedAt", each List.Min([observedAt]), type datetimezone}}}}),
    PlanCells4 = Table.NestedJoin(PlanCells3, {{"arNumber", "timePointCode", "conditionCode"}}, Captured, {{"arNumber", "timePointCode", "conditionCode"}}, "Cap", JoinKind.LeftOuter),
    PlanCells5 = Table.ExpandTableColumn(PlanCells4, "Cap", {{"capturedCount", "firstCapturedAt"}}),
    PlanProgress = Table.AddColumn(PlanCells5, "cellStatus", each
        if [capturedCount] <> null and [capturedCount] > 0 then "CAPTURED"
        else if Duration.Days(DateTime.Date(DateTime.LocalNow()) - [dueDate]) > 7 then "OVERDUE"
        else if Duration.Days(DateTime.Date(DateTime.LocalNow()) - [dueDate]) >= -7 then "DUE"
        else "PLANNED", type text),

    // ---- media coverage
    MediaAsset = Table.TransformColumnTypes(ReadFolder("media_asset"), {{{{"versionNo", Int64.Type}}, {{"sizeBytes", Int64.Type}}, {{"durationS", type number}}}}),
    MediaAssetCurrent = Table.Join(MediaAsset, {{"observationId", "versionNo"}}, CurrentKeys, {{"observationId", "versionNo"}}, JoinKind.Inner),
    MediaCoverage = Table.Group(MediaAssetCurrent, {{"observationId", "versionNo", "projectCode", "arNumber", "sampleCode", "timePointCode", "conditionCode"}}, {{
        {{"mediaFiles", each Table.RowCount(_), Int64.Type}},
        {{"photos", each Table.RowCount(Table.SelectRows(_, each [mediaType] = "PHOTO")), Int64.Type}},
        {{"videos", each Table.RowCount(Table.SelectRows(_, each [mediaType] = "VIDEO")), Int64.Type}},
        {{"hasOverviewPhoto", each Table.RowCount(Table.SelectRows(_, each [fieldCode] = "general_overview_photo")) > 0, type logical}},
        {{"totalBytes", each List.Sum([sizeBytes]), Int64.Type}}}}),

    // ---- audit trail
    AuditLog = Table.TransformColumnTypes(ReadFolder("audit_log"), {{{{"eventTime", type datetimezone}}}})
in
    ObservationFlatExpanded
'''


# --------------------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------------------


def summary_md(fields, vocab_rows, domains, templates):
    by_dom = defaultdict(list)
    for f in fields:
        by_dom[f["domain_code"]].append(f)
    lines = ["# Schema summary", "", f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} from field_catalog.csv, vocabularies.csv, domains.csv, templates.json.", ""]
    core = sum(1 for f in fields if f["taxonomy_group"] == "CORE")
    sop = sum(1 for f in fields if f["taxonomy_group"] == "SOP")
    ext = sum(1 for f in fields if f["taxonomy_group"] == "EXT")
    lines += [f"- URS taxonomy fields (from R-02 to R-17, restructured where the SOP measures differently): **{core}**",
              f"- SOP / team-sheet / Mural additions (ratings, method metadata, coverage, shaking protocol, sensory, custom): **{sop}**",
              f"- Extension fields (powder / VMS, outside the URS): **{ext}**",
              f"- Controlled vocabularies: **{len({v['vocabulary_code'] for v in vocab_rows})}** with **{len(vocab_rows)}** values",
              f"- Templates seeded: **{len(templates)}**", ""]
    lines += ["## Fields by domain", "", "| Domain | Source | MVP scope | Fields | Required | Allow N/A | Media | Branching |", "|---|---|---|---|---|---|---|---|"]
    for d in domains:
        fs = by_dom.get(d["domain_code"], [])
        lines.append(f"| {d['domain_name']} | {d['source_req']} | {d['mvp_scope']} | {len(fs)} | {sum(1 for f in fs if f['required_default']=='Y')} | {sum(1 for f in fs if f['allow_na']=='Y')} | {sum(1 for f in fs if f['data_type'].startswith('media'))} | {sum(1 for f in fs if f['depends_on_field'])} |")
    lines += ["", "## Templates", "", "| Template | Class | Status | Fields |", "|---|---|---|---|"]
    for t in templates:
        lines.append(f"| {t['templateName']} | {t['formulationClass']} | {t['status']} | {sum(len(s['fields']) for s in t['sections'])} |")
    lines += ["", "## Field list", "", "| Field code | Domain | Sub-domain | Label | Type | Unit | Vocabulary | Req | N/A | Depends on | Req # | Scope |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for f in fields:
        dep = f"{f['depends_on_field']} = {f['depends_on_value']}" if f["depends_on_field"] else ""
        lines.append(f"| `{f['field_code']}` | {f['domain_code']} | {f['sub_domain']} | {f['field_name']} | {f['data_type']} | {f['unit']} | {f['vocabulary_code']} | {f['required_default']} | {f['allow_na']} | {dep} | {f['source_req']} | {f['mvp_scope']} |")
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------------------


# --------------------------------------------------------------------------------------

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  wrote {os.path.relpath(path, HERE)}  ({len(content):,} bytes)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    args = ap.parse_args()

    fields, vocab_rows, domains, templates = load_inputs()
    catalog = build_catalog(fields, vocab_rows, domains, templates)
    print(f"Catalog: {catalog['coreFieldCount']} URS + {catalog['sopFieldCount']} SOP + {catalog['extensionFieldCount']} extension fields, {len(catalog['vocabularies'])} vocabularies, {len(templates)} templates")

    out = args.out
    write(os.path.join(out, "blob", "observation.schema.json"), json.dumps(observation_json_schema(fields, catalog["vocabularies"]), indent=2))
    write(os.path.join(out, "blob", "template.schema.json"), json.dumps(template_json_schema(fields), indent=2))
    write(os.path.join(out, "blob", "reference_bundle.schema.json"), json.dumps(reference_bundle_schema(catalog["vocabularies"]), indent=2))
    write(os.path.join(out, "blob", "curated_datasets.json"), json.dumps(curated_datasets(fields, domains), indent=2))
    write(os.path.join(out, "blob", "BLOB_LAYOUT.md"), blob_layout_md(fields))
    write(os.path.join(out, "powerbi", "power_query_blob.m"), power_query_blob(fields, domains))
    write(os.path.join(out, "SCHEMA_SUMMARY.md"), summary_md(fields, vocab_rows, domains, templates))

    cat_json = json.dumps(catalog, indent=2)
    write(os.path.join(HERE, "..", "..", "frontend", "src", "data", "catalog.json"), cat_json)
    write(os.path.join(HERE, "..", "api", "src", "data", "catalog.json"), cat_json)
    for name in ("observation.schema.json", "reference_bundle.schema.json"):
        shutil.copy(os.path.join(out, "blob", name), os.path.join(HERE, "..", "api", "src", "data", name))
    print("done")


if __name__ == "__main__":
    main()
