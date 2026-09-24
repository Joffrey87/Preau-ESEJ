# -*- coding: utf-8 -*-
"""Rapproche les opérations Préau (Supabase) avec les lignes des relevés PDF (sortie de releves_pdf.py)
et prépare les UPDATE de libelle_origine pour les opérations qui n'en ont pas.

Usage : python scripts/rapprocher_libelles.py [releves.json] [date_debut] [date_fin]
        (défaut : scripts/releves_2025_2026.json 2025-08-01 2026-08-31)

Lecture seule ici : produit scripts/rapprochement.json + scripts/rapprochement_report.txt + scripts/update_libelles.sql
"""
import json, os, re, sys, urllib.request, itertools
from collections import defaultdict
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    if '=' in line and not line.startswith('#'):
        k, v = line.strip().split('=', 1); env[k] = v
URL = env['NEXT_PUBLIC_SUPABASE_URL']; KEY = env['SUPABASE_SERVICE_ROLE_KEY']

def rest(path):
    req = urllib.request.Request(URL + '/rest/v1/' + path, headers={'apikey': KEY, 'Authorization': 'Bearer ' + KEY})
    return json.load(urllib.request.urlopen(req))

RELEVES = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'scripts', 'releves_2025_2026.json')
D0 = sys.argv[2] if len(sys.argv) > 2 else '2025-08-01'
D1 = sys.argv[3] if len(sys.argv) > 3 else '2026-08-31'
ops = rest(f'operations?select=id,date_operation,type,montant,libelle,libelle_origine,parent_id,est_ventilee&date_operation=gte.{D0}&date_operation=lte.{D1}&order=date_operation&limit=5000')
bank = [b for b in json.load(open(RELEVES, encoding='utf-8')) if D0 <= b['iso'] <= D1]
for o in ops: o['montant'] = float(o['montant'])
print(len(ops), 'opérations Préau,', len(bank), 'lignes bancaires')

def iso(d): return date.fromisoformat(d)
def close(a, b, days): return abs((iso(a) - iso(b)).days) <= days

# candidats côté Préau : opérations non ventilées (les parents ventilés portent le montant bancaire ; les enfants héritent)
parents = {o['id']: o for o in ops}
roots = [o for o in ops if o['parent_id'] is None]
children = defaultdict(list)
for o in ops:
    if o['parent_id']: children[o['parent_id']].append(o)

matched = {}   # op id -> (bank op, note)
used = set()   # index bank

def try_match(days):
    for i, b in enumerate(bank):
        if i in used: continue
        cands = [o for o in roots if o['id'] not in matched and o['type'] == b['sens'] and abs(o['montant'] - b['montant']) < 0.005 and close(o['date_operation'], b['iso'], days)]
        if not cands: continue
        cands.sort(key=lambda o: abs((iso(o['date_operation']) - iso(b['iso'])).days))
        o = cands[0]; matched[o['id']] = (b, ''); used.add(i)

try_match(0); try_match(3); try_match(10)

# lignes bancaires restantes : chercher une combinaison d'opérations Préau (même sens, ±3 j) dont la somme = montant (remise de chèques éclatée à l'import)
for i, b in enumerate(bank):
    if i in used: continue
    pool = [o for o in roots if o['id'] not in matched and o['type'] == b['sens'] and close(o['date_operation'], b['iso'], 3) and o['montant'] <= b['montant'] + 0.005]
    found = None
    for n in (2, 3, 4):
        for combo in itertools.combinations(pool, n):
            if abs(sum(o['montant'] for o in combo) - b['montant']) < 0.005:
                found = combo; break
        if found: break
    if found:
        for o in found: matched[o['id']] = (b, f"(partie de {b['montant']:.2f} €)")
        used.add(i)

# propagation aux enfants ventilés
for pid, kids in children.items():
    if pid in matched:
        for k in kids:
            if k['id'] not in matched: matched[k['id']] = (matched[pid][0], '(ventilation)')

# préparation des mises à jour : uniquement libelle_origine vide
updates, conflicts, kept = [], [], []
for o in ops:
    if o['id'] in matched:
        b, note = matched[o['id']]
        lib = b['libelle_complet']
        lib = re.sub(r'\s+', ' ', lib).strip()[:250]
        if note: lib = f'{lib} {note}'
        if o['libelle_origine']:
            kept.append((o, b))
            if b['libelle'].split()[0] not in o['libelle_origine']:
                conflicts.append((o, b))
        else:
            updates.append((o, lib))

unmatched_ops = [o for o in roots if o['id'] not in matched]
unmatched_bank = [b for i, b in enumerate(bank) if i not in used]

rep = []
rep.append(f"Préau : {len(ops)} opérations ({len(roots)} racines) ; banque : {len(bank)} lignes")
rep.append(f"Rapprochées : {len(matched)} opérations Préau ; à mettre à jour (libelle_origine vide) : {len(updates)} ; déjà renseignées : {len(kept)} (dont {len(conflicts)} divergentes)")
rep.append(f"\n== Opérations Préau SANS ligne bancaire ({len(unmatched_ops)}) ==")
for o in unmatched_ops: rep.append(f"  {o['date_operation']} {o['type'][:3]} {o['montant']:9.2f}  {o['libelle']}  [{o['libelle_origine'] or ''}]")
rep.append(f"\n== Lignes bancaires SANS opération Préau ({len(unmatched_bank)}) ==")
for b in unmatched_bank: rep.append(f"  {b['iso']} {b['sens'][:3]} {b['montant']:9.2f}  {b['libelle_complet'][:100]}")
rep.append(f"\n== Divergences sur libellés déjà renseignés ({len(conflicts)}) ==")
for o, b in conflicts: rep.append(f"  {o['date_operation']} {o['montant']:9.2f}  Préau: {o['libelle_origine'][:60]} | banque: {b['libelle_complet'][:60]}")
open(os.path.join(ROOT, 'scripts', 'rapprochement_report.txt'), 'w', encoding='utf-8').write('\n'.join(rep))
print('\n'.join(rep[:2]))

json.dump([{'id': o['id'], 'date': o['date_operation'], 'type': o['type'], 'montant': o['montant'], 'libelle': o['libelle'], 'libelle_origine': lib} for o, lib in updates],
          open(os.path.join(ROOT, 'scripts', 'rapprochement.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

def q(s): return "'" + s.replace("'", "''") + "'"
sql = ["update operations as o set libelle_origine = v.lib from (values"]
sql.append(",\n".join(f"  ({q(o['id'])}::uuid, {q(lib)})" for o, lib in updates))
sql.append(") as v(id, lib) where o.id = v.id and o.libelle_origine is null;")
open(os.path.join(ROOT, 'scripts', 'update_libelles.sql'), 'w', encoding='utf-8').write('\n'.join(sql))
print('SQL écrit :', len(updates), 'lignes')
