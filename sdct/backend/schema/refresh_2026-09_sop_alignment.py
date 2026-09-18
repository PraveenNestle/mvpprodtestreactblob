#!/usr/bin/env python3
"""Apply the approved SOP / spreadsheet / Mural refresh to the catalog source files.
Runs once; the generator then regenerates everything downstream. Kept in the repo as the record of what changed and why."""
import csv, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIELDS = HERE / 'field_catalog.csv'; VOCAB = HERE / 'vocabularies.csv'; DOMAINS = HERE / 'domains.csv'; TEMPLATES = HERE / 'templates.json'
SOP = 'SOP-202'          # RDBW-SOP-00000202 Physical Stability in Aseptic Bottles
XLS = 'Team sheet'       # Stability_Examples_in_Excel (Supernova, Novastar, Benefic, VP RTD)
MURAL = 'Mural'          # PD brainstorm on the SOP

def read(p):
    with open(p, newline='', encoding='utf-8') as f: return list(csv.DictReader(f))
def write(p, rows, cols):
    with open(p, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols, lineterminator='\n'); w.writeheader(); w.writerows(rows)

fields = read(FIELDS); vocab = read(VOCAB); domains = read(DOMAINS)
FCOLS = list(fields[0].keys()); VCOLS = list(vocab[0].keys()); DCOLS = list(domains[0].keys())
by_code = {f['field_code']: f for f in fields}

def F(code, domain, sub, name, dtype, unit='', voc='', req='N', na='N', dep='', depv='', tax='SOP', src=SOP, scope='MVP', sort=0, desc=''):
    return dict(field_code=code, domain_code=domain, sub_domain=sub, field_name=name, data_type=dtype, unit=unit, vocabulary_code=voc, required_default=req, allow_na=na,
                depends_on_field=dep, depends_on_value=depv, taxonomy_group=tax, source_req=src, mvp_scope=scope, sort_order=str(sort), description=desc)
def V(code, name, values):
    return [dict(vocabulary_code=code, vocabulary_name=name, value_code=vc, label=lbl, sort_order=str(i), is_active='Y') for i, (vc, lbl) in enumerate(values)]

# ---------------------------------------------------------------- vocabularies
def drop_vocab(code): return [v for v in vocab if v['vocabulary_code'] != code]
vocab = drop_vocab('OVERALL_RESULT') + V('OVERALL_RESULT', 'Overall result (KSC language)', [('IN', 'In'), ('JUST_IN', 'Just In'), ('OUT', 'Out')])
vocab = drop_vocab('CREAM_LAYER_DESC') + V('CREAM_LAYER_DESC', 'Cream layer description (SOP Table 2 words)', [('TRACE', 'Trace'), ('SLIGHT_THIN_RING', 'Slight: thin ring (under 5 mm)'), ('DISTINCT_RING', 'Distinct ring (5 to 8 mm)'), ('HEAVY_RING', 'Heavy ring (8 to 10 mm)'), ('VERY_HEAVY_RING', 'Very heavy ring (10 mm or more)')])
vocab = drop_vocab('SED_TEXTURE') + V('SED_TEXTURE', 'Sediment texture', [('LOOSE', 'Loose'), ('SOFT', 'Soft'), ('COMPACT', 'Compact'), ('HARD', 'Hard'), ('STICKY', 'Sticky'), ('LUMPY', 'Lumpy / clumps'), ('SANDY_GRITTY', 'Sandy / gritty'), ('FLAKY', 'Flaky')])
vocab = drop_vocab('TIME_POINT') + V('TIME_POINT', 'Stability time point', [('T0', 'T0 (immediate)'), ('1D', '1 day'), ('1W', '1 week'), ('2W', '2 weeks'), ('1M', '1 month'), ('2M', '2 months'), ('3M', '3 months'), ('4M', '4 months'), ('6M', '6 months'), ('9M', '9 months'), ('12M', '12 months'), ('15M', '15 months'), ('18M', '18 months')])
vocab = drop_vocab('TEMP_CONDITION') + V('TEMP_CONDITION', 'Storage condition', [('4C', 'Refrigerated 4°C'), ('25C', 'Ambient 25°C'), ('30C', 'Tropical 30°C'), ('35C', 'Elevated 35°C'), ('45C', 'Elevated 45°C'), ('55C', 'Elevated 55°C'), ('FRZ', 'Freezer -18°C')])
vocab += V('RESULT_TYPE', 'Result type', [('HISTORICAL_IMPORT', 'Historical import (spreadsheet)')])
for v in vocab:
    if v['vocabulary_code'] == 'RESULT_TYPE' and v['value_code'] == 'HISTORICAL_IMPORT': v['sort_order'] = '5'
vocab += V('COLOR_DESC', 'Color description', [('PALE_YELLOW', 'Pale yellow'), ('OILY', 'Oily / fat layer (real food)')])
for v in vocab:
    if v['vocabulary_code'] == 'COLOR_DESC' and v['value_code'] in ('PALE_YELLOW', 'OILY'): v['sort_order'] = str(12 if v['value_code'] == 'PALE_YELLOW' else 13)
vocab += V('RATING_CREAMING', 'Creaming rating (SOP Table 2)', [('0', '0 Zero: no creaming visible'), ('1', '1 Trace: creaming present'), ('2', '2 Slight: thin ring (under 5 mm)'), ('3', '3 Distinct: ring 5 to 8 mm'), ('4', '4 Heavy: ring 8 to 10 mm'), ('5', '5 Very heavy: ring 10 mm or more')])
vocab += V('RATING_SERUM', 'Serum rating (SOP Table 3)', [('0', '0 Zero: no serum visible'), ('1', '1 Trace: line during pouring'), ('2', '2 Slight: about 2% of package volume'), ('3', '3 Distinct: about 5% of package volume'), ('4', '4 Heavy: about 10% of package volume'), ('5', '5 Very heavy: 20% or more of package volume')])
vocab += V('RATING_SEDIMENT', 'Sediment rating (SOP Table 4)', [('0', '0 Zero: no sediment on the bottom'), ('1', '1 Trace: partial ring or coverage in depressions'), ('2', '2 Slight: complete ring, 1 to 2 mm'), ('3', '3 Distinct: about 3 mm, heavier ring'), ('4', '4 Heavy: about 4 mm, entire bottom covered'), ('5', '5 Very heavy: 5 mm or more, entire bottom covered')])
vocab += V('SHAKE_PROTOCOL', 'Shaking protocol', [('SOP_10X_180', 'SOP: 10 shakes, 180°, medium force, about 5 s'), ('OTHER', 'Other (record the count)'), ('NOT_SHAKEN', 'Not shaken (unshaken evaluation only)')])
vocab += V('LAB_SOURCE', 'Lab result source', [('TYPED_FROM_LIMS', 'Typed from LIMS (no integration)'), ('MEASURED_IN_PD_LAB', 'Measured in the PD lab'), ('NOT_AVAILABLE', 'Not available at this pull')])
vocab += V('VISC_INSTRUMENT', 'Viscosity instrument', [('PHYSICA_RHEOMETER', 'Physica rheometer'), ('BROOKFIELD', 'Brookfield viscometer'), ('OTHER', 'Other')])
vocab += V('CREAM_RESIDUE', 'Residue after shaking', [('FAT_RING_ON_BOTTLE', 'Fat ring on the bottle'), ('FLOATING_FLAKES', 'Floating flakes'), ('PLUG_AT_SPOUT', 'Plug at the spout'), ('SKIN_OR_PAD', 'Skin or pad'), ('NONE', 'None')])
vocab += V('SED_COVERAGE', 'Sediment coverage of the bottom', [('PARTIAL_RING', 'Partial ring'), ('COMPLETE_RING', 'Complete ring'), ('OUTER_RING_CLEAR_CENTER', 'Outer ring, clear center'), ('ENTIRE_BOTTOM', 'Entire bottom covered'), ('DEPRESSIONS_ONLY', 'Depressions only')])
vocab += V('SED_MEAS_POINT', 'Sediment measurement point', [('BEFORE_POUR', 'Before pouring (through a clear bottle)'), ('AFTER_POUR', 'After pouring (emptied bottle)')])
vocab += V('SED_MEAS_LOCATION', 'Sediment measurement location', [('OUTER_RIM', 'Outer rim (SOP worst case)'), ('CENTER', 'Center'), ('AVERAGE', 'Average of several points')])
vocab += V('NH_CONTEXT', 'When lumps were seen', [('UNSHAKEN_POUR', 'Pouring unshaken'), ('AFTER_SHAKING', 'Pouring after shaking'), ('ON_SIEVE', 'On the sieve')])
vocab += V('COLOR_METHOD', 'Color measurement method', [('VISUAL', 'Visual against T0'), ('LAB_METER', 'L*a*b* meter'), ('DIGIEYE', 'DigiEye')])
vocab += V('TEXTURE_SENSORY', 'Texture in mouth or on pour', [('SMOOTH', 'Smooth'), ('SLIGHTLY_THICKER', 'Slightly thicker'), ('MILKSHAKE_THICK', 'Milkshake thick'), ('PUDDING', 'Pudding'), ('LUMPY', 'Lumpy'), ('GRITTY', 'Gritty')])

# ---------------------------------------------------------------- domains
for d in domains:
    if d['domain_code'] == 'LAB_RESULTS': d['description'] = 'pH, viscosity (with instrument, geometry, shear rate, temperature), Brix, D50 typed in by the scientist from LIMS; there is no LIMS integration'; d['source_req'] = 'R-15, Team sheet'
    if d['domain_code'] == 'GENERAL_MEDIA': d['description'] = 'Mandatory full-bottle and emptied-bottle photos, optional beaker photo and pour-out video'
    if d['domain_code'] == 'SEDIMENT': d['description'] = 'SOP rating, height, coverage, texture, measurement point, bottle coating; Protein, Mineral and Cocoa sub-flows'
    if d['domain_code'] in ('GELLING', 'NON_HOMOG', 'PROTEIN_SAG'): d['mvp_scope'] = 'MVP'; d['source_req'] = 'R-11, SOP-202'
    if d['domain_code'] == 'CREAMING': d['description'] = 'SOP rating, ring thickness, pour exit time, rim residue (not creaming), shaken residue type, emulsifier flags'
    if d['domain_code'] == 'SERUM': d['description'] = 'SOP rating, % of package volume, locations, shaken result, optional re-separation check after the consumer usage period'
domains += [
    dict(domain_code='APPEARANCE_SENSORY', domain_name='Appearance and sensory', short_name='Sensory', sort_order='105', mvp_scope='SCHEMA_READY', source_req='SOP-202, Mural', description='Color change vs T0 (visual or L*a*b*) and texture in mouth or on pour'),
    dict(domain_code='CUSTOM', domain_name='Custom observations', short_name='Custom', sort_order='106', mvp_scope='SCHEMA_READY', source_req='Mural', description='Three free slots for a one-off parameter, unshaken and shaken, without a catalog change'),
]

# ---------------------------------------------------------------- fields: removals
REMOVE = {'cream_sh_shake_count', 'lab_viscosity_cp',
          'sed_prot_unsh_height_value', 'sed_prot_unsh_height_unit', 'sed_prot_unsh_texture', 'sed_prot_sh_shake_in_extent', 'sed_prot_sh_residual_value', 'sed_prot_sh_residual_unit', 'sed_prot_sh_photo',
          'sed_min_unsh_height_value', 'sed_min_unsh_height_unit', 'sed_min_sh_shake_in_extent', 'sed_min_sh_residual_value', 'sed_min_sh_residual_unit', 'sed_min_sh_photo',
          'sed_coc_unsh_height_value', 'sed_coc_unsh_height_unit', 'sed_coc_sh_shake_in_extent', 'sed_coc_sh_residual_value', 'sed_coc_sh_residual_unit', 'sed_coc_sh_photo'}
fields = [f for f in fields if f['field_code'] not in REMOVE]
by_code = {f['field_code']: f for f in fields}

# ---------------------------------------------------------------- fields: edits to existing rows
by_code['sed_prot_review_prompt'].update(depends_on_field='sed_predominant_type', depends_on_value='PROTEIN', description='Hard or significant protein sediment, or clumps after shaking: flag to the team; check ionic balance (citrate) and the hydrocolloid system; protein type and level matter (Mural)')
by_code['sed_min_review_prompt'].update(depends_on_field='sed_predominant_type', depends_on_value='MINERAL', description='Mineral deposits are a compliance concern for label claims: test the sediment and the beverage for minerals and flag to the project team; starch or hydrocolloids can help suspension (SOP, Mural)')
by_code['sed_coc_review_prompt'].update(depends_on_field='sed_predominant_type', depends_on_value='COCOA', description='Cocoa settling is not necessarily sediment; it usually shakes in. Take a photo and estimate the share of the package affected (Mural)')
by_code['sed_min_appearance']['sort_order'] = '160'; by_code['sed_coc_ring_present']['sort_order'] = '180'; by_code['sed_prot_review_prompt']['sort_order'] = '150'; by_code['sed_min_review_prompt']['sort_order'] = '170'; by_code['sed_coc_review_prompt']['sort_order'] = '195'; by_code['sed_comments']['sort_order'] = '400'
by_code['sed_predominant_type']['sort_order'] = '140'; by_code['sed_unsh_photo']['sort_order'] = '120'
by_code['cream_unsh_layer_description']['description'] = 'SOP Table 2 words: trace, slight thin ring, distinct 5 to 8 mm, heavy 8 to 10 mm, very heavy 10 mm or more'
by_code['cream_unsh_layer_color']['description'] = 'Cream is usually white or pale yellow; strawberry gives pink; real-food recipes can show an oily fat layer (SOP, Mural)'
by_code['cream_unsh_surface_volume_pct']['description'] = 'Share of the bottle that pours as cream layer, when a ruler cannot be used (SOP alternate method)'
by_code['general_overview_photo'].update(field_name='Full bottle photo (before pouring)', description='Whole bottle in a controlled light environment before anything is poured; mandatory record for the time point')
by_code['general_pour_out_video']['sort_order'] = '40'
by_code['lab_ph'].update(taxonomy_group='CORE', source_req='R-15, Team sheet', sort_order='30', description='pH typed in from LIMS for this sample and time point (no LIMS integration)', allow_na='Y')
by_code['lab_brix'].update(sort_order='140', description='Brix typed in from LIMS', allow_na='Y')
by_code['lab_particle_size_d50_um'].update(sort_order='150', description='Particle size D50 typed in from LIMS', allow_na='Y')
by_code['gel_gelled'].update(description='Product semi or fully solidified, hard to empty out (SOP). Soft gel that liquefies on shaking may not be a failure', source_req='R-11, SOP-202')
by_code['gel_spoilage_related'].update(description='Was the gel caused by micro or spoilage rather than the recipe? (Mural asks for this explicitly)')
by_code['nh_rippling_present'].update(description='Slight non-homogeneity heard or seen when pouring; not rated in the SOP, recorded here so trends can be seen', source_req='R-11, SOP-202')
by_code['nh_lumps_present'].update(description='Clumps, chunks or lumps when pouring into a beaker or through a sieve (SOP)')
for f in fields:
    if f['domain_code'] in ('GELLING', 'NON_HOMOG', 'PROTEIN_SAG'):
        f['mvp_scope'] = 'MVP' if f['field_code'] not in ('gel_type', 'gel_observations', 'nh_curdling_present', 'nh_lumps_size_class') else 'SCHEMA_READY'

# ---------------------------------------------------------------- fields: additions
add = []
# Test context (Mural / spreadsheet)
add += [F('shake_protocol', 'TEST_CONTEXT', 'CAPTURE', 'Shaking protocol', 'select', '', 'SHAKE_PROTOCOL', 'Y', 'N', sort=142, desc='SOP: shake 10 times with medium force in a 180° arc (1A>1B>1C>1B>1A), about 5 seconds in total, the same way every pull'),
        F('shake_count', 'TEST_CONTEXT', 'CAPTURE', 'Shakes applied', 'integer', 'shakes', '', 'N', 'N', 'shake_protocol', 'OTHER', sort=143, desc='Number of shakes when the SOP protocol was not followed'),
        F('exclude_from_trend', 'TEST_CONTEXT', 'CAPTURE', 'Exclude from trend analysis', 'boolean', '', '', 'N', 'N', src=XLS, sort=205, desc='Set when the pull is not representative (e.g. "way too cooked, ignore"); the record is kept but left out of trend charts'),
        F('exclude_reason', 'TEST_CONTEXT', 'CAPTURE', 'Exclusion reason', 'text', '', '', 'N', 'N', 'exclude_from_trend', 'Y', src=XLS, sort=206, desc='Why this pull is excluded')]
# Lab results, typed in (no LIMS integration)
add += [F('lab_source', 'LAB_RESULTS', 'LAB', 'Lab results source', 'select', '', 'LAB_SOURCE', 'Y', 'N', src=XLS, sort=10, desc='There is no LIMS integration: results are typed in from LIMS or measured in the PD lab, or marked not available'),
        F('lab_lims_reference', 'LAB_RESULTS', 'LAB', 'LIMS reference', 'text', '', '', 'N', 'N', 'lab_source', 'TYPED_FROM_LIMS', src=XLS, sort=20, desc='LIMS sample or result id for traceability'),
        F('lab_visc1_value', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 1', 'number', 'mPa·s', '', 'N', 'Y', src=XLS, sort=40, desc='First viscosity result (e.g. Physica CC27, 100 1/s, 20°C)'),
        F('lab_visc1_instrument', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 1 instrument', 'select', '', 'VISC_INSTRUMENT', 'N', 'N', src=XLS, sort=41, desc='Physica rheometer or Brookfield (Mural: align on one setting)'),
        F('lab_visc1_geometry', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 1 geometry / spindle', 'text', '', '', 'N', 'N', src=XLS, sort=42, desc='e.g. CC27'),
        F('lab_visc1_shear_rate', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 1 shear rate', 'number', '1/s', '', 'N', 'N', src=XLS, sort=43, desc='e.g. 100 or 1291'),
        F('lab_visc1_temp_c', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 1 measurement temperature', 'number', '°C', '', 'N', 'N', src=XLS, sort=44, desc='e.g. 20'),
        F('lab_visc2_value', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 2', 'number', 'mPa·s', '', 'N', 'Y', src=XLS, sort=50, desc='Second viscosity result at another temperature or setting (e.g. 4°C)'),
        F('lab_visc2_instrument', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 2 instrument', 'select', '', 'VISC_INSTRUMENT', 'N', 'N', src=XLS, sort=51, desc=''),
        F('lab_visc2_geometry', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 2 geometry / spindle', 'text', '', '', 'N', 'N', src=XLS, sort=52, desc=''),
        F('lab_visc2_shear_rate', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 2 shear rate', 'number', '1/s', '', 'N', 'N', src=XLS, sort=53, desc=''),
        F('lab_visc2_temp_c', 'LAB_RESULTS', 'VISCOSITY', 'Viscosity 2 measurement temperature', 'number', '°C', '', 'N', 'N', src=XLS, sort=54, desc=''),
        F('lab_measured_at', 'LAB_RESULTS', 'LAB', 'Lab measurement date', 'datetime', '', '', 'N', 'N', src=XLS, sort=160, desc='When the lab result was measured, from LIMS')]
# Media (Kneil)
add += [F('general_empty_bottle_photo', 'GENERAL_MEDIA', 'MEDIA', 'Emptied bottle photo (after pouring)', 'media_photo', '', '', 'Y', 'N', src='Kneil, SOP-202', sort=20, desc='Bottom and walls of the emptied bottle, to assess sediment and coating; mandatory record for the time point'),
        F('general_beaker_photo', 'GENERAL_MEDIA', 'MEDIA', 'Poured product in beaker photo', 'media_photo', '', '', 'N', 'N', src=SOP, sort=30, desc='Poured product, for serum and pour non-homogeneity')]
# Creaming
add += [F('cream_unsh_rating', 'CREAMING', 'UNSHAKEN', 'Creaming rating (unshaken)', 'select', '', 'RATING_CREAMING', 'Y', 'Y', sort=15, desc='SOP Table 2. Suggested from the ring thickness when measured; confirm or override'),
        F('cream_unsh_pour_exit_time_s', 'CREAMING', 'UNSHAKEN', 'Cream layer pour exit time', 'number', 's', '', 'N', 'Y', 'cream_unsh_present', 'Y', sort=95, desc='Seconds for the cream layer to exit the bottle while pouring (SOP alternate measure when a ruler cannot be used)'),
        F('cream_sh_rating', 'CREAMING', 'SHAKEN', 'Creaming rating (shaken)', 'select', '', 'RATING_CREAMING', 'N', 'Y', 'cream_unsh_present', 'Y', sort=131, desc='SOP Table 2 after the standard shake; 0 when the layer shakes in'),
        F('cream_sh_residue_type', 'CREAMING', 'SHAKEN', 'Residue after shaking', 'multiselect', '', 'CREAM_RESIDUE', 'N', 'N', 'cream_sh_result', 'PARTIAL|NOT_REDISPERSED', src=MURAL, sort=155, desc='What is left when the cream does not shake in: fat ring, flakes, plug at spout, skin or pad'),
        F('cream_rim_dried_residue_present', 'CREAMING', 'FLAGS', 'Dried residue on rim or foil seal', 'boolean', '', '', 'N', 'N', sort=182, desc='Dried or foamy product on the rim or seal is not creaming (SOP Figures 3 and 4); record it separately'),
        F('cream_rim_residue_fatty', 'CREAMING', 'FLAGS', 'Rim residue feels fatty', 'boolean', '', '', 'N', 'N', 'cream_rim_dried_residue_present', 'Y', sort=183, desc='SOP touch test: if the ring feels fatty it counts as creaming, not a foaming issue')]
# Serum
add += [F('serum_unsh_rating', 'SERUM', 'UNSHAKEN', 'Serum rating (unshaken)', 'select', '', 'RATING_SERUM', 'Y', 'Y', sort=15, desc='SOP Table 3. Suggested from the % of package volume when measured; confirm or override'),
        F('serum_sh_rating', 'SERUM', 'SHAKEN', 'Serum rating (shaken)', 'select', '', 'RATING_SERUM', 'N', 'Y', 'serum_unsh_present', 'Y', sort=101, desc='SOP Table 3 after the standard shake; 0 when it shakes in'),
        F('serum_resep_check_performed', 'SERUM', 'RESEPARATION', 'Re-separation check after shaking', 'boolean', '', '', 'N', 'N', src=SOP, scope='SCHEMA_READY', sort=160, desc='For products with a consumer usage period (e.g. 24 h tube feeding): was the shaken product checked again later?'),
        F('serum_resep_hours_after_shake', 'SERUM', 'RESEPARATION', 'Hours after shaking', 'number', 'h', '', 'N', 'N', 'serum_resep_check_performed', 'Y', src=SOP, scope='SCHEMA_READY', sort=161, desc=''),
        F('serum_resep_present', 'SERUM', 'RESEPARATION', 'Serum re-formed', 'boolean', '', '', 'N', 'N', 'serum_resep_check_performed', 'Y', src=SOP, scope='SCHEMA_READY', sort=162, desc='Re-separation within the usage period can be a product concern (SOP Peptamen example)'),
        F('serum_resep_rating', 'SERUM', 'RESEPARATION', 'Re-separation serum rating', 'select', '', 'RATING_SERUM', 'N', 'N', 'serum_resep_present', 'Y', src=SOP, scope='SCHEMA_READY', sort=163, desc=''),
        F('serum_resep_photo', 'SERUM', 'RESEPARATION', 'Re-separation photo', 'media_photo', '', '', 'N', 'N', 'serum_resep_present', 'Y', src=SOP, scope='SCHEMA_READY', sort=164, desc='')]
# Sediment (restructured: domain-level measurements, type sub-flows keep type-specific detail)
add += [F('sed_unsh_rating', 'SEDIMENT', 'UNSHAKEN', 'Sediment rating (unshaken)', 'select', '', 'RATING_SEDIMENT', 'Y', 'Y', sort=15, desc='SOP Table 4. Suggested from height and coverage when measured; bottles with a raised center (BOOST) need 4 mm for a 4'),
        F('sed_unsh_height_value', 'SEDIMENT', 'UNSHAKEN', 'Sediment height (unshaken)', 'number', 'mm', '', 'N', 'Y', 'sed_unsh_present', 'Y', tax='CORE', src='R-10, SOP-202', sort=30, desc='Ruler reading at the outer rim (SOP worst case), 0 mm at the edge'),
        F('sed_unsh_height_unit', 'SEDIMENT', 'UNSHAKEN', 'Sediment height unit', 'select', '', 'UNIT_LENGTH', 'N', 'N', 'sed_unsh_present', 'Y', tax='CORE', src='R-10', sort=31, desc='mm (SOP) or cm (older sheets)'),
        F('sed_unsh_coverage', 'SEDIMENT', 'UNSHAKEN', 'Coverage of the bottom', 'select', '', 'SED_COVERAGE', 'N', 'N', 'sed_unsh_present', 'Y', sort=40, desc='Partial ring, complete ring, outer ring with clear center, entire bottom, depressions only'),
        F('sed_unsh_texture', 'SEDIMENT', 'UNSHAKEN', 'Sediment texture', 'select', '', 'SED_TEXTURE', 'N', 'N', 'sed_unsh_present', 'Y', tax='CORE', src='R-10, Team sheet', sort=50, desc='Loose, soft, compact, hard, sticky, lumpy, sandy, flaky'),
        F('sed_measurement_point', 'SEDIMENT', 'UNSHAKEN', 'Measured', 'select', '', 'SED_MEAS_POINT', 'N', 'N', 'sed_unsh_present', 'Y', sort=60, desc='Before pouring through a clear bottle, or after pouring in the emptied bottle (SOP default)'),
        F('sed_measurement_location', 'SEDIMENT', 'UNSHAKEN', 'Measurement location', 'select', '', 'SED_MEAS_LOCATION', 'N', 'N', 'sed_unsh_present', 'Y', sort=70, desc='SOP: measure at the outer rim to record the worst case'),
        F('sed_weight_g', 'SEDIMENT', 'UNSHAKEN', 'Sediment weight', 'number', 'g', '', 'N', 'Y', 'sed_unsh_present', 'Y', sort=80, desc='Optional weighing when an empty package is available; more reliable than the 0 to 5 rating (SOP)'),
        F('sed_bottle_cut_to_evaluate', 'SEDIMENT', 'UNSHAKEN', 'Bottle cut open to evaluate', 'boolean', '', '', 'N', 'N', 'sed_unsh_present', 'Y', sort=90, desc='Opaque bottles may need to be cut to see the sediment (SOP)'),
        F('sed_bottle_coating_present', 'SEDIMENT', 'UNSHAKEN', 'Bottle coating present (not sediment)', 'boolean', '', '', 'N', 'N', src=XLS, sort=100, desc='Thick product coating the walls after pouring; recorded separately because it is not true sediment'),
        F('sed_coc_settling_pct_volume', 'SEDIMENT', 'COCOA', 'Cocoa settling, share of package', 'percent', '%', '', 'N', 'Y', 'sed_predominant_type', 'COCOA', src=MURAL, sort=190, desc='Estimated share of the package with cocoa settling (e.g. bottom third)'),
        F('sed_sh_rating', 'SEDIMENT', 'SHAKEN', 'Sediment rating (shaken)', 'select', '', 'RATING_SEDIMENT', 'N', 'Y', 'sed_unsh_present', 'Y', sort=300, desc='SOP Table 4 after the standard shake'),
        F('sed_sh_height_value', 'SEDIMENT', 'SHAKEN', 'Sediment height (shaken)', 'number', 'mm', '', 'N', 'Y', 'sed_unsh_present', 'Y', tax='CORE', src='R-10, Team sheet', sort=310, desc='Residual sediment after shaking and pouring'),
        F('sed_sh_height_unit', 'SEDIMENT', 'SHAKEN', 'Shaken sediment height unit', 'select', '', 'UNIT_LENGTH', 'N', 'N', 'sed_unsh_present', 'Y', tax='CORE', src='R-10', sort=311, desc=''),
        F('sed_sh_shake_in_extent', 'SEDIMENT', 'SHAKEN', 'Shake-in extent', 'select', '', 'SHAKE_EXTENT', 'N', 'N', 'sed_unsh_present', 'Y', tax='CORE', src='R-10', sort=320, desc='How much of the sediment redispersed'),
        F('sed_sh_lumps_present', 'SEDIMENT', 'SHAKEN', 'Shaking produced clumps', 'boolean', '', '', 'N', 'N', 'sed_unsh_present', 'Y', src=MURAL, sort=330, desc='Sediment lifted from the bottom as clumps after shaking; flag to the team'),
        F('sed_sh_photo', 'SEDIMENT', 'SHAKEN', 'Shaken sediment photo', 'media_photo', '', '', 'N', 'N', 'sed_unsh_present', 'Y', tax='CORE', src='R-10', sort=340, desc=''),
        F('sed_composition_test_requested', 'SEDIMENT', 'FLAGS', 'Composition test requested', 'boolean', '', '', 'N', 'N', 'sed_unsh_present', 'Y', src=SOP, sort=350, desc='Sediment sent for mineral / protein analysis when the type is unclear (SOP)')]
# Gelling and non-homogeneity additions
add += [F('gel_too_thick_to_pour', 'GELLING', 'UNSHAKEN', 'Too thick to pour', 'boolean', '', '', 'N', 'N', 'gel_gelled', 'Y', src=XLS, sort=25, desc='Product would not pour unshaken (the reason older sheets used 9999 for the unshaken ratings)'),
        F('nh_lumps_context', 'NON_HOMOG', 'UNSHAKEN', 'When lumps were seen', 'multiselect', '', 'NH_CONTEXT', 'N', 'N', 'nh_lumps_present', 'Y', src=MURAL, sort=35, desc='Unshaken pour shows risk of later gelling or sedimentation; lumps after shaking may be sediment lifting from the bottom; describe both'),
        F('nh_sieve_used', 'NON_HOMOG', 'UNSHAKEN', 'Poured through a sieve', 'boolean', '', '', 'N', 'N', src=MURAL, sort=45, desc='Sieve pouring helps for collagen and high-protein products'),
        F('nh_sieve_mesh', 'NON_HOMOG', 'UNSHAKEN', 'Sieve mesh', 'text', '', '', 'N', 'N', 'nh_sieve_used', 'Y', src=MURAL, sort=46, desc=''),
        F('nh_smooth_after_shaking', 'NON_HOMOG', 'SHAKEN', 'Smooth after shaking', 'boolean', '', '', 'N', 'N', src=XLS, sort=55, desc='"Rippling when pouring, smooth when shaken" is the most common comment in the team sheets'),
        F('nh_pour_video', 'NON_HOMOG', 'GENERAL', 'Pour video (rippling)', 'media_video', '', '', 'N', 'N', src=MURAL, sort=65, desc='Video of the pour to monitor rippling over time')]
# Appearance and sensory (optional)
add += [F('app_color_change_vs_t0', 'APPEARANCE_SENSORY', 'COLOR', 'Color change vs T0', 'select', '', 'SEVERITY_NONE', 'N', 'Y', scope='SCHEMA_READY', sort=10, desc=''),
        F('app_color_method', 'APPEARANCE_SENSORY', 'COLOR', 'Color method', 'select', '', 'COLOR_METHOD', 'N', 'N', scope='SCHEMA_READY', sort=20, desc='Visual, L*a*b* meter or DigiEye (Mural)'),
        F('app_color_l', 'APPEARANCE_SENSORY', 'COLOR', 'L*', 'number', '', '', 'N', 'Y', 'app_color_method', 'LAB_METER|DIGIEYE', scope='SCHEMA_READY', sort=30, desc=''),
        F('app_color_a', 'APPEARANCE_SENSORY', 'COLOR', 'a*', 'number', '', '', 'N', 'Y', 'app_color_method', 'LAB_METER|DIGIEYE', scope='SCHEMA_READY', sort=31, desc=''),
        F('app_color_b', 'APPEARANCE_SENSORY', 'COLOR', 'b*', 'number', '', '', 'N', 'Y', 'app_color_method', 'LAB_METER|DIGIEYE', scope='SCHEMA_READY', sort=32, desc=''),
        F('sens_recorded', 'APPEARANCE_SENSORY', 'SENSORY', 'Sensory recorded', 'boolean', '', '', 'N', 'N', scope='SCHEMA_READY', sort=40, desc='Sensory on released product as needed (Mural)'),
        F('sens_texture', 'APPEARANCE_SENSORY', 'SENSORY', 'Texture in mouth or on pour', 'select', '', 'TEXTURE_SENSORY', 'N', 'N', 'sens_recorded', 'Y', src=XLS, scope='SCHEMA_READY', sort=41, desc='Smooth, slightly thicker, milkshake, pudding, lumpy, gritty'),
        F('sens_notes', 'APPEARANCE_SENSORY', 'SENSORY', 'Sensory notes', 'longtext', '', '', 'N', 'N', 'sens_recorded', 'Y', src=XLS, scope='SCHEMA_READY', sort=42, desc='')]
# Custom slots
for i in (1, 2, 3):
    add += [F(f'custom{i}_name', 'CUSTOM', 'CUSTOM', f'Custom observation {i}: name', 'text', '', '', 'N', 'N', src=MURAL, scope='SCHEMA_READY', sort=i * 10, desc='Name of a one-off parameter for this template'),
            F(f'custom{i}_unshaken', 'CUSTOM', 'CUSTOM', f'Custom observation {i}: unshaken', 'text', '', '', 'N', 'Y', src=MURAL, scope='SCHEMA_READY', sort=i * 10 + 1, desc=''),
            F(f'custom{i}_shaken', 'CUSTOM', 'CUSTOM', f'Custom observation {i}: shaken', 'text', '', '', 'N', 'Y', src=MURAL, scope='SCHEMA_READY', sort=i * 10 + 2, desc='')]
fields += add
for f in fields:
    f.setdefault('sort_order', '0')

# ---------------------------------------------------------------- templates regenerated from the catalog
dom_order = {d['domain_code']: int(d['sort_order']) for d in domains}
fields.sort(key=lambda r: (dom_order.get(r['domain_code'], 999), int(r['sort_order'])))
dom_name = {d['domain_code']: d['domain_name'] for d in domains}
def section(domain, scope=None, label=None):
    fs = [f['field_code'] for f in fields if f['domain_code'] == domain and (scope is None or f['mvp_scope'] == scope)]
    return {'label': label or dom_name[domain], 'fields': fs}
RTD_DOMAINS = ['TEST_CONTEXT', 'LAB_RESULTS', 'GENERAL_MEDIA', 'HOMOG', 'CREAMING', 'SERUM', 'SEDIMENT', 'GELLING', 'NON_HOMOG', 'PROTEIN_SAG']
templates = json.load(open(TEMPLATES))
byid = {t['templateId']: t for t in templates}
byid['TPL_RTD_MVP'].update(templateName='RTD liquid: SOP guided questionnaire', description='Homogeneity first, then unshaken and shaken creaming, serum and sediment with the SOP 0 to 5 rating suggested from each measurement, plus gelling, rippling and protein sagging. Lab results typed in from LIMS.',
                           sections=[section(d, 'MVP', 'Lab results (typed from LIMS)' if d == 'LAB_RESULTS' else None) for d in RTD_DOMAINS])
byid['TPL_RTD_FULL'].update(templateName='RTD liquid: full catalog', description='Every RTD descriptor including re-separation checks, appearance and sensory, and three custom slots.',
                            sections=[section(d) for d in RTD_DOMAINS + ['APPEARANCE_SENSORY', 'CUSTOM']])
quick = ['project_code', 'ar_number', 'trial_number', 'variant_number', 'sample_code', 'time_point', 'temperature_condition', 'formulation_class', 'shake_protocol', 'result_type', 'observer_user_id', 'observation_timestamp', 'test_status', 'overall_result', 'overall_comments']
byid['TPL_RTD_QUICK'].update(templateName='RTD liquid: SOP rating sheet', description='The six SOP ratings (creaming, serum, sediment; unshaken and shaken), sediment heights, pH and viscosity, photos and a comment: the team spreadsheet as a form.',
                             sections=[{'label': 'Test context', 'fields': quick},
                                       {'label': 'Lab results (typed from LIMS)', 'fields': ['lab_source', 'lab_ph', 'lab_visc1_value', 'lab_visc1_instrument', 'lab_visc1_shear_rate', 'lab_visc1_temp_c', 'lab_visc2_value', 'lab_visc2_temp_c']},
                                       {'label': 'Photos', 'fields': ['general_overview_photo', 'general_empty_bottle_photo']},
                                       {'label': 'SOP ratings', 'fields': ['homog_unshaken_homogeneous', 'cream_unsh_present', 'cream_unsh_rating', 'cream_sh_rating', 'serum_unsh_present', 'serum_unsh_rating', 'serum_sh_rating', 'sed_unsh_present', 'sed_unsh_rating', 'sed_unsh_height_value', 'sed_unsh_height_unit', 'sed_sh_rating', 'sed_sh_height_value', 'sed_sh_height_unit', 'sed_bottle_coating_present', 'gel_gelled', 'nh_rippling_present', 'nh_lumps_present', 'nh_smooth_after_shaking']}])
for tid in ('TPL_POWDER', 'TPL_VMS'):
    for s in byid[tid]['sections']:
        if s['label'] == 'Test context': s['fields'] = [c for c in s['fields'] if c in {f['field_code'] for f in fields}]
        if s['label'] == 'Sample media': s['fields'] = ['general_overview_photo']

# ---------------------------------------------------------------- validate and write
codes = {f['field_code'] for f in fields}
assert len(codes) == len(fields), 'duplicate field codes'
vcodes = {v['vocabulary_code'] for v in vocab}
for f in fields:
    assert not f['vocabulary_code'] or f['vocabulary_code'] in vcodes, f['field_code']
    assert not f['depends_on_field'] or f['depends_on_field'] in codes, f['field_code']
for t in templates:
    for s in t['sections']:
        for c in s['fields']: assert c in codes, (t['templateId'], c)
write(FIELDS, fields, FCOLS); write(VOCAB, vocab, VCOLS); write(DOMAINS, domains, DCOLS)
json.dump(templates, open(TEMPLATES, 'w'), indent=2)
from collections import Counter
print('fields', len(fields), Counter(f['taxonomy_group'] for f in fields), 'vocabularies', len(vcodes), 'values', len(vocab))
print({t['templateId']: sum(len(s['fields']) for s in t['sections']) for t in templates})
