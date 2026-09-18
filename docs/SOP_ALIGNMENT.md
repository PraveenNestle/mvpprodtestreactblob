# SOP alignment: RDBW-SOP-00000202, the team spreadsheets and the PD Mural

How the September 2026 refresh maps the SOP, the stability spreadsheets (Supernova, Novastar, Benefic, VP RTD) and the PD brainstorm onto the catalog. Everything below is in `field_catalog.csv` / `vocabularies.csv` and regenerates into the schemas, the app and the Power Query layer.

## The SOP 0 to 5 ratings are first-class, and suggested from the measurement

| Domain | Fields | SOP table | Suggestion rule (the scientist confirms or overrides) |
|---|---|---|---|
| Creaming | `cream_unsh_rating`, `cream_sh_rating` | Table 2 | Ring thickness: <1 mm trace (1), 1 to 5 slight (2), 5 to 8 distinct (3), 8 to 10 heavy (4), 10+ very heavy (5). Without a ruler: layer description word, or marbling / spots = trace. Shaken: 0 when the layer shakes in; otherwise from residual % |
| Serum | `serum_unsh_rating`, `serum_sh_rating` | Table 3 | % of package volume: <1 trace (1), 1 to 3.5 about 2% (2), 3.5 to 7.5 about 5% (3), 7.5 to 15 about 10% (4), 15+ very heavy (5). Present but not measurable = trace |
| Sediment | `sed_unsh_rating`, `sed_sh_rating` | Table 4 | Height at the outer rim plus coverage: partial ring or depressions only = 1; complete ring 1 to 2 mm = 2; about 3 mm = 3; about 4 mm and entire bottom = 4; 5 mm+ = 5. Raised-center bottles (BOOST) need 4 mm for a 4, read from `sample.bottleBaseGeometry` |

The rule lives once, in `frontend/src/lib/ratings.js`, and the demo data is seeded through the same function. Ratings are stored as text codes `0` to `5` (vocabularies `RATING_CREAMING`, `RATING_SERUM`, `RATING_SEDIMENT`) so labels can carry the SOP wording.

## What the spreadsheets showed and where it went

| Seen in the sheets | Catalog answer |
|---|---|
| Six ratings per pull, unshaken and shaken, as the primary record | The six `*_rating` fields; `TPL_RTD_QUICK` ("SOP rating sheet") is the spreadsheet as a form; Review has a **Rating matrix** view; report 2 has the rating sheet and rating trend charts |
| `9999` for unshaken ratings when gelled or too thick to pour | N/A with reason "Gelled or too thick to pour"; `gel_too_thick_to_pour` |
| "Unshaken Sediment (mm)" and "Shaken Sediment (mm)" for every pull, in mm or cm | `sed_unsh_height_value/unit`, `sed_sh_height_value/unit` at domain level (the per-type heights were removed) |
| "outer only", "clear center", "ring", "w/ bottle coating", "lumpy", "sticky", "loose sediment that shook back in" | `sed_unsh_coverage`, `sed_unsh_texture`, `sed_bottle_coating_present`, `sed_sh_shake_in_extent`, `sed_sh_lumps_present` |
| "2.6 cm before and 1.5 cm after", "measured on the outside rim" | `sed_measurement_point`, `sed_measurement_location` |
| "Viscosity Physica CC27 100 1/s shear rate 20C" and "4C" at the same pull, "Viscosity (1291 1/s)", mPa·s | Two viscosity slots with instrument, geometry, shear rate, temperature; `lab_source` records that the value was typed from LIMS (there is no LIMS integration) |
| pH / viscosity only at the ambient pull | `lab_source = NOT_AVAILABLE` at the other conditions |
| Trial codes `33440.008`, "MT -" prefixes, pH target column | Trial `processScale`, variant `phTarget`; media filenames keep the dot as a hyphen |
| "failed, discontinued", "study complete at 3 months by AR design", "way too cooked, ignore" | Trial `status` and `terminationReason`; `exclude_from_trend` with `exclude_reason` |
| "rippling when pouring, smooth when shaken", "pudding texture", "lumpy after rigorous shaking" | Gelling and non-homogeneity moved into the MVP template; `nh_smooth_after_shaking`, `nh_lumps_context`, `sens_texture` |
| Photos placed per time point block; Kneil: full bottle and emptied bottle | `general_overview_photo` and `general_empty_bottle_photo` both mandatory; `general_beaker_photo` optional |

## What the SOP added beyond the URS

Shaking protocol (10 shakes, 180°, medium force, about 5 s) as a header field with a default; dried residue on the rim or foil seal recorded as not creaming, with the touch test; pour exit time as the alternate creaming measure; sediment weighing, bottle cutting, composition testing; the 24-hour re-separation check for products with a consumer usage period (`project.consumerUsagePeriodHours`); time points 1 day, 1 week, 4 months, 15 months and the 30°C tropical condition; In / Just In / Out as the result language.

## What the Mural added

The filters (I2L code, AR type, requestor, forecasted date) as reference attributes; hydrolysate flag on the variant with a serum prompt; spoilage-related gelling; sieve pouring and lump context (unshaken pour vs after shaking); cocoa settling as a share of the package; plug at the spout and skin or pad as residue types; L*a*b* / DigiEye color and sensory notes (schema-ready); three custom observation slots (schema-ready).

## Counts

113 URS taxonomy fields (restructured where the SOP measures differently), 66 SOP / spreadsheet / Mural additions, 16 powder and VMS extension fields; 46 vocabularies. The URS "127" reconstruction is superseded by this catalog; the traceability matrix carries both.
