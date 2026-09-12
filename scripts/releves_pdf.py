# -*- coding: utf-8 -*-
"""Extrait les opérations (date, sens, montant, libellé bancaire complet) des relevés PDF Crédit Mutuel.

Usage : python scripts/releves_pdf.py "<dossier des PDF>" [sortie.json]
"""
import glob, json, os, re, sys
import pymupdf

DATE = re.compile(r'^\d{2}/\d{2}/\d{4}$')
AMOUNT = re.compile(r'^[\d\.]*\d,\d{2}$')
NOISE = re.compile(r'^(Date|Valeur|Opération|Débit|Crédit|EUROS|<<Suite|Page \d|SOLDE|TOTAL|Total des|Réf :|IBAN|Total|CME MARNE|BIC|www|\(G[DE]\)|Information|RELEVE|VOTRE CONSEILLER|C/C Eurocompte|TITULAIRE|KV\.|Caisse|0 820|21 RUE|ASSOCIATION REMOISE POUR L\'INSTRUCTION|LIBRE$|71 AVENUE|51100|10278$|02901$|CAISSE DE|TVA intra|Médiateur|Pour toute|\.{5,})')


def parse_pdf(path):
    doc = pymupdf.open(path)
    ops = []
    for page in doc:
        words = page.get_text("words")
        # regrouper par ligne (y arrondi)
        lines = {}
        for x0, y0, x1, y1, t, *_ in words:
            lines.setdefault(round(y0), []).append((x0, x1, t))
        cur = None
        for y in sorted(lines):
            ws = sorted(lines[y])
            texts = [t for _, _, t in ws]
            if len(ws) >= 3 and DATE.match(texts[0]) and DATE.match(texts[1]) and AMOUNT.match(texts[-1]):
                x1_amt = ws[-1][1]
                sens = 'depense' if x1_amt < 480 else 'recette'
                amt = float(texts[-1].replace('.', '').replace(',', '.'))
                cur = {'date': texts[0], 'valeur': texts[1], 'sens': sens, 'montant': amt,
                       'libelle': ' '.join(texts[2:-1]), 'details': [], 'fichier': os.path.basename(path)}
                ops.append(cur)
            elif cur is not None:
                line = ' '.join(texts).strip()
                # lignes de détail : commencent dans la colonne libellé (x0 ~ 100-130) et pas de bruit
                if ws[0][0] < 90 or ws[0][0] > 300 or NOISE.match(line):
                    if NOISE.match(line):
                        cur = None if line.startswith(('SOLDE', 'Total', 'TOTAL')) else cur
                    continue
                cur['details'].append(line)
    return ops


def main():
    folder = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else None
    allops = []
    for f in sorted(glob.glob(os.path.join(folder, '*.pdf'))):
        allops.extend(parse_pdf(f))
    # dédoublonnage (un relevé peut répéter la dernière ligne du précédent ? normalement non)
    for o in allops:
        d, m, y = o['date'].split('/')
        o['iso'] = f'{y}-{m}-{d}'
        det = [x for x in o['details'] if x]
        o['libelle_complet'] = ' '.join([o['libelle']] + det)
    allops.sort(key=lambda o: o['iso'])
    if out:
        json.dump(allops, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for o in allops:
        print(o['iso'], o['sens'][:3], f"{o['montant']:9.2f}", '|', o['libelle_complet'][:120])
    print(len(allops), 'opérations')


if __name__ == '__main__':
    main()
