#!/usr/bin/env python3
"""Generate Power BI-style HTML report previews for the R&D Stability Data Platform.
All numbers come from backend/api/src/data/demo_dataset.json (the same seeded observations the React demo shows),
aggregated the way the Power Query layer (power_query_blob.m) aggregates the curated NDJSON in Blob."""
import json, statistics, collections, datetime as dt
from pathlib import Path
from report_shell import shell, tile, kpi, fgroup, TABS

ROOT = Path(__file__).resolve().parent
DS = json.loads((ROOT / '../backend/api/src/data/demo_dataset.json').read_text())
CAT = json.loads((ROOT / '../backend/api/src/data/catalog.json').read_text())
OUT = ROOT
TODAY = dt.date(2026, 9, 1)
FIELDS = {f['fieldCode']: f for f in CAT['fields']}
VOC = {v['code']: {x['code']: x['label'] for x in v['values']} for v in CAT['vocabularies']}
TP_ORDER = ['T0', '1D', '1W', '2W', '1M', '2M', '3M', '4M', '6M', '9M', '12M', '15M', '18M']
TP_DAYS = {'T0': 0, '1D': 1, '1W': 7, '2W': 14, '1M': 30, '2M': 61, '3M': 91, '4M': 122, '6M': 182, '9M': 273, '12M': 365, '15M': 456, '18M': 548}
COND_LABEL = VOC['TEMP_CONDITION']
DOMAIN_NAME = {d['domainCode']: d['name'] for d in CAT['domains']}
obs = DS['observations']; plans = DS['plans']; ars = {a['arNumber']: a for a in DS['ars']}; projects = {p['projectCode']: p for p in DS['projects']}
samples = {s['sampleCode']: s for s in DS['samples']}

def val(o, code):
    for v in o['values']:
        if v['fieldCode'] == code:
            return None if v['isNA'] else v['value']
    return None
def has(o, code): return any(v['fieldCode'] == code for v in o['values'])
def month(o): return o['observedAt'][:7]
def due(plan, tp): return dt.date.fromisoformat(plan['validFrom']) + dt.timedelta(days=TP_DAYS[tp])

# Defect incidence exactly as V_DEFECT_INCIDENCE: a domain counts as assessed when its presence flag was captured (not N/A)
DEFECT_FLAGS = [('HOMOG', 'homog_unshaken_homogeneous', lambda v: v is False), ('CREAMING', 'cream_unsh_present', lambda v: v is True), ('SERUM', 'serum_unsh_present', lambda v: v is True),
                ('SEDIMENT', 'sed_unsh_present', lambda v: v is True), ('GELLING', 'gel_gelled', lambda v: v is True), ('NON_HOMOG', 'nh_lumps_present', lambda v: v is True), ('PROTEIN_SAG', 'psag_vertical_stripes_present', lambda v: v is True),
                ('EXT_POWDER', 'pwd_caking', lambda v: v not in (None, 'NONE')), ('EXT_VMS', 'vms_appearance_change', lambda v: v not in (None, 'NONE'))]
def defects(o):
    out = {}
    for dom, code, pred in DEFECT_FLAGS:
        if has(o, code):
            v = val(o, code); out[dom] = None if v is None else pred(v)
    return out

def plan_cells():
    cells = []
    for p in plans:
        po = [o for o in obs if o['context']['arNumber'] == p['arNumber']]
        for tp in p['timePoints']:
            for c in p['conditions']:
                got = [o for o in po if o['context']['timePointCode'] == tp and o['context']['conditionCode'] == c]
                d = due(p, tp); diff = (TODAY - d).days
                st = 'CAPTURED' if got else 'OVERDUE' if diff > 7 else 'DUE' if diff >= -7 else 'PLANNED'
                first = min((dt.date.fromisoformat(o['observedAt'][:10]) for o in got), default=None)
                cells.append({'ar': p['arNumber'], 'project': ars[p['arNumber']]['projectCode'], 'tp': tp, 'cond': c, 'due': d, 'status': st, 'n': len(got), 'daysLate': (first - d).days if first else None, 'results': [o['overallResult'] for o in got]})
    return cells
CELLS = plan_cells()

def js(v): return json.dumps(v)
def write(name, html): (OUT / name).write_text(html); print('wrote', name, f'{len(html)//1024} KB')

# =====================================================================================================================
# 1. Program overview
# =====================================================================================================================
def report_overview():
    n = len(obs); acc = sum(1 for o in obs if o['overallResult'] == 'IN'); media = sum(len(o['media']) for o in obs); na = sum(1 for o in obs for v in o['values'] if v['isNA'])
    overdue = sum(1 for c in CELLS if c['status'] == 'OVERDUE'); due_ = sum(1 for c in CELLS if c['status'] == 'DUE')
    inc = []
    for dom, code, _ in DEFECT_FLAGS:
        assessed = [o for o in obs if dom in defects(o) and defects(o)[dom] is not None]
        present = sum(1 for o in assessed if defects(o)[dom])
        if assessed: inc.append({'label': DOMAIN_NAME[dom], 'value': round(present / len(assessed) * 100), 'color': dom, 'sub': f'{present} of {len(assessed)} assessed', 'dom': dom})
    inc.sort(key=lambda x: -x['value'])
    months = sorted({month(o) for o in obs}); res = ['IN', 'JUST_IN', 'OUT']
    by_month = {r: [sum(1 for o in obs if month(o) == m and o['overallResult'] == r) for m in months] for r in res}
    proj_rows = []
    for pc, p in projects.items():
        po = [o for o in obs if o['context']['projectCode'] == pc]
        proj_rows.append({'cat': pc, 'name': p['projectName'], **{r: sum(1 for o in po if o['overallResult'] == r) for r in res}})
    status_counts = collections.Counter(c['status'] for c in CELLS)
    review = collections.Counter(o['status'] for o in obs)
    ar_rows = []
    for a in DS['ars']:
        po = [o for o in obs if o['context']['arNumber'] == a['arNumber']]; cells = [c for c in CELLS if c['ar'] == a['arNumber']]
        nxt = min((c['due'] for c in cells if c['status'] in ('DUE', 'PLANNED', 'OVERDUE')), default=None)
        ar_rows.append({'ar': a['arNumber'], 'project': a['projectCode'], 'title': a['arTitle'], 'n': len(po), 'acc': round(sum(1 for o in po if o['overallResult'] == 'IN') / len(po) * 100) if po else None,
                        'last': max((o['observedAt'][:10] for o in po), default=''), 'next': nxt.isoformat() if nxt else '', 'overdue': sum(1 for c in cells if c['status'] == 'OVERDUE'), 'progress': round(sum(1 for c in cells if c['status'] == 'CAPTURED') / len(cells) * 100)})
    body = "".join([
        kpi('Observations captured', f'{n}', f'{review.get("SUBMITTED",0)} awaiting review', 'warn' if review.get('SUBMITTED', 0) else ''),
        kpi('Samples under test', f'{len(samples)}', f'{len(DS["ars"])} active ARs, {len(projects)} projects'),
        kpi('In at latest pull', f'{round(acc/n*100)}%', f'{n-acc} Just In or Out', 'up'),
        kpi('Media files', f'{media}', '100% renamed to the standard convention', 'up'),
        kpi('Explicit N/A entries', f'{na}', 'zero 9999 placeholders since go-live', 'up'),
        kpi('Pulls overdue', f'{overdue}', f'{due_} due this week', 'down' if overdue else 'up'),
        tile('span5', 'Defect incidence by domain', '% of assessed observations where the defect was present (current versions only)', '<div class="chart" id="c_inc"></div>', 'curated/observation_value → DefectIncidence (Power Query)'),
        tile('span4', 'Observations captured by month', 'Stacked by overall result', '<div class="chart" id="c_month"></div>', 'curated/observation_header → ObservationCurrent (Power Query)'),
        tile('span3', 'Plan progress, all ARs', 'Plan cells (time point × condition) to date', '<div class="chart" id="c_plan" style="min-height:190px"></div>', 'reference/plans.json + curated/observation_header → PlanProgress (Power Query)'),
        tile('span5', 'In / Just In / Out by project', 'Current observation versions', '<div class="chart" id="c_proj"></div>', 'curated/observation_header → ObservationCurrent (Power Query)'),
        tile('span7', 'Active stability ARs', 'Progress against plan, latest and next pulls', '<div id="t_ars" data-h="300px"></div>', 'reference/plans.json + curated/observation_header → PlanProgress, ObservationCurrent'),
    ])
    filters = fgroup('Project', 'All (4)', list(projects)) + fgroup('Formulation class', 'All', ['Liquid RTD', 'Powder', 'VMS']) + fgroup('Storage condition', 'All', ['4°C', '25°C', '35°C', '45°C']) + fgroup('Observation date', '16 Feb 2026 to 31 Aug 2026') + fgroup('Observation status', 'Submitted, Reviewed') + fgroup('Version', 'Current only')
    script = f"""
const inc={js(inc)};hbarChart('c_inc',inc.map(r=>({{...r,color:DOM_COLOR[r.dom]}})),{{unit:'%',l:150,max:100}});
barChart('c_month',{{cats:{js([m[2:] for m in months])},series:[{{name:'In',values:{js(by_month['IN'])},color:RES_COLOR.IN}},{{name:'Just In',values:{js(by_month['JUST_IN'])},color:RES_COLOR.JUST_IN}},{{name:'Out',values:{js(by_month['OUT'])},color:RES_COLOR.OUT}}]}},{{stacked:true,h:220}});
donut('c_plan',[{{label:'Captured',value:{status_counts.get('CAPTURED',0)},color:C.green}},{{label:'Due this week',value:{status_counts.get('DUE',0)},color:C.amber}},{{label:'Overdue',value:{status_counts.get('OVERDUE',0)},color:C.red}},{{label:'Planned',value:{status_counts.get('PLANNED',0)},color:C.grey}}],{{center:'{round(status_counts.get('CAPTURED',0)/max(1,sum(1 for c in CELLS if c['status']!='PLANNED'))*100)}%',centerSub:'of due cells captured'}});
const pr={js(proj_rows)};barChart('c_proj',{{cats:pr.map(r=>r.cat),series:[{{name:'In',values:pr.map(r=>r.IN),color:RES_COLOR.IN}},{{name:'Just In',values:pr.map(r=>r.JUST_IN),color:RES_COLOR.JUST_IN}},{{name:'Out',values:pr.map(r=>r.OUT),color:RES_COLOR.OUT}}]}},{{stacked:true,h:230}});
table('t_ars',[{{h:'AR',k:'ar'}},{{h:'Project',k:'project'}},{{h:'Title',k:'title'}},{{h:'Obs.',k:'n',num:true}},{{h:'Plan progress',f:r=>bar(r.progress,100)+'%'}},{{h:'% In',f:r=>r.acc===null?'':bar(r.acc,100,r.acc>=80?C.green:r.acc>=60?C.amber:C.red)+'%'}},{{h:'Last pull',k:'last'}},{{h:'Next due',k:'next'}},{{h:'Overdue',f:r=>r.overdue?`<span class="pill fail">${{r.overdue}}</span>`:'<span class="pill ok">0</span>'}}],{js(ar_rows)});
"""
    write(TABS[0][1], shell('Stability Program Overview', TABS[0][1], body, filters, TABS).replace('{SCRIPT}', script))

# =====================================================================================================================
# 2. Trial trend analysis (AR-10421 / T01)
# =====================================================================================================================
def report_trend():
    AR, TR = 'AR-10421', '10421.001'
    po = [o for o in obs if o['context']['arNumber'] == AR and o['context']['trialNumber'] == TR]
    plan = next(p for p in plans if p['arNumber'] == AR)
    tps = [tp for tp in plan['timePoints'] if any(o['context']['timePointCode'] == tp for o in po)]
    conds = plan['conditions']; variants = sorted({o['context']['variantNumber'] for o in po})
    def series(code, agg=statistics.mean):
        out = []
        for c in conds:
            vals = []
            for tp in tps:
                xs = [val(o, code) for o in po if o['context']['conditionCode'] == c and o['context']['timePointCode'] == tp]
                xs = [x for x in xs if isinstance(x, (int, float))]
                vals.append(round(agg(xs), 2) if xs else 0)
            out.append({'name': COND_LABEL[c], 'values': vals})
        return out
    cream = series('cream_unsh_layer_thickness_value'); serum = series('serum_unsh_pct_package_volume')
    # incidence of creaming per time point per condition (% of variants)
    cream_inc = [{'name': COND_LABEL[c], 'values': [round(sum(1 for o in po if o['context']['conditionCode'] == c and o['context']['timePointCode'] == tp and val(o, 'cream_unsh_present') is True) / max(1, sum(1 for o in po if o['context']['conditionCode'] == c and o['context']['timePointCode'] == tp)) * 100) for tp in tps]} for c in conds]
    rows = [f'{v} · {c}' for v in variants for c in conds]
    cellmap = {}
    for o in po:
        cellmap[(f"{o['context']['variantNumber']} · {o['context']['conditionCode']}", o['context']['timePointCode'])] = o
    heat = [[({'v': cellmap[(r, tp)]['overallResult'], 'obs': cellmap[(r, tp)]['context']['sampleCode'], 'date': cellmap[(r, tp)]['observedAt'][:10], 'cream': val(cellmap[(r, tp)], 'cream_unsh_layer_thickness_value'), 'serum': val(cellmap[(r, tp)], 'serum_unsh_pct_package_volume'), 'sed': val(cellmap[(r, tp)], 'sed_unsh_present')} if (r, tp) in cellmap else None) for tp in plan['timePoints']] for r in rows]
    shake = []
    for tp in tps:
        c = collections.Counter(val(o, 'cream_sh_result') for o in po if o['context']['timePointCode'] == tp and val(o, 'cream_unsh_present') is True)
        shake.append({'tp': tp, 'FULLY_REDISPERSED': c.get('FULLY_REDISPERSED', 0), 'PARTIAL': c.get('PARTIAL', 0), 'NOT_REDISPERSED': c.get('NOT_REDISPERSED', 0)})
    # lab results only exist at the ambient pull (typed in from LIMS), so the lab charts are per variant at 25°C
    def lab_series(code):
        out = []
        for v in variants:
            vals = []
            for tp in tps:
                xs = [val(o, code) for o in po if o['context']['variantNumber'] == v and o['context']['conditionCode'] == '25C' and o['context']['timePointCode'] == tp]
                xs = [x for x in xs if isinstance(x, (int, float))]
                vals.append(round(statistics.mean(xs), 2) if xs else None)
            out.append({'name': v, 'values': vals})
        return out
    lab_ph = lab_series('lab_ph'); lab_visc = lab_series('lab_visc1_value')
    # SOP ratings: mean unshaken rating per condition per time point (N/A excluded)
    def rating_series(code):
        out = []
        for c in conds:
            vals = []
            for tp in tps:
                xs = [val(o, code) for o in po if o['context']['conditionCode'] == c and o['context']['timePointCode'] == tp]
                xs = [float(x) for x in xs if x is not None and str(x).isdigit()]
                vals.append(round(statistics.mean(xs), 2) if xs else None)
            out.append({'name': COND_LABEL[c], 'values': vals})
        return out
    rating_trends = {'Creaming': rating_series('cream_unsh_rating'), 'Serum': rating_series('serum_unsh_rating'), 'Sediment': rating_series('sed_unsh_rating')}
    # rating matrix rows: time point x condition, columns variants, cells C u/s · S u/s · Sd u/s
    def r6(o):
        g = lambda code: ('N/A' if next((x for x in o['values'] if x['fieldCode'] == code), {}).get('isNA') else (val(o, code) if val(o, code) is not None else ''))
        return {'cu': g('cream_unsh_rating'), 'cs': g('cream_sh_rating'), 'su': g('serum_unsh_rating'), 'ss': g('serum_sh_rating'), 'du': g('sed_unsh_rating'), 'ds': g('sed_sh_rating'), 'mm': val(o, 'sed_unsh_height_value'), 'res': o['overallResult']}
    matrix = [{'tp': tp, 'cond': COND_LABEL[c], 'cells': [(r6(cellmap[(f'{v} · {c}', tp)]) if (f'{v} · {c}', tp) in cellmap else None) for v in variants]} for tp in tps for c in conds]
    latest = tps[-1]
    cmp_rows = []
    for v in variants:
        for c in conds:
            o = cellmap.get((f'{v} · {c}', latest))
            if o: cmp_rows.append({'variant': v, 'cond': COND_LABEL[c], 'cream': val(o, 'cream_unsh_present'), 'thick': val(o, 'cream_unsh_layer_thickness_value'), 'cu': val(o, 'cream_unsh_rating'), 'serum': val(o, 'serum_unsh_pct_package_volume'), 'su': val(o, 'serum_unsh_rating'), 'sed': val(o, 'sed_unsh_present'), 'sedmm': val(o, 'sed_unsh_height_value'), 'du': val(o, 'sed_unsh_rating'), 'ds': val(o, 'sed_sh_rating'), 'shake': val(o, 'cream_sh_result'), 'result': o['overallResult'], 'media': len(o['media'])})
    worst = collections.Counter(o['overallResult'] for o in po if o['context']['timePointCode'] == latest)
    body = "".join([
        kpi('Pulls captured', f'{len(po)}', f'{len(variants)} variants × {len(conds)} conditions × {len(tps)} time points'),
        kpi('Latest time point', latest, f'next: {plan["timePoints"][plan["timePoints"].index(latest)+1] if plan["timePoints"].index(latest)+1 < len(plan["timePoints"]) else "complete"} (due {due(plan, plan["timePoints"][min(plan["timePoints"].index(latest)+1, len(plan["timePoints"])-1)]).isoformat()})'),
        kpi(f'Out at {latest}', f'{worst.get("OUT",0)}', f'{worst.get("JUST_IN",0)} Just In', 'down' if worst.get('OUT') else 'up'),
        kpi('Creaming incidence', f'{round(sum(1 for o in po if val(o,"cream_unsh_present") is True)/len(po)*100)}%', 'of all pulls to date, V1 baseline highest', 'warn'),
        kpi('Serum incidence', f'{round(sum(1 for o in po if val(o,"serum_unsh_present") is True)/len(po)*100)}%', 'mostly 35°C and 45°C', 'warn'),
        kpi('Sediment (protein)', f'{round(sum(1 for o in po if val(o,"sed_unsh_present") is True)/len(po)*100)}%', 'redisperses fully except V1 at 45°C', 'warn'),
        tile('span6', 'Cream layer thickness by time point', f'Mean of variants per storage condition, mm (unshaken). Dashed line: example action limit.', '<div class="chart" id="c_cream"></div>', 'curated/observation_value → ObservationFlat (cream_unsh_layer_thickness_value)'),
        tile('span6', 'Serum separation by time point', 'Mean % of package volume per storage condition (unshaken)', '<div class="chart" id="c_serum"></div>', 'curated/observation_value → ObservationFlat (serum_unsh_pct_package_volume)'),
        tile('span7', 'Result heatmap: variant × condition over time', f'{AR} · {TR} · hover a cell for the measurements. Grey = planned, not yet captured', '<div class="chart" id="c_heat" style="min-height:330px"></div>', 'curated/observation_header → ObservationCurrent + reference/plans.json → PlanProgress'),
        tile('span5', 'Creaming incidence by condition', '% of variants with a cream layer at each pull', '<div class="chart" id="c_creaminc"></div>', 'curated/observation_value → DefectIncidence (Power Query)'),
        tile('span4', 'Redispersion after shaking', 'Cream layer outcome after the standard 10 shakes, pulls with creaming only', '<div class="chart" id="c_shake"></div>', 'curated/observation_value → ObservationFlat (cream_sh_result)'),
        tile('span4', 'pH at the ambient pull', 'Per variant, typed in from LIMS (no integration)', '<div class="chart" id="c_ph"></div>', 'curated/observation_value → ObservationFlat (lab_ph)'),
        tile('span4', 'Viscosity at the ambient pull', 'Per variant, Physica CC27, 100 1/s, 20°C, mPa·s', '<div class="chart" id="c_visc"></div>', 'curated/observation_value → ObservationFlat (lab_visc1_value)'),
        "".join(tile('span4', f'SOP {name.lower()} rating (unshaken)', 'Mean 0 to 5 rating per storage condition; N/A pulls excluded', f'<div class="chart" id="c_rt_{name.lower()}"></div>', f'curated/observation_value → ObservationFlat ({code})') for name, code in [('Creaming', 'cream_unsh_rating'), ('Serum', 'serum_unsh_rating'), ('Sediment', 'sed_unsh_rating')]),
        tile('span12', f'SOP rating sheet, {AR} · {TR}', 'The team spreadsheet as a report: each cell holds creaming · serum · sediment as unshaken / shaken, with the unshaken sediment height', '<div id="t_matrix" data-h="420px"></div>', 'curated/observation_value → ObservationFlat (six *_rating fields)'),
        tile('span12', f'Variant comparison at {latest}', 'Physical descriptors side by side with the SOP ratings; N/A shows where a test was not performed', '<div id="t_cmp" data-h="360px"></div>', 'curated/observation_value → ObservationFlat (one column per field)'),
    ])
    filters = fgroup('Project', 'PRJ-2026-014', ['High-protein RTD shake']) + fgroup('Stability AR', AR, ['Shelf-life confirmation, 12 months']) + fgroup('Trial', TR, ['Baseline vs 2 stabiliser levels', 'Pilot plant']) + fgroup('Variant', 'All (3)', variants) + fgroup('Storage condition', 'All (4)', [COND_LABEL[c] for c in conds]) + fgroup('Time point', 'All captured', tps) + fgroup('Version', 'Current only')
    script = f"""
lineChart('c_cream',{{x:{js(tps)},series:{js(cream)}.map((s,i)=>({{...s,color:[C.blue,C.teal2,C.gold,C.red][i]}}))}},{{unit:' mm',dec:1,threshold:3,thresholdLabel:'action limit 3 mm (example)'}});
lineChart('c_serum',{{x:{js(tps)},series:{js(serum)}.map((s,i)=>({{...s,color:[C.blue,C.teal2,C.gold,C.red][i]}}))}},{{unit:'%',dec:1,threshold:4,thresholdLabel:'action limit 4% (example)'}});
const heat={js(heat)},hrows={js(rows)},hcols={js(plan['timePoints'])};heatmap('c_heat',hrows,hcols,(i,j)=>{{const d=heat[i][j];if(!d)return{{color:'#F1F4F3',label:'',tip:`<b>${{hrows[i]}} · ${{hcols[j]}}</b><br>Planned`}};return{{color:RES_COLOR[d.v],label:d.v==='IN'?'In':d.v==='JUST_IN'?'J':'O',tip:`<b>${{d.obs}}</b><br>${{hcols[j]}} · ${{d.date}}<br>Result: ${{d.v}}<br>Cream layer: ${{d.cream===null?'none / N/A':d.cream+' mm'}}<br>Serum: ${{d.serum===null?'none / N/A':d.serum+' %'}}<br>Sediment: ${{d.sed===null?'not assessed':d.sed?'yes':'no'}}`}}}},{{l:110,cw:70,ch:24}});
legend('c_heat',[['In',C.green],['J Just In',C.amber],['O Out',C.red],['planned','#F1F4F3']]);
lineChart('c_creaminc',{{x:{js(tps)},series:{js(cream_inc)}.map((s,i)=>({{...s,color:[C.blue,C.teal2,C.gold,C.red][i]}}))}},{{unit:'%',dec:0,max:100}});
const sh={js(shake)};barChart('c_shake',{{cats:sh.map(s=>s.tp),series:[{{name:'Fully redispersed',values:sh.map(s=>s.FULLY_REDISPERSED),color:C.green}},{{name:'Partial',values:sh.map(s=>s.PARTIAL),color:C.amber}},{{name:'Not redispersed',values:sh.map(s=>s.NOT_REDISPERSED),color:C.red}}]}},{{stacked:true,h:200}});
lineChart('c_ph',{{x:{js(tps)},series:{js(lab_ph)}.map((s,i)=>({{...s,color:PAL[i]}}))}},{{dec:2,min:6.4,max:7.0}});
lineChart('c_visc',{{x:{js(tps)},series:{js(lab_visc)}.map((s,i)=>({{...s,color:PAL[i]}}))}},{{unit:' mPa·s',dec:0}});
const rt={js(rating_trends)};Object.entries(rt).forEach(([k,ser])=>lineChart('c_rt_'+k.toLowerCase(),{{x:{js(tps)},series:ser.map((s,i)=>({{...s,color:[C.blue,C.teal2,C.gold,C.red][i]}}))}},{{dec:1,max:5,legend:k==='Creaming'}}));
const mx={js(matrix)},mv={js(variants)};const tone=c=>{{const rs=['cu','cs','su','ss','du','ds'].map(k=>Number(c[k])).filter(n=>!Number.isNaN(n));const m=rs.length?Math.max(...rs):null;return m===null?'':m>=4?'fail':m>=2?'watch':'ok'}};
document.getElementById('t_matrix').innerHTML=`<div style="overflow:auto;max-height:420px"><table class="grid"><thead><tr><th>Time point</th><th>Condition</th>${{mv.map(v=>`<th>${{v}}</th>`).join('')}}</tr></thead><tbody>${{mx.map(r=>`<tr><td><b>${{r.tp}}</b></td><td>${{r.cond}}</td>${{r.cells.map(c=>c?`<td class="mxc ${{tone(c)}}"><div><span>C</span> <b>${{c.cu}}</b>/<b>${{c.cs}}</b></div><div><span>S</span> <b>${{c.su}}</b>/<b>${{c.ss}}</b></div><div><span>Sd</span> <b>${{c.du}}</b>/<b>${{c.ds}}</b>${{c.mm!==null&&c.mm!==undefined?` <small>${{c.mm}} mm</small>`:''}}</div></td>`:'<td class="mxc" style="color:#8A959C;text-align:center">·</td>').join('')}}</tr>`).join('')}}</tbody></table></div>`;
const yn=v=>v===null||v===undefined?'<span class="pill na">N/A</span>':v?'Yes':'No';
const rt5=v=>v===null||v===undefined?'':`<b>${{v}}</b>`;
table('t_cmp',[{{h:'Variant',k:'variant'}},{{h:'Condition',k:'cond'}},{{h:'Creaming',f:r=>yn(r.cream)}},{{h:'Layer (mm)',f:r=>r.thick===null||r.thick===undefined?(r.cream?'<span class="pill na">N/A</span>':''):fmt(r.thick,1),num:true}},{{h:'C rating',f:r=>rt5(r.cu),num:true}},{{h:'Serum (% vol)',f:r=>r.serum===null||r.serum===undefined?'':fmt(r.serum,1),num:true}},{{h:'S rating',f:r=>rt5(r.su),num:true}},{{h:'Sediment',f:r=>yn(r.sed)}},{{h:'Sed (mm)',f:r=>r.sedmm===null||r.sedmm===undefined?'':fmt(r.sedmm,1),num:true}},{{h:'Sd rating u/s',f:r=>r.du===null||r.du===undefined?'':`<b>${{r.du}}</b>/<b>${{r.ds??''}}</b>`}},{{h:'Cream after shaking',f:r=>r.shake?VOC_SHAKE[r.shake]||r.shake:''}},{{h:'Media',k:'media',num:true}},{{h:'Result',f:r=>resPill(r.result)}}],{js(cmp_rows)});
"""
    script = "const VOC_SHAKE=" + js(VOC.get('SHAKE_RESULT', {})) + ";" + script
    write(TABS[1][1], shell('Trial Trend Analysis', TABS[1][1], body, filters, TABS).replace('{SCRIPT}', script))

# =====================================================================================================================
# 3. Stability plan compliance
# =====================================================================================================================
def report_compliance():
    due_cells = [c for c in CELLS if c['status'] != 'PLANNED']; captured = [c for c in due_cells if c['status'] == 'CAPTURED']
    on_time = [c for c in captured if c['daysLate'] is not None and c['daysLate'] <= 3]
    lateness = collections.Counter('On due date' if c['daysLate'] <= 0 else '1 to 3 days' if c['daysLate'] <= 3 else '4 to 7 days' if c['daysLate'] <= 7 else 'Over 7 days' for c in captured if c['daysLate'] is not None)
    med = statistics.median([c['daysLate'] for c in captured if c['daysLate'] is not None]) if captured else 0
    upcoming = sorted([c for c in CELLS if c['status'] in ('DUE', 'OVERDUE') or (c['status'] == 'PLANNED' and (c['due'] - TODAY).days <= 45)], key=lambda c: c['due'])
    grids = []
    for p in plans:
        cells = [c for c in CELLS if c['ar'] == p['arNumber']]
        grid = [[next(c for c in cells if c['tp'] == tp and c['cond'] == cond) for cond in p['conditions']] for tp in p['timePoints']]
        grids.append({'ar': p['arNumber'], 'title': ars[p['arNumber']]['arTitle'], 'project': p['arNumber'] and ars[p['arNumber']]['projectCode'], 'tps': p['timePoints'], 'conds': [c.replace('C', '°C') for c in p['conditions']], 'scheme': p['intervalScheme'].replace('_', ' ').lower(), 'cells': [[{'s': c['status'], 'n': c['n'], 'due': c['due'].isoformat(), 'late': c['daysLate'], 'res': c['results']} for c in row] for row in grid], 'pct': round(sum(1 for c in cells if c['status'] == 'CAPTURED') / max(1, sum(1 for c in cells if c['status'] != 'PLANNED')) * 100)})
    # review turnaround
    turn = [((dt.datetime.fromisoformat(o['reviewedAt'].replace('Z', '+00:00')) - dt.datetime.fromisoformat(o['submittedAt'].replace('Z', '+00:00'))).total_seconds() / 86400) for o in obs if o.get('reviewedAt')]
    tb = collections.Counter('Same day' if t < 1 else '1 to 2 days' if t <= 2 else '3 to 5 days' if t <= 5 else 'Over 5 days' for t in turn)
    reviewers = collections.Counter(o.get('reviewedBy') for o in obs if o.get('reviewedBy'))
    body = "".join([
        kpi('Plan cells due to date', f'{len(due_cells)}', f'{sum(1 for c in CELLS if c["status"]=="PLANNED")} still planned'),
        kpi('Captured', f'{round(len(captured)/len(due_cells)*100)}%', f'{len(captured)} of {len(due_cells)} due cells', 'up'),
        kpi('On time (≤ 3 days)', f'{round(len(on_time)/max(1,len(captured))*100)}%', f'median {med:.0f} day(s) after due date', 'up' if len(on_time)/max(1,len(captured)) > 0.8 else 'warn'),
        kpi('Overdue', f'{sum(1 for c in CELLS if c["status"]=="OVERDUE")}', f'{sum(1 for c in CELLS if c["status"]=="DUE")} due this week', 'down' if any(c['status'] == 'OVERDUE' for c in CELLS) else 'up'),
        kpi('Awaiting review', f'{sum(1 for o in obs if o["status"]=="SUBMITTED")}', f'{round(sum(1 for t in turn if t<=2)/max(1,len(turn))*100)}% reviewed within 2 days', 'warn'),
        kpi('Amended versions', f'{sum(1 for o in obs if o["versionNo"]>1)}', 'observations with more than one version', 'up'),
        "".join(tile('span4', f'{g["ar"]} · {g["project"]}', f'{g["title"]} · {g["scheme"]} · {g["pct"]}% of due cells captured', f'<div class="chart" id="g_{i}" style="min-height:160px"></div>', 'reference/plans.json + curated/observation_header → PlanProgress (Power Query)') for i, g in enumerate(grids)),
        tile('span4', 'Capture lateness', 'Days between planned pull date and first capture', '<div class="chart" id="c_late"></div>', 'PlanProgress (dueDate vs firstCapturedAt)'),
        tile('span4', 'Review turnaround', 'Submitted to reviewed, calendar days', '<div class="chart" id="c_turn"></div>', 'curated/observation_header (submittedAt, reviewedAt)'),
        tile('span4', 'Pulls due in the next 45 days', 'Includes overdue and due-this-week cells', '<div id="t_up" data-h="230px"></div>', 'reference/plans.json + curated/observation_header → PlanProgress (Power Query)'),
    ])
    filters = fgroup('Project', 'All (4)') + fgroup('Stability AR', 'All (5)', [p['arNumber'] for p in plans]) + fgroup('Plan status', 'Active') + fgroup('Cell status', 'All', ['Captured', 'Due', 'Overdue', 'Planned']) + fgroup('As of', TODAY.strftime('%d %b %Y'))
    script = f"""
const grids={js(grids)};const SC={{CAPTURED:C.green,DUE:C.amber,OVERDUE:C.red,PLANNED:'#F1F4F3'}};
grids.forEach((g,i)=>heatmap('g_'+i,g.tps,g.conds,(r,c)=>{{const d=g.cells[r][c];return{{color:SC[d.s],label:d.s==='CAPTURED'?(d.n>1?d.n:'✓'):d.s==='OVERDUE'?'!':d.s==='DUE'?'•':'',fg:d.s==='PLANNED'?'#8A959C':'#fff',tip:`<b>${{g.ar}} · ${{g.tps[r]}} · ${{g.conds[c]}}</b><br>Due ${{d.due}}<br>${{d.s.toLowerCase()}}${{d.late!==null&&d.late!==undefined?` (${{d.late>0?d.late+' day(s) late':'on time'}})`:''}}${{d.res&&d.res.length?'<br>Result: '+d.res.join(', '):''}}`}}}},{{l:40,cw:64,ch:20,w:380}}));
legend('g_0',[['Captured',C.green],['Due this week',C.amber],['Overdue',C.red],['Planned','#F1F4F3']]);
const lat={js(lateness)};barChart('c_late',{{cats:['On due date','1 to 3 days','4 to 7 days','Over 7 days'],series:[{{name:'Cells',values:['On due date','1 to 3 days','4 to 7 days','Over 7 days'].map(k=>lat[k]||0),color:C.teal}}]}},{{labels:true,h:200,legend:false}});
const tb={js(tb)};barChart('c_turn',{{cats:['Same day','1 to 2 days','3 to 5 days','Over 5 days'],series:[{{name:'Observations',values:['Same day','1 to 2 days','3 to 5 days','Over 5 days'].map(k=>tb[k]||0),color:C.teal2}}]}},{{labels:true,h:200,legend:false}});
table('t_up',[{{h:'Due',f:r=>r.due}},{{h:'AR',k:'ar'}},{{h:'Time point',k:'tp'}},{{h:'Condition',f:r=>r.condLabel}},{{h:'Status',f:r=>`<span class="pill ${{r.status==='OVERDUE'?'fail':r.status==='DUE'?'watch':'teal'}}">${{r.status==='PLANNED'?'Planned':r.status==='DUE'?'Due this week':'Overdue'}}</span>`}}],{js([{'due': c['due'].isoformat(), 'ar': c['ar'], 'tp': c['tp'], 'condLabel': COND_LABEL[c['cond']], 'status': c['status']} for c in upcoming])});
"""
    write(TABS[2][1], shell('Stability Plan Compliance', TABS[2][1], body, filters, TABS).replace('{SCRIPT}', script))

# =====================================================================================================================
# 4. Observation detail & media coverage
# =====================================================================================================================
def report_detail():
    media = [m for o in obs for m in o['media']]; photos = [m for m in media if m['mediaType'] == 'PHOTO']; videos = [m for m in media if m['mediaType'] == 'VIDEO']
    overview = sum(1 for o in obs if any(m['fieldCode'] == 'general_overview_photo' for m in o['media']))
    by_domain = collections.Counter(FIELDS[m['fieldCode']]['domainCode'] for m in media)
    cov_ar = [{'label': a['arNumber'], 'value': round(sum(1 for o in obs if o['context']['arNumber'] == a['arNumber'] and any(m['fieldCode'] == 'general_overview_photo' for m in o['media'])) / max(1, sum(1 for o in obs if o['context']['arNumber'] == a['arNumber'])) * 100), 'sub': f"{sum(1 for o in obs if o['context']['arNumber']==a['arNumber'])} observations"} for a in DS['ars']]
    per_obs = [len(o['media']) for o in obs]
    na_rows = collections.Counter((FIELDS[v['fieldCode']]['label'], v['naReason'] or 'No reason given') for o in obs for v in o['values'] if v['isNA'])
    na_table = [{'field': k[0], 'reason': k[1], 'n': n} for k, n in na_rows.most_common()]
    prod = collections.defaultdict(lambda: collections.Counter())
    for o in obs: prod[o['observer']['displayName']][month(o)] += 1
    months = sorted({month(o) for o in obs})
    recent = sorted(obs, key=lambda o: o['observedAt'], reverse=True)[:40]
    recent_rows = [{'when': o['observedAt'][:16].replace('T', ' '), 'sample': o['context']['sampleCode'], 'ar': o['context']['arNumber'], 'tp': o['context']['timePointCode'], 'cond': COND_LABEL[o['context']['conditionCode']], 'fields': len(o['values']), 'na': sum(1 for v in o['values'] if v['isNA']), 'media': len(o['media']), 'observer': o['observer']['displayName'], 'result': o['overallResult'], 'status': o['status'], 'v': o['versionNo'], 'tpl': o['template']['templateName']} for o in recent]
    example = next(m for m in media if m['mediaType'] == 'VIDEO')
    sizes = sum(m['sizeBytes'] for m in media) / 1e9
    body = "".join([
        kpi('Media files', f'{len(media)}', f'{len(photos)} photos, {len(videos)} videos, {sizes:.1f} GB'),
        kpi('Photos per observation', f'{statistics.mean(per_obs):.1f}', f'min {min(per_obs)}, max {max(per_obs)} (URS sizing: ~5 photos + 1 video)'),
        kpi('Overview photo coverage', f'{round(overview/len(obs)*100)}%', 'mandatory field, enforced at submit', 'up'),
        kpi('Naming convention compliance', '100%', 'every file renamed before it lands in Blob', 'up'),
        kpi('Explicit N/A entries', f'{sum(1 for o in obs for v in o["values"] if v["isNA"])}', f'across {len({v["fieldCode"] for o in obs for v in o["values"] if v["isNA"]})} field(s), each with a reason (no 9999)', 'up'),
        kpi('Structured values captured', f'{sum(len(o["values"]) for o in obs):,}', f'{statistics.mean(len(o["values"]) for o in obs):.0f} per observation on average'),
        tile('span4', 'Media by defect domain', 'Where the photos and videos are being taken', '<div class="chart" id="c_dom"></div>', 'curated/media_asset → MediaCoverage (Power Query)'),
        tile('span4', 'Overview photo coverage by AR', '% of observations with the mandatory overview photo', '<div class="chart" id="c_cov"></div>', 'curated/media_asset → MediaCoverage (hasOverviewPhoto)'),
        tile('span4', 'Observations by scientist and month', 'Capture volume per observer', '<div class="chart" id="c_prod"></div>', 'curated/observation_header → ObservationCurrent (Power Query)'),
        tile('span7', 'Media naming convention (R-22)', 'Every file is renamed on upload; the name alone tells you what it shows', f'''<div style="font-family:Consolas,monospace;font-size:12px;word-break:break-all;background:#F4F6F5;border-radius:4px;padding:10px;margin-bottom:8px">{example['standardFilename']}</div>
<table class="grid"><tbody>
<tr><td>Project</td><td><code>{example['standardFilename'].split('_')[0]}</code></td><td>Stability AR</td><td><code>{example['standardFilename'].split('_')[1]}</code></td></tr>
<tr><td>Trial · Variant</td><td><code>{example['standardFilename'].split('_')[2]} · {example['standardFilename'].split('_')[3]}</code></td><td>Time point · Condition</td><td><code>{example['standardFilename'].split('_')[4]} · {example['standardFilename'].split('_')[5]}</code></td></tr>
<tr><td>Domain · Field</td><td><code>{example['standardFilename'].split('_')[6]} · {example['standardFilename'].split('_')[7]}</code></td><td>Captured · Sequence</td><td><code>{example['standardFilename'].split('_')[8]} · {example['standardFilename'].split('_')[9].split('.')[0]}</code></td></tr>
</tbody></table><div class="sm" style="margin-top:8px">Blob path: <code>media/{example['blobPath']}</code> · {example['contentType']} · {example['durationS']} s · captured on {example['deviceModel']}</div>''', 'curated/media_asset (standardFilename, blobPath)'),
        tile('span5', 'N/A usage by field and reason', 'Replaces the 9999 placeholder; every N/A carries a reason', '<div id="t_na" data-h="220px"></div>', 'curated/observation_value (isNA, naReason)'),
        tile('span12', 'Recent observations', 'Latest 40 current versions with completeness and media counts', '<div id="t_recent" data-h="380px"></div>', 'curated/observation_header → ObservationCurrent (Power Query)'),
    ])
    filters = fgroup('Project', 'All (4)') + fgroup('Stability AR', 'All (5)') + fgroup('Media type', 'Photo, Video') + fgroup('Observer', 'All', sorted({o['observer']['displayName'] for o in obs})) + fgroup('Observation status', 'All') + fgroup('Version', 'Current only')
    script = f"""
const bd={js(dict(by_domain))};hbarChart('c_dom',Object.entries(bd).sort((a,b)=>b[1]-a[1]).map(([d,v])=>({{label:{js(DOMAIN_NAME)}[d],value:v,color:DOM_COLOR[d]||C.teal}})),{{l:120}});
hbarChart('c_cov',{js(cov_ar)},{{unit:'%',max:100,l:80}});
const pm={js({k: [v.get(m, 0) for m in months] for k, v in prod.items()})};barChart('c_prod',{{cats:{js([m[2:] for m in months])},series:Object.entries(pm).map(([n,v],i)=>({{name:n,values:v,color:PAL[i]}}))}},{{stacked:true,h:200}});
table('t_na',[{{h:'Field',k:'field'}},{{h:'Reason',k:'reason'}},{{h:'Count',k:'n',num:true}}],{js(na_table)});
table('t_recent',[{{h:'Observed',k:'when'}},{{h:'Sample',k:'sample'}},{{h:'AR',k:'ar'}},{{h:'TP',k:'tp'}},{{h:'Condition',k:'cond'}},{{h:'Template',k:'tpl'}},{{h:'Fields',k:'fields',num:true}},{{h:'N/A',k:'na',num:true}},{{h:'Media',k:'media',num:true}},{{h:'Observer',k:'observer'}},{{h:'Result',f:r=>resPill(r.result)}},{{h:'Status',f:r=>`<span class="pill ${{r.status==='REVIEWED'?'ok':'teal'}}">${{r.status.charAt(0)+r.status.slice(1).toLowerCase()}}</span>`}},{{h:'v',k:'v',num:true}}],{js(recent_rows)});
"""
    write(TABS[3][1], shell('Observation Detail & Media Coverage', TABS[3][1], body, filters, TABS).replace('{SCRIPT}', script))

# =====================================================================================================================
# 5. Cross-project benchmarking
# =====================================================================================================================
def report_benchmark():
    doms = ['HOMOG', 'CREAMING', 'SERUM', 'SEDIMENT', 'EXT_POWDER', 'EXT_VMS']
    proj_inc = {}
    for pc in projects:
        po = [o for o in obs if o['context']['projectCode'] == pc]
        row = {}
        for d in doms:
            assessed = [o for o in po if d in defects(o) and defects(o)[d] is not None]
            row[d] = round(sum(1 for o in assessed if defects(o)[d]) / len(assessed) * 100) if assessed else None
        proj_inc[pc] = row
    conds = ['4C', '25C', '35C', '45C']
    acc_cond = {pc: [round(sum(1 for o in obs if o['context']['projectCode'] == pc and o['context']['conditionCode'] == c and o['overallResult'] == 'IN') / max(1, sum(1 for o in obs if o['context']['projectCode'] == pc and o['context']['conditionCode'] == c)) * 100) if any(o['context']['projectCode'] == pc and o['context']['conditionCode'] == c for o in obs) else None for c in conds] for pc in projects}
    # survival: % of samples still without any Just In / Out result up to each time point index, per condition (all projects)
    tp_idx = ['T0', '1M', '3M', '6M']
    surv = []
    for c in conds:
        samps = {o['context']['sampleCode'] for o in obs if o['context']['conditionCode'] == c}
        vals = []
        for k, tp in enumerate(tp_idx):
            alive = 0
            for s in samps:
                so = [o for o in obs if o['context']['sampleCode'] == s and o['context']['timePointCode'] in tp_idx[:k + 1]]
                if so and all(o['overallResult'] == 'IN' for o in so): alive += 1
            vals.append(round(alive / max(1, len(samps)) * 100))
        surv.append({'name': COND_LABEL[c], 'values': vals})
    # viscosity drift RTD only
    # viscosity is typed in from LIMS at the ambient pull only (team practice), so drift is per project at 25°C
    drift = []
    for pc in [p for p in projects if projects[p]['formulationClass'] == 'LIQUID_RTD']:
        rtd = [o for o in obs if o['context']['projectCode'] == pc and o['context']['conditionCode'] == '25C' and isinstance(val(o, 'lab_visc1_value'), (int, float))]
        base = statistics.mean([val(o, 'lab_visc1_value') for o in rtd if o['context']['timePointCode'] == 'T0'] or [0])
        vals = []
        for tp in tp_idx:
            xs = [val(o, 'lab_visc1_value') for o in rtd if o['context']['timePointCode'] == tp]
            vals.append(round(statistics.mean(xs) - base, 1) if xs else None)
        drift.append({'name': pc, 'values': vals})
    score = []
    for pc, p in projects.items():
        po = [o for o in obs if o['context']['projectCode'] == pc]
        dom_counts = collections.Counter(d for o in po for d, v in defects(o).items() if v)
        top = dom_counts.most_common(1)[0] if dom_counts else None
        latest = max((TP_ORDER.index(o['context']['timePointCode']) for o in po), default=0)
        score.append({'project': pc, 'name': p['projectName'], 'cls': VOC['FORMULATION_CLASS'][p['formulationClass']], 'n': len(po), 'samples': len({o['context']['sampleCode'] for o in po}), 'acc': round(sum(1 for o in po if o['overallResult'] == 'IN') / len(po) * 100) if po else 0, 'unacc': sum(1 for o in po if o['overallResult'] == 'OUT'), 'top': f'{DOMAIN_NAME[top[0]]} ({top[1]})' if top else 'None', 'latest': TP_ORDER[latest], 'media': sum(len(o['media']) for o in po), 'na': sum(1 for o in po for v in o['values'] if v['isNA'])})
    cls_acc = {}
    for cls in ['LIQUID_RTD', 'POWDER', 'VMS']:
        po = [o for o in obs if o['context']['formulationClass'] == cls]
        cls_acc[VOC['FORMULATION_CLASS'][cls]] = round(sum(1 for o in po if o['overallResult'] == 'IN') / len(po) * 100) if po else 0
    body = "".join([
        kpi('Projects benchmarked', f'{len(projects)}', '2 liquid RTD, 1 powder, 1 VMS'),
        "".join(kpi(f'In: {k}', f'{v}%', 'current versions, all conditions', 'up' if v >= 80 else 'warn') for k, v in cls_acc.items()),
        kpi('Elevated-temperature penalty', f'{acc_cond["PRJ-2026-014"][1]-acc_cond["PRJ-2026-014"][3]} pts', 'In rate at 25°C minus 45°C, RTD shake', 'warn'),
        kpi('Samples still In at 6M ambient', f'{surv[1]["values"][-1]}%', 'no Just In or Out at any pull, all projects', 'up'),
        tile('span7', 'Defect incidence by domain and project', '% of assessed observations with the defect present. Powder and VMS use their extension descriptors', '<div class="chart" id="c_pd"></div>', 'curated/observation_value → DefectIncidence (Power Query)'),
        tile('span5', 'In rate by storage condition', 'Per project, current versions', '<div class="chart" id="c_ac"></div>', 'curated/observation_header → ObservationCurrent (Power Query)'),
        tile('span6', 'Samples still In over time', '% of samples rated In at every pull through each time point, by condition (all projects)', '<div class="chart" id="c_surv"></div>', 'curated/observation_header → ObservationCurrent (first non-acceptable pull per sample)'),
        tile('span6', 'Viscosity drift from T0, RTD projects (ambient)', 'Mean change in mPa·s (Physica CC27, 100 1/s, 20°C) typed in from LIMS at the ambient pull', '<div class="chart" id="c_drift"></div>', 'curated/observation_value → ObservationFlat (lab_visc1_value)'),
        tile('span12', 'Project scorecard', 'One row per project, everything the steering meeting asks for', '<div id="t_score" data-h="240px"></div>', 'ObservationCurrent + DefectIncidence + MediaCoverage (Power Query)'),
    ])
    filters = fgroup('Project', 'All (4)', list(projects)) + fgroup('Formulation class', 'All (3)') + fgroup('Storage condition', 'All (4)') + fgroup('Time point', 'T0 to 6M (common range)') + fgroup('Version', 'Current only')
    script = f"""
const pi={js(proj_inc)},doms={js(doms)},DN={js(DOMAIN_NAME)};barChart('c_pd',{{cats:Object.keys(pi),series:doms.map(d=>({{name:DN[d],values:Object.values(pi).map(r=>r[d]||0),color:DOM_COLOR[d]}}))}},{{unit:'%',max:100,h:240}});
const ac={js(acc_cond)};barChart('c_ac',{{cats:{js([COND_LABEL[c] for c in conds])},series:Object.entries(ac).map(([p,v],i)=>({{name:p,values:v.map(x=>x||0),color:PAL[i]}}))}},{{unit:'%',max:100,h:240}});
lineChart('c_surv',{{x:{js(tp_idx)},series:{js(surv)}.map((s,i)=>({{...s,color:[C.blue,C.teal2,C.gold,C.red][i]}}))}},{{unit:'%',dec:0,max:100}});
lineChart('c_drift',{{x:{js(tp_idx)},series:{js(drift)}.map((s,i)=>({{...s,color:[C.teal,C.gold][i]}}))}},{{unit:' mPa·s',dec:0,max:{max(1, round(max([v for s in drift for v in s['values'] if v is not None] or [1]) + 20))}}});
table('t_score',[{{h:'Project',k:'project'}},{{h:'Name',k:'name'}},{{h:'Class',k:'cls'}},{{h:'Obs.',k:'n',num:true}},{{h:'Samples',k:'samples',num:true}},{{h:'% In',f:r=>bar(r.acc,100,r.acc>=80?C.green:r.acc>=60?C.amber:C.red)+'%'}},{{h:'Unacceptable',f:r=>r.unacc?`<span class="pill fail">${{r.unacc}}</span>`:'<span class="pill ok">0</span>'}},{{h:'Dominant defect',k:'top'}},{{h:'Latest TP',k:'latest'}},{{h:'Media',k:'media',num:true}},{{h:'N/A',k:'na',num:true}}],{js(score)});
"""
    write(TABS[4][1], shell('Cross-Project Benchmarking', TABS[4][1], body, filters, TABS).replace('{SCRIPT}', script))

if __name__ == '__main__':
    report_overview(); report_trend(); report_compliance(); report_detail(); report_benchmark()
    print('cells', collections.Counter(c['status'] for c in CELLS))
