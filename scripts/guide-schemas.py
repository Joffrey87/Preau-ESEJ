# Schémas annotés du Guide Professeurs (public/guide/*.svg), données fictives.
# Régénérer : python scripts/guide-schemas.py public/guide
import sys, os
OUT = sys.argv[1]
NAVY = "#021d51"; GOLD = "#c8952f"; GOLDS = "#f3e6c9"; CREAM = "#f7f3ea"; SURF = "#ffffff"; S2 = "#f1ece0"; BORD = "#e6dfce"; TXT = "#14213d"; MUT = "#6b7280"; ACS = "#dbe1f0"
FONT = "Montserrat, Segoe UI, Arial, sans-serif"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Svg:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.p = []

    def rect(s, x, y, w, h, fill=SURF, stroke=None, r=6, sw=1, dash=None):
        a = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        if dash:
            a += f' stroke-dasharray="{dash}"'
        s.p.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{a}/>')

    def t(s, x, y, txt, size=12, fill=TXT, w=400, anchor="start", ital=False):
        st = ' font-style="italic"' if ital else ''
        s.p.append(f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{w}" fill="{fill}" text-anchor="{anchor}"{st}>{esc(txt)}</text>')

    def line(s, x1, y1, x2, y2, c=BORD, sw=1):
        s.p.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{sw}"/>')

    def btn(s, x, y, w, txt, fort=True, h=26):
        s.rect(x, y, w, h, NAVY if fort else SURF, None if fort else BORD, 7)
        s.t(x + w / 2, y + h / 2 + 4.5, txt, 12, "#fff" if fort else NAVY, 600, "middle")

    def champ(s, x, y, w, txt, h=26):
        s.rect(x, y, w, h, SURF, BORD, 6)
        s.t(x + 8, y + h / 2 + 4.5, txt, 12)

    def cible(s, x, y, w, h):
        s.rect(x - 4, y - 4, w + 8, h + 8, "none", GOLD, 8, 2, "5 3")

    def pastille(s, x, y, n):
        s.p.append(f'<circle cx="{x}" cy="{y}" r="13" fill="{GOLD}" stroke="#fff" stroke-width="2"/>')
        s.t(x, y + 5, str(n), 13, "#fff", 700, "middle")

    def svg(s):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{s.w}" height="{s.h}" viewBox="0 0 {s.w} {s.h}">'
                f'<rect width="{s.w}" height="{s.h}" rx="12" fill="{CREAM}"/>' + "".join(s.p) + '</svg>')


# 1. Créer une évaluation et saisir les notes
a = Svg(820, 560)
a.rect(16, 16, 788, 40, SURF, BORD, 10)
a.t(30, 41, "Période 1", 13, TXT, 700)
a.t(104, 41, "Notes de la période, sans moyenne · cliquez une matière pour saisir les notes", 11.5, MUT)
a.rect(16, 66, 788, 120, SURF, BORD, 10)
a.t(30, 90, "ÉLÈVE", 10.5, MUT, 600)
a.rect(200, 72, 300, 22, GOLDS, None, 4); a.t(350, 87, "Français", 11.5, TXT, 700, "middle")
a.rect(504, 72, 290, 22, GOLDS, None, 4); a.t(649, 87, "Mathématiques", 11.5, TXT, 700, "middle")
for nom, x in [("Lecture", 200), ("Grammaire", 300), ("Dictée", 400), ("Calcul", 504), ("Géométrie", 600), ("Problèmes", 700)]:
    hl = nom == "Lecture"
    a.rect(x + 2, 98, 96, 32, NAVY if hl else SURF, None, 5)
    a.t(x + 50, 112, nom, 11.5, "#fff" if hl else TXT, 600 if hl else 400, "middle")
    a.t(x + 50, 125, "2 éval." if hl else "+ éval.", 9.5, "#fff" if hl else MUT, 400, "middle")
for i, (n, v) in enumerate([("Louise Martin", ["14 · 16", "12", "15"]), ("Paul Durand", ["11 · abs", "13", "9,5"])]):
    y = 148 + i * 20
    a.line(16, y - 12, 804, y - 12)
    a.t(30, y + 3, n, 12, TXT, 500)
    for j, val in enumerate(v):
        a.t(250 + j * 100, y + 3, val, 11.5, TXT, 400, "middle")
a.cible(202, 98, 96, 32); a.pastille(196, 96, 1)
a.rect(16, 198, 788, 346, "#eef1f8", NAVY, 12, 1.5)
a.t(30, 222, "SAISIE DES NOTES", 10.5, NAVY, 700)
a.rect(327, 206, 166, 26, "#d97706", None, 7); a.t(410, 223.5, "← Retour Relevés de notes", 12, "#fff", 700, "middle")
a.cible(327, 206, 166, 26); a.pastille(499, 206, 5)
a.t(30, 252, "Lecture", 14, TXT, 700); a.t(92, 252, "Mlle Exemple · coef 1", 11, MUT)
a.btn(560, 236, 110, "+ Évaluation"); a.cible(560, 236, 110, 26); a.pastille(556, 234, 2)
a.rect(680, 236, 110, 26, S2, None, 7); a.t(735, 253, "Grille | Élève", 11, MUT, 500, "middle")
a.rect(30, 274, 760, 64, "#e4e9f5", NAVY, 10, 1)
for lab, x, w, val in [("Titre", 44, 210, "Dictée 3"), ("Date", 266, 120, "14/10/2026"), ("Coefficient", 398, 90, "1"), ("Noté sur", 500, 90, "20")]:
    a.t(x, 292, lab, 10.5, MUT, 500); a.champ(x, 298, w, val)
a.btn(604, 298, 70, "Créer"); a.btn(682, 298, 80, "Annuler", False)
a.cible(42, 282, 550, 46); a.pastille(24, 268, 3)
a.rect(30, 352, 760, 180, SURF, BORD, 10)
a.t(44, 374, "ÉLÈVE", 10.5, MUT, 600)
for j, (h, sub) in enumerate([("Lecture 1", "2 oct. · /20"), ("Lecture 2", "9 oct. · /20"), ("Dictée 3", "14 oct. · /20")]):
    x = 250 + j * 120
    a.t(x, 370, h, 11.5, TXT, 600, "middle"); a.t(x, 383, sub, 9.5, MUT, 400, "middle")
a.t(640, 376, "MOYENNE", 10.5, MUT, 600, "middle")
rows = [("Louise Martin", ["14", "16", "15"], "15,00"), ("Paul Durand", ["11", "abs", "12,5"], "11,75"), ("Jeanne Petit", ["17", "15", ""], "16,00"), ("Hugo Lefèvre", ["9", "13", "disp"], "11,00")]
for i, (n, ns, m) in enumerate(rows):
    y = 408 + i * 30
    a.line(30, y - 16, 790, y - 16)
    a.t(44, y + 4, n, 12, TXT, 500)
    for j, v in enumerate(ns):
        x = 250 + j * 120
        if j == 2:
            a.rect(x - 30, y - 11, 60, 24, SURF, NAVY if i == 2 else BORD, 5, 1.5 if i == 2 else 1)
        a.t(x, y + 4, v, 12, MUT if v in ("abs", "disp") else TXT, 400, "middle", ital=v in ("abs", "disp"))
    a.t(640, y + 4, m, 12, TXT, 700, "middle")
a.cible(456, 394, 68, 124); a.pastille(540, 404, 4)
open(os.path.join(OUT, "saisie-notes.svg"), "w", encoding="utf-8").write(a.svg())

# 2. Appréciation générale du relevé
b = Svg(820, 400)
b.rect(16, 16, 788, 40, SURF, BORD, 10); b.t(30, 41, "Période 1", 13, TXT, 700)
b.btn(486, 23, 120, "Marquer prêt  12"); b.btn(614, 23, 60, "Valider", False); b.btn(682, 23, 110, "PDF de la classe", False)
b.cible(486, 23, 120, 26); b.pastille(482, 21, 3)
b.rect(16, 66, 788, 318, SURF, BORD, 10)
for x, h in [(48, "ÉLÈVE"), (230, "LECTURE"), (310, "CALCUL"), (390, "CATÉCHISME"), (510, "APPRÉCIATION GÉNÉRALE"), (700, "ÉTAT")]:
    b.t(x, 90, h, 10.5, MUT, 600)


def ligne(y, nom, act=False, app="✎ à rédiger", cat="✎", etat=("En cours", GOLD, GOLDS)):
    if act:
        b.rect(17, y - 16, 786, 26, ACS, None, 0)
    b.line(16, y - 16, 804, y - 16)
    b.rect(30, y - 8, 10, 10, SURF, BORD, 2)
    b.t(48, y + 2, nom, 12, NAVY if act else TXT, 700 if act else 500)
    b.t(230, y + 2, "14 · 16", 11.5); b.t(310, y + 2, "12 · 15", 11.5)
    b.t(390, y + 2, cat, 11.5, GOLD if cat == "✎" else TXT)
    b.t(510, y + 2, app, 11.5, GOLD if app.startswith("✎") else TXT)
    b.rect(700, y - 10, 62, 18, etat[2], None, 9); b.t(731, y + 3, etat[0], 10, etat[1], 600, "middle")
    b.t(780, y + 2, "PDF", 11, NAVY, 600)


ligne(118, "Louise Martin", True)
b.cible(44, 102, 110, 22); b.pastille(40, 100, 1)
b.rect(17, 132, 786, 164, "#f4f6fb", None, 0)
b.t(44, 160, "Catéchisme", 12, TXT, 700)
b.rect(190, 142, 560, 44, SURF, BORD, 6); b.t(200, 168, "Louise participe avec joie et attention aux séances.", 12)
b.t(44, 218, "Appréciation générale", 12, TXT, 700)
b.rect(190, 200, 560, 82, SURF, NAVY, 6, 1.5)
b.t(200, 222, "Très bonne période : Louise lit avec aisance et progresse en calcul.", 12)
b.t(200, 240, "Elle doit encore soigner la présentation de ses cahiers.", 12)
b.cible(186, 138, 568, 148); b.pastille(762, 136, 2)
ligne(320, "Paul Durand", app="Bon travail d'ensemble.", cat="Attentif et curieux.", etat=("Prêt", NAVY, ACS))
ligne(350, "Jeanne Petit", app="Excellente période !", cat="Très investie.", etat=("Prêt", NAVY, ACS))
b.cible(774, 106, 24, 20); b.pastille(806, 100, 4)
open(os.path.join(OUT, "appreciation-releve.svg"), "w", encoding="utf-8").write(b.svg())

# 3. Bulletin du trimestre
c = Svg(820, 460)
c.rect(16, 16, 788, 40, SURF, BORD, 10)
c.t(30, 41, "Bulletins · Premier Trimestre", 13, TXT, 700)
c.t(250, 41, "Moyennes simples sur 20, calculées sur toutes les notes du trimestre", 11, MUT)
c.rect(16, 66, 788, 380, SURF, BORD, 10)
c.rect(30, 78, 10, 10, SURF, BORD, 2); c.t(48, 88, "Louise Martin", 13, TXT, 700)
c.rect(160, 76, 62, 18, GOLDS, None, 9); c.t(191, 89, "En cours", 10, GOLD, 600, "middle")
c.t(240, 88, "Moyenne générale", 11.5, MUT); c.t(344, 88, "15,20", 12.5, NAVY, 700)
c.t(780, 88, "PDF", 11, NAVY, 600)
rows = [("g", "Français", "14,80", None), ("m", "Lecture", "15,00", "Lit avec aisance et plaisir."), ("m", "Grammaire", "14,60", "Bonnes bases, à consolider."),
        ("g", "Matières complémentaires", "16,00", None), ("m", "Anglais", "16,00", "Very good work! Louise participe volontiers."),
        ("g", "Catéchisme", "", None), ("m", "Catéchisme", "", "Louise participe avec joie et attention aux séances.")]
y = 120
for k, nom, moy, app in rows:
    if k == "g":
        c.rect(30, y - 15, 760, 22, GOLDS, None, 3); c.t(40, y + 1, nom, 12, TXT, 700); c.t(250, y + 1, moy, 12, TXT, 700, "middle")
    else:
        c.line(30, y - 15, 790, y - 15); c.t(52, y + 1, nom, 12); c.t(250, y + 1, moy, 12, TXT, 400, "middle")
        if app:
            c.rect(290, y - 13, 490, 24, SURF, BORD, 5); c.t(300, y + 3, app, 11.5)
    y += 30
c.cible(224, 104, 52, 82); c.pastille(282, 102, 1)
c.cible(286, 137, 498, 118); c.pastille(790, 134, 2)
c.cible(286, 287, 498, 28); c.pastille(790, 284, 3)
c.line(30, 322, 790, 322)
c.t(44, 352, "Appréciation du trimestre", 12, TXT, 700)
c.rect(230, 334, 550, 76, SURF, NAVY, 6, 1.5)
c.t(240, 356, "Un trimestre très réussi : Louise est sérieuse et appliquée.", 12)
c.t(240, 374, "Elle doit gagner en confiance à l'oral.", 12)
c.cible(226, 330, 558, 84); c.pastille(790, 330, 4)
c.t(44, 432, "Les appréciations des relevés ne sont pas reprises : le bulletin a la sienne.", 11, MUT, 400, ital=True)
open(os.path.join(OUT, "appreciations-bulletin.svg"), "w", encoding="utf-8").write(c.svg())

if len(sys.argv) > 2:
    import pymupdf
    for n in ["saisie-notes", "appreciation-releve", "appreciations-bulletin"]:
        d = pymupdf.open(os.path.join(OUT, n + ".svg"))
        d[0].get_pixmap(dpi=72).save(os.path.join(sys.argv[2], n + ".png"))
print("ok")
