# Schema summary

Generated 2026-09-01 17:25 UTC from field_catalog.csv, vocabularies.csv, domains.csv, templates.json.

- URS taxonomy fields (from R-02 to R-17, restructured where the SOP measures differently): **113**
- SOP / team-sheet / Mural additions (ratings, method metadata, coverage, shaking protocol, sensory, custom): **66**
- Extension fields (powder / VMS, outside the URS): **16**
- Controlled vocabularies: **46** with **209** values
- Templates seeded: **5**

## Fields by domain

| Domain | Source | MVP scope | Fields | Required | Allow N/A | Media | Branching |
|---|---|---|---|---|---|---|---|
| Test context | R-02 | MVP | 26 | 14 | 4 | 0 | 2 |
| Lab results | R-15, Team sheet | MVP | 16 | 1 | 5 | 0 | 1 |
| Sample media | R-17 | MVP | 4 | 2 | 0 | 4 | 0 |
| Homogeneity | R-07 | MVP | 10 | 2 | 2 | 2 | 6 |
| Creaming | R-08 | MVP | 26 | 3 | 7 | 3 | 22 |
| Serum separation | R-09 | MVP | 26 | 3 | 6 | 3 | 22 |
| Sediment | R-10 | MVP | 27 | 4 | 7 | 2 | 23 |
| Gelling | R-11, SOP-202 | MVP | 10 | 1 | 1 | 1 | 8 |
| Non-homogeneity | R-11, SOP-202 | MVP | 13 | 0 | 3 | 2 | 4 |
| Protein sagging | R-11, SOP-202 | MVP | 4 | 1 | 1 | 1 | 2 |
| Appearance and sensory | SOP-202, Mural | SCHEMA_READY | 8 | 0 | 4 | 0 | 5 |
| Custom observations | Mural | SCHEMA_READY | 9 | 0 | 6 | 0 | 0 |
| Powder (extension) | OnePager | SCHEMA_READY | 8 | 0 | 7 | 1 | 0 |
| VMS (extension) | OnePager | SCHEMA_READY | 8 | 0 | 7 | 1 | 0 |

## Templates

| Template | Class | Status | Fields |
|---|---|---|---|
| RTD liquid: SOP guided questionnaire | LIQUID_RTD | ACTIVE | 149 |
| RTD liquid: full catalog | LIQUID_RTD | ACTIVE | 179 |
| RTD liquid: SOP rating sheet | LIQUID_RTD | ACTIVE | 44 |
| Powder: physical stability | POWDER | DRAFT | 31 |
| VMS: physical stability | VMS | DRAFT | 31 |

## Field list

| Field code | Domain | Sub-domain | Label | Type | Unit | Vocabulary | Req | N/A | Depends on | Req # | Scope |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `project_code` | TEST_CONTEXT | CONTEXT | Project code | ref |  |  | Y | N |  | R-02 | MVP |
| `ar_number` | TEST_CONTEXT | CONTEXT | Stability AR number | ref |  |  | Y | N |  | R-03 | MVP |
| `trial_number` | TEST_CONTEXT | CONTEXT | Trial number | ref |  |  | Y | N |  | R-03 | MVP |
| `variant_number` | TEST_CONTEXT | CONTEXT | Variant number | ref |  |  | Y | N |  | R-03 | MVP |
| `sample_code` | TEST_CONTEXT | CONTEXT | Sample code | ref |  |  | Y | N |  | R-03 | MVP |
| `time_point` | TEST_CONTEXT | CONTEXT | Time point | ref |  | TIME_POINT | Y | N |  | R-04 | MVP |
| `temperature_condition` | TEST_CONTEXT | CONTEXT | Storage condition | ref |  | TEMP_CONDITION | Y | N |  | R-05 | MVP |
| `formulation_class` | TEST_CONTEXT | CONTEXT | Formulation class | select |  | FORMULATION_CLASS | Y | N |  | R-16 | MVP |
| `product_format` | TEST_CONTEXT | CONTEXT | Product format | select |  | PRODUCT_FORMAT | N | N |  | R-26 | MVP |
| `container_type` | TEST_CONTEXT | CONTEXT | Container type | select |  | CONTAINER_TYPE | N | N |  | R-26 | MVP |
| `package_volume_ml` | TEST_CONTEXT | CONTEXT | Nominal package volume | number | mL |  | N | Y |  | R-09 | MVP |
| `package_fill_height_mm` | TEST_CONTEXT | CONTEXT | Fill height | number | mm |  | N | Y |  | R-09 | MVP |
| `sample_storage_orientation` | TEST_CONTEXT | CONTEXT | Storage orientation | select |  | ORIENTATION | N | N |  | R-04 | MVP |
| `sample_temperature_at_test` | TEST_CONTEXT | CONTEXT | Sample temperature at observation | number | °C |  | N | Y |  | R-05 | MVP |
| `sample_opened_previously` | TEST_CONTEXT | CONTEXT | Sample opened previously | boolean |  |  | N | N |  | R-02 | MVP |
| `shake_protocol` | TEST_CONTEXT | CAPTURE | Shaking protocol | select |  | SHAKE_PROTOCOL | Y | N |  | SOP-202 | MVP |
| `shake_count` | TEST_CONTEXT | CAPTURE | Shakes applied | integer | shakes |  | N | N | shake_protocol = OTHER | SOP-202 | MVP |
| `result_type` | TEST_CONTEXT | CONTEXT | Result type | select |  | RESULT_TYPE | Y | N |  | R-02 | MVP |
| `plan_status` | TEST_CONTEXT | CONTEXT | Plan status at capture | select |  | PLAN_STATUS | N | N |  | R-04 | MVP |
| `observer_user_id` | TEST_CONTEXT | CONTEXT | Observer | ref |  |  | Y | N |  | R-02 | MVP |
| `observation_timestamp` | TEST_CONTEXT | CONTEXT | Observation timestamp | datetime |  |  | Y | N |  | R-02 | MVP |
| `test_status` | TEST_CONTEXT | CONTEXT | Test status | select |  | TEST_STATUS | Y | N |  | R-31 | MVP |
| `overall_result` | TEST_CONTEXT | CONTEXT | Overall result | select |  | OVERALL_RESULT | Y | Y |  | R-13 | MVP |
| `exclude_from_trend` | TEST_CONTEXT | CAPTURE | Exclude from trend analysis | boolean |  |  | N | N |  | Team sheet | MVP |
| `exclude_reason` | TEST_CONTEXT | CAPTURE | Exclusion reason | text |  |  | N | N | exclude_from_trend = Y | Team sheet | MVP |
| `overall_comments` | TEST_CONTEXT | CONTEXT | Overall comments | longtext |  |  | N | N |  | R-02 | MVP |
| `lab_source` | LAB_RESULTS | LAB | Lab results source | select |  | LAB_SOURCE | Y | N |  | Team sheet | MVP |
| `lab_lims_reference` | LAB_RESULTS | LAB | LIMS reference | text |  |  | N | N | lab_source = TYPED_FROM_LIMS | Team sheet | MVP |
| `lab_ph` | LAB_RESULTS | LAB | pH | number | pH |  | N | Y |  | R-15, Team sheet | MVP |
| `lab_visc1_value` | LAB_RESULTS | VISCOSITY | Viscosity 1 | number | mPa·s |  | N | Y |  | Team sheet | MVP |
| `lab_visc1_instrument` | LAB_RESULTS | VISCOSITY | Viscosity 1 instrument | select |  | VISC_INSTRUMENT | N | N |  | Team sheet | MVP |
| `lab_visc1_geometry` | LAB_RESULTS | VISCOSITY | Viscosity 1 geometry / spindle | text |  |  | N | N |  | Team sheet | MVP |
| `lab_visc1_shear_rate` | LAB_RESULTS | VISCOSITY | Viscosity 1 shear rate | number | 1/s |  | N | N |  | Team sheet | MVP |
| `lab_visc1_temp_c` | LAB_RESULTS | VISCOSITY | Viscosity 1 measurement temperature | number | °C |  | N | N |  | Team sheet | MVP |
| `lab_visc2_value` | LAB_RESULTS | VISCOSITY | Viscosity 2 | number | mPa·s |  | N | Y |  | Team sheet | MVP |
| `lab_visc2_instrument` | LAB_RESULTS | VISCOSITY | Viscosity 2 instrument | select |  | VISC_INSTRUMENT | N | N |  | Team sheet | MVP |
| `lab_visc2_geometry` | LAB_RESULTS | VISCOSITY | Viscosity 2 geometry / spindle | text |  |  | N | N |  | Team sheet | MVP |
| `lab_visc2_shear_rate` | LAB_RESULTS | VISCOSITY | Viscosity 2 shear rate | number | 1/s |  | N | N |  | Team sheet | MVP |
| `lab_visc2_temp_c` | LAB_RESULTS | VISCOSITY | Viscosity 2 measurement temperature | number | °C |  | N | N |  | Team sheet | MVP |
| `lab_brix` | LAB_RESULTS | LAB | Brix | number | °Bx |  | N | Y |  | R-15 | MVP |
| `lab_particle_size_d50_um` | LAB_RESULTS | LAB | Particle size D50 | number | µm |  | N | Y |  | R-15 | MVP |
| `lab_measured_at` | LAB_RESULTS | LAB | Lab measurement date | datetime |  |  | N | N |  | Team sheet | MVP |
| `general_overview_photo` | GENERAL_MEDIA | MEDIA | Full bottle photo (before pouring) | media_photo |  |  | Y | N |  | R-17 | MVP |
| `general_empty_bottle_photo` | GENERAL_MEDIA | MEDIA | Emptied bottle photo (after pouring) | media_photo |  |  | Y | N |  | Kneil, SOP-202 | MVP |
| `general_beaker_photo` | GENERAL_MEDIA | MEDIA | Poured product in beaker photo | media_photo |  |  | N | N |  | SOP-202 | MVP |
| `general_pour_out_video` | GENERAL_MEDIA | MEDIA | Pour-out video | media_video |  |  | N | N |  | R-17 | MVP |
| `homog_unshaken_homogeneous` | HOMOG | UNSHAKEN | Homogeneous when unshaken | boolean |  |  | Y | Y |  | R-07 | MVP |
| `homog_unshaken_appearance` | HOMOG | UNSHAKEN | Unshaken appearance | select |  | APPEARANCE | N | N | homog_unshaken_homogeneous = N | R-07 | MVP |
| `homog_unshaken_photo` | HOMOG | UNSHAKEN | Unshaken photo | media_photo |  |  | Y | N |  | R-07 | MVP |
| `homog_shaken_test_performed` | HOMOG | SHAKEN | Shaken test performed | boolean |  |  | N | N |  | R-07 | MVP |
| `homog_shaken_homogeneous` | HOMOG | SHAKEN | Homogeneous after shaking | boolean |  |  | N | Y | homog_shaken_test_performed = Y | R-07 | MVP |
| `homog_post_shake_color_change` | HOMOG | SHAKEN | Color change after shaking | boolean |  |  | N | N | homog_shaken_test_performed = Y | R-07 | MVP |
| `homog_post_shake_color_description` | HOMOG | SHAKEN | Post-shake color description | select |  | COLOR_DESC | N | N | homog_post_shake_color_change = Y | R-07 | MVP |
| `homog_post_shake_color_code` | HOMOG | SHAKEN | Post-shake color code | code |  | COLOR_CODE | N | N | homog_post_shake_color_change = Y | R-07 | MVP |
| `homog_shaken_photo` | HOMOG | SHAKEN | Shaken photo | media_photo |  |  | N | N | homog_shaken_test_performed = Y | R-07 | MVP |
| `homog_comments` | HOMOG | GENERAL | Homogeneity comments | longtext |  |  | N | N |  | R-07 | MVP |
| `cream_unsh_present` | CREAMING | UNSHAKEN | Creaming present (unshaken) | boolean |  |  | Y | Y |  | R-08 | MVP |
| `cream_unsh_rating` | CREAMING | UNSHAKEN | Creaming rating (unshaken) | select |  | RATING_CREAMING | Y | Y |  | SOP-202 | MVP |
| `cream_unsh_layer_measurable` | CREAMING | UNSHAKEN | Cream layer measurable | boolean |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_layer_thickness_value` | CREAMING | UNSHAKEN | Cream layer thickness | number | mm |  | N | Y | cream_unsh_layer_measurable = Y | R-08 | MVP |
| `cream_unsh_layer_thickness_unit` | CREAMING | UNSHAKEN | Cream layer thickness unit | select |  | UNIT_LENGTH | N | N | cream_unsh_layer_measurable = Y | R-08 | MVP |
| `cream_unsh_layer_description` | CREAMING | UNSHAKEN | Cream layer description | select |  | CREAM_LAYER_DESC | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_layer_color` | CREAMING | UNSHAKEN | Cream layer color | select |  | COLOR_DESC | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_marbling_present` | CREAMING | UNSHAKEN | Marbling present | boolean |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_minor_spots_present` | CREAMING | UNSHAKEN | Minor spots present | boolean |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_surface_volume_pct` | CREAMING | UNSHAKEN | Surface coverage | percent | % |  | N | Y | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_pour_exit_time_s` | CREAMING | UNSHAKEN | Cream layer pour exit time | number | s |  | N | Y | cream_unsh_present = Y | SOP-202 | MVP |
| `cream_unsh_photo` | CREAMING | UNSHAKEN | Unshaken creaming photo | media_photo |  |  | Y | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_pour_out_video` | CREAMING | UNSHAKEN | Pour-out video | media_video |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_unsh_pour_out_result` | CREAMING | UNSHAKEN | Pour-out result | select |  | POUR_RESULT | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_sh_shakes_in` | CREAMING | SHAKEN | Shakes in | boolean |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_sh_rating` | CREAMING | SHAKEN | Creaming rating (shaken) | select |  | RATING_CREAMING | N | Y | cream_unsh_present = Y | SOP-202 | MVP |
| `cream_sh_result` | CREAMING | SHAKEN | Shaken result | select |  | SHAKE_RESULT | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_sh_residue_type` | CREAMING | SHAKEN | Residue after shaking | multiselect |  | CREAM_RESIDUE | N | N | cream_sh_result = PARTIAL|NOT_REDISPERSED | Mural | MVP |
| `cream_sh_residual_pct` | CREAMING | SHAKEN | Residual cream after shaking | percent | % |  | N | Y | cream_sh_result = PARTIAL|NOT_REDISPERSED | R-08 | MVP |
| `cream_sh_photo` | CREAMING | SHAKEN | Shaken creaming photo | media_photo |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_emulsifier_flag` | CREAMING | FLAGS | Emulsifier review flag | boolean |  |  | N | N | cream_unsh_present = Y | R-08 | MVP |
| `cream_rim_dried_residue_present` | CREAMING | FLAGS | Dried residue on rim or foil seal | boolean |  |  | N | N |  | SOP-202 | MVP |
| `cream_rim_residue_fatty` | CREAMING | FLAGS | Rim residue feels fatty | boolean |  |  | N | N | cream_rim_dried_residue_present = Y | SOP-202 | MVP |
| `cream_market_restriction_flag` | CREAMING | FLAGS | Market restriction flag | boolean |  |  | N | N | cream_emulsifier_flag = Y | R-08 | MVP |
| `cream_review_prompt` | CREAMING | FLAGS | Creaming review guidance | guidance |  |  | N | N | cream_sh_result = PARTIAL|NOT_REDISPERSED | R-08 | MVP |
| `cream_comments` | CREAMING | GENERAL | Creaming comments | longtext |  |  | N | N |  | R-08 | MVP |
| `serum_unsh_present` | SERUM | UNSHAKEN | Serum separation present (unshaken) | boolean |  |  | Y | Y |  | R-09 | MVP |
| `serum_unsh_rating` | SERUM | UNSHAKEN | Serum rating (unshaken) | select |  | RATING_SERUM | Y | Y |  | SOP-202 | MVP |
| `serum_unsh_measurable` | SERUM | UNSHAKEN | Serum layer measurable | boolean |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_unsh_value` | SERUM | UNSHAKEN | Serum layer measurement | number |  |  | N | Y | serum_unsh_measurable = Y | R-09 | MVP |
| `serum_unsh_unit` | SERUM | UNSHAKEN | Serum measurement unit | select |  | UNIT_SERUM | N | N | serum_unsh_measurable = Y | R-09 | MVP |
| `serum_unsh_pct_package_volume` | SERUM | UNSHAKEN | Serum as percent of package volume | percent | % |  | N | Y | serum_unsh_present = Y | R-09 | MVP |
| `serum_unsh_locations` | SERUM | UNSHAKEN | Serum locations | multiselect |  | SERUM_LOCATION | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_unsh_clarity` | SERUM | UNSHAKEN | Serum clarity | select |  | SERUM_CLARITY | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_unsh_color` | SERUM | UNSHAKEN | Serum color | select |  | COLOR_DESC | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_unsh_photo` | SERUM | UNSHAKEN | Unshaken serum photo | media_photo |  |  | Y | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_sh_shakes_in` | SERUM | SHAKEN | Shakes in | boolean |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_sh_rating` | SERUM | SHAKEN | Serum rating (shaken) | select |  | RATING_SERUM | N | Y | serum_unsh_present = Y | SOP-202 | MVP |
| `serum_sh_value` | SERUM | SHAKEN | Residual serum after shaking | number |  |  | N | Y | serum_sh_shakes_in = N | R-09 | MVP |
| `serum_sh_unit` | SERUM | SHAKEN | Residual serum unit | select |  | UNIT_SERUM | N | N | serum_sh_shakes_in = N | R-09 | MVP |
| `serum_sh_result` | SERUM | SHAKEN | Shaken result | select |  | SHAKE_RESULT | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_sh_photo` | SERUM | SHAKEN | Shaken serum photo | media_photo |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_gelation_flag` | SERUM | FLAGS | Gelation suspected | boolean |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_protein_flag` | SERUM | FLAGS | Protein instability suspected | boolean |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_resep_check_performed` | SERUM | RESEPARATION | Re-separation check after shaking | boolean |  |  | N | N |  | SOP-202 | SCHEMA_READY |
| `serum_resep_hours_after_shake` | SERUM | RESEPARATION | Hours after shaking | number | h |  | N | N | serum_resep_check_performed = Y | SOP-202 | SCHEMA_READY |
| `serum_resep_present` | SERUM | RESEPARATION | Serum re-formed | boolean |  |  | N | N | serum_resep_check_performed = Y | SOP-202 | SCHEMA_READY |
| `serum_resep_rating` | SERUM | RESEPARATION | Re-separation serum rating | select |  | RATING_SERUM | N | N | serum_resep_present = Y | SOP-202 | SCHEMA_READY |
| `serum_resep_photo` | SERUM | RESEPARATION | Re-separation photo | media_photo |  |  | N | N | serum_resep_present = Y | SOP-202 | SCHEMA_READY |
| `serum_scale_up_viscosity_warning` | SERUM | FLAGS | Scale-up viscosity warning | boolean |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_review_prompt` | SERUM | FLAGS | Serum review guidance | guidance |  |  | N | N | serum_unsh_present = Y | R-09 | MVP |
| `serum_comments` | SERUM | GENERAL | Serum comments | longtext |  |  | N | N |  | R-09 | MVP |
| `sed_unsh_present` | SEDIMENT | UNSHAKEN | Sediment present (unshaken) | boolean |  |  | Y | Y |  | R-10 | MVP |
| `sed_unsh_rating` | SEDIMENT | UNSHAKEN | Sediment rating (unshaken) | select |  | RATING_SEDIMENT | Y | Y |  | SOP-202 | MVP |
| `sed_unsh_height_value` | SEDIMENT | UNSHAKEN | Sediment height (unshaken) | number | mm |  | N | Y | sed_unsh_present = Y | R-10, SOP-202 | MVP |
| `sed_unsh_height_unit` | SEDIMENT | UNSHAKEN | Sediment height unit | select |  | UNIT_LENGTH | N | N | sed_unsh_present = Y | R-10 | MVP |
| `sed_unsh_coverage` | SEDIMENT | UNSHAKEN | Coverage of the bottom | select |  | SED_COVERAGE | N | N | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_unsh_texture` | SEDIMENT | UNSHAKEN | Sediment texture | select |  | SED_TEXTURE | N | N | sed_unsh_present = Y | R-10, Team sheet | MVP |
| `sed_measurement_point` | SEDIMENT | UNSHAKEN | Measured | select |  | SED_MEAS_POINT | N | N | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_measurement_location` | SEDIMENT | UNSHAKEN | Measurement location | select |  | SED_MEAS_LOCATION | N | N | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_weight_g` | SEDIMENT | UNSHAKEN | Sediment weight | number | g |  | N | Y | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_bottle_cut_to_evaluate` | SEDIMENT | UNSHAKEN | Bottle cut open to evaluate | boolean |  |  | N | N | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_bottle_coating_present` | SEDIMENT | UNSHAKEN | Bottle coating present (not sediment) | boolean |  |  | N | N |  | Team sheet | MVP |
| `sed_unsh_photo` | SEDIMENT | UNSHAKEN | Unshaken sediment photo | media_photo |  |  | Y | N | sed_unsh_present = Y | R-10 | MVP |
| `sed_predominant_type` | SEDIMENT | UNSHAKEN | Predominant sediment type | select |  | SED_TYPE | Y | N | sed_unsh_present = Y | R-10 | MVP |
| `sed_prot_review_prompt` | SEDIMENT | PROTEIN | Protein sediment guidance | guidance |  |  | N | N | sed_predominant_type = PROTEIN | R-10 | MVP |
| `sed_min_appearance` | SEDIMENT | MINERAL | Mineral sediment appearance | select |  | SED_MIN_APPEAR | N | N | sed_predominant_type = MINERAL | R-10 | SCHEMA_READY |
| `sed_min_review_prompt` | SEDIMENT | MINERAL | Mineral sediment guidance | guidance |  |  | N | N | sed_predominant_type = MINERAL | R-10 | SCHEMA_READY |
| `sed_coc_ring_present` | SEDIMENT | COCOA | Cocoa ring present | boolean |  |  | N | N | sed_predominant_type = COCOA | R-10 | SCHEMA_READY |
| `sed_coc_settling_pct_volume` | SEDIMENT | COCOA | Cocoa settling, share of package | percent | % |  | N | Y | sed_predominant_type = COCOA | Mural | MVP |
| `sed_coc_review_prompt` | SEDIMENT | COCOA | Cocoa sediment guidance | guidance |  |  | N | N | sed_predominant_type = COCOA | R-10 | SCHEMA_READY |
| `sed_sh_rating` | SEDIMENT | SHAKEN | Sediment rating (shaken) | select |  | RATING_SEDIMENT | N | Y | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_sh_height_value` | SEDIMENT | SHAKEN | Sediment height (shaken) | number | mm |  | N | Y | sed_unsh_present = Y | R-10, Team sheet | MVP |
| `sed_sh_height_unit` | SEDIMENT | SHAKEN | Shaken sediment height unit | select |  | UNIT_LENGTH | N | N | sed_unsh_present = Y | R-10 | MVP |
| `sed_sh_shake_in_extent` | SEDIMENT | SHAKEN | Shake-in extent | select |  | SHAKE_EXTENT | N | N | sed_unsh_present = Y | R-10 | MVP |
| `sed_sh_lumps_present` | SEDIMENT | SHAKEN | Shaking produced clumps | boolean |  |  | N | N | sed_unsh_present = Y | Mural | MVP |
| `sed_sh_photo` | SEDIMENT | SHAKEN | Shaken sediment photo | media_photo |  |  | N | N | sed_unsh_present = Y | R-10 | MVP |
| `sed_composition_test_requested` | SEDIMENT | FLAGS | Composition test requested | boolean |  |  | N | N | sed_unsh_present = Y | SOP-202 | MVP |
| `sed_comments` | SEDIMENT | GENERAL | Sediment comments | longtext |  |  | N | N |  | R-10 | MVP |
| `gel_gelled` | GELLING | UNSHAKEN | Gelled | boolean |  |  | Y | Y |  | R-11, SOP-202 | MVP |
| `gel_type` | GELLING | UNSHAKEN | Gel type | select |  | GEL_TYPE | N | N | gel_gelled = Y | R-11 | SCHEMA_READY |
| `gel_too_thick_to_pour` | GELLING | UNSHAKEN | Too thick to pour | boolean |  |  | N | N | gel_gelled = Y | Team sheet | MVP |
| `gel_firmness` | GELLING | UNSHAKEN | Gel firmness | select |  | GEL_FIRMNESS | N | N | gel_gelled = Y | R-11 | MVP |
| `gel_shake_test_performed` | GELLING | SHAKEN | Shake test performed | boolean |  |  | N | N | gel_gelled = Y | R-11 | MVP |
| `gel_reversibility` | GELLING | SHAKEN | Reversibility | select |  | GEL_REVERSIBILITY | N | N | gel_shake_test_performed = Y | R-11 | MVP |
| `gel_spoilage_related` | GELLING | FLAGS | Spoilage related | select |  | TRI_STATE | N | N | gel_gelled = Y | R-11 | MVP |
| `gel_observations` | GELLING | GENERAL | Gel observations | longtext |  |  | N | N | gel_gelled = Y | R-11 | SCHEMA_READY |
| `gel_photo` | GELLING | GENERAL | Gel photo | media_photo |  |  | N | N | gel_gelled = Y | R-11 | MVP |
| `gel_comments` | GELLING | GENERAL | Gelling comments | longtext |  |  | N | N |  | R-11 | MVP |
| `nh_rippling_present` | NON_HOMOG | UNSHAKEN | Rippling present | boolean |  |  | N | Y |  | R-11, SOP-202 | MVP |
| `nh_lumps_present` | NON_HOMOG | UNSHAKEN | Lumps present | boolean |  |  | N | Y |  | R-11 | MVP |
| `nh_lumps_severity` | NON_HOMOG | UNSHAKEN | Lump severity | select |  | SEVERITY | N | N | nh_lumps_present = Y | R-11 | MVP |
| `nh_lumps_context` | NON_HOMOG | UNSHAKEN | When lumps were seen | multiselect |  | NH_CONTEXT | N | N | nh_lumps_present = Y | Mural | MVP |
| `nh_lumps_size_class` | NON_HOMOG | UNSHAKEN | Lump size class | select |  | LUMP_SIZE | N | N | nh_lumps_present = Y | R-11 | SCHEMA_READY |
| `nh_sieve_used` | NON_HOMOG | UNSHAKEN | Poured through a sieve | boolean |  |  | N | N |  | Mural | MVP |
| `nh_sieve_mesh` | NON_HOMOG | UNSHAKEN | Sieve mesh | text |  |  | N | N | nh_sieve_used = Y | Mural | MVP |
| `nh_curdling_present` | NON_HOMOG | UNSHAKEN | Curdling present | boolean |  |  | N | Y |  | R-11 | SCHEMA_READY |
| `nh_smooth_after_shaking` | NON_HOMOG | SHAKEN | Smooth after shaking | boolean |  |  | N | N |  | Team sheet | MVP |
| `nh_spoilage_related` | NON_HOMOG | FLAGS | Spoilage related | select |  | TRI_STATE | N | N |  | R-11 | MVP |
| `nh_pour_video` | NON_HOMOG | GENERAL | Pour video (rippling) | media_video |  |  | N | N |  | Mural | MVP |
| `nh_photo` | NON_HOMOG | GENERAL | Non-homogeneity photo | media_photo |  |  | N | N |  | R-11 | MVP |
| `nh_comments` | NON_HOMOG | GENERAL | Non-homogeneity comments | longtext |  |  | N | N |  | R-11 | MVP |
| `psag_vertical_stripes_present` | PROTEIN_SAG | UNSHAKEN | Vertical stripes present | boolean |  |  | Y | Y |  | R-11 | MVP |
| `psag_stripe_coverage` | PROTEIN_SAG | UNSHAKEN | Stripe coverage | select |  | COVERAGE | N | N | psag_vertical_stripes_present = Y | R-11 | MVP |
| `psag_photo` | PROTEIN_SAG | GENERAL | Protein sagging photo | media_photo |  |  | N | N | psag_vertical_stripes_present = Y | R-11 | MVP |
| `psag_comments` | PROTEIN_SAG | GENERAL | Protein sagging comments | longtext |  |  | N | N |  | R-11 | MVP |
| `app_color_change_vs_t0` | APPEARANCE_SENSORY | COLOR | Color change vs T0 | select |  | SEVERITY_NONE | N | Y |  | SOP-202 | SCHEMA_READY |
| `app_color_method` | APPEARANCE_SENSORY | COLOR | Color method | select |  | COLOR_METHOD | N | N |  | SOP-202 | SCHEMA_READY |
| `app_color_l` | APPEARANCE_SENSORY | COLOR | L* | number |  |  | N | Y | app_color_method = LAB_METER|DIGIEYE | SOP-202 | SCHEMA_READY |
| `app_color_a` | APPEARANCE_SENSORY | COLOR | a* | number |  |  | N | Y | app_color_method = LAB_METER|DIGIEYE | SOP-202 | SCHEMA_READY |
| `app_color_b` | APPEARANCE_SENSORY | COLOR | b* | number |  |  | N | Y | app_color_method = LAB_METER|DIGIEYE | SOP-202 | SCHEMA_READY |
| `sens_recorded` | APPEARANCE_SENSORY | SENSORY | Sensory recorded | boolean |  |  | N | N |  | SOP-202 | SCHEMA_READY |
| `sens_texture` | APPEARANCE_SENSORY | SENSORY | Texture in mouth or on pour | select |  | TEXTURE_SENSORY | N | N | sens_recorded = Y | Team sheet | SCHEMA_READY |
| `sens_notes` | APPEARANCE_SENSORY | SENSORY | Sensory notes | longtext |  |  | N | N | sens_recorded = Y | Team sheet | SCHEMA_READY |
| `custom1_name` | CUSTOM | CUSTOM | Custom observation 1: name | text |  |  | N | N |  | Mural | SCHEMA_READY |
| `custom1_unshaken` | CUSTOM | CUSTOM | Custom observation 1: unshaken | text |  |  | N | Y |  | Mural | SCHEMA_READY |
| `custom1_shaken` | CUSTOM | CUSTOM | Custom observation 1: shaken | text |  |  | N | Y |  | Mural | SCHEMA_READY |
| `custom2_name` | CUSTOM | CUSTOM | Custom observation 2: name | text |  |  | N | N |  | Mural | SCHEMA_READY |
| `custom2_unshaken` | CUSTOM | CUSTOM | Custom observation 2: unshaken | text |  |  | N | Y |  | Mural | SCHEMA_READY |
| `custom2_shaken` | CUSTOM | CUSTOM | Custom observation 2: shaken | text |  |  | N | Y |  | Mural | SCHEMA_READY |
| `custom3_name` | CUSTOM | CUSTOM | Custom observation 3: name | text |  |  | N | N |  | Mural | SCHEMA_READY |
| `custom3_unshaken` | CUSTOM | CUSTOM | Custom observation 3: unshaken | text |  |  | N | Y |  | Mural | SCHEMA_READY |
| `custom3_shaken` | CUSTOM | CUSTOM | Custom observation 3: shaken | text |  |  | N | Y |  | Mural | SCHEMA_READY |
| `pwd_caking` | EXT_POWDER | POWDER | Caking | select |  | SEVERITY_NONE | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_flowability` | EXT_POWDER | POWDER | Flowability | select |  | FLOWABILITY | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_color_change` | EXT_POWDER | POWDER | Color change vs T0 | select |  | SEVERITY_NONE | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_lumps_present` | EXT_POWDER | POWDER | Lumps present | boolean |  |  | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_wettability_s` | EXT_POWDER | RECONSTITUTION | Wettability time | number | s |  | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_dissolution_s` | EXT_POWDER | RECONSTITUTION | Dissolution time | number | s |  | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_foaming` | EXT_POWDER | RECONSTITUTION | Foaming after reconstitution | select |  | SEVERITY_NONE | N | Y |  | OnePager | SCHEMA_READY |
| `pwd_photo` | EXT_POWDER | GENERAL | Powder photo | media_photo |  |  | N | N |  | OnePager | SCHEMA_READY |
| `vms_appearance_change` | EXT_VMS | TABLET | Appearance change vs T0 | select |  | SEVERITY_NONE | N | Y |  | OnePager | SCHEMA_READY |
| `vms_surface_mottling` | EXT_VMS | TABLET | Surface mottling | select |  | SEVERITY_NONE | N | Y |  | OnePager | SCHEMA_READY |
| `vms_chipping_capping` | EXT_VMS | TABLET | Chipping or capping | boolean |  |  | N | Y |  | OnePager | SCHEMA_READY |
| `vms_hardness_kp` | EXT_VMS | TABLET | Hardness | number | kp |  | N | Y |  | OnePager | SCHEMA_READY |
| `vms_disintegration_min` | EXT_VMS | TABLET | Disintegration time | number | min |  | N | Y |  | OnePager | SCHEMA_READY |
| `vms_odor_change` | EXT_VMS | SENSORY | Odor change vs T0 | select |  | SEVERITY_NONE | N | Y |  | OnePager | SCHEMA_READY |
| `vms_capsule_leakage` | EXT_VMS | CAPSULE | Capsule leakage | boolean |  |  | N | Y |  | OnePager | SCHEMA_READY |
| `vms_photo` | EXT_VMS | GENERAL | VMS photo | media_photo |  |  | N | N |  | OnePager | SCHEMA_READY |
