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
a = Svg(820, 610)
a.rect(16, 16, 788, 40, SURF, BORD, 10)
a.rect(26, 22, 120, 28, NAVY, None, 6); a.t(86, 40, "Relevés de notes", 11.5, "#fff", 600, "middle")
a.t(196, 40, "Bulletins", 11.5, TXT, 600, "middle")
a.rect(250, 22, 230, 28, SURF, BORD, 6); a.t(262, 40, "Période 1 · 3.09 → 2.10   ▾", 11.5, TXT, 500)
a.rect(16, 66, 788, 120, SURF, BORD, 10)
a.t(30, 84, "MATIÈRE", 10.5, MUT, 600)
for nom, prenom, x in [("Martin", "Louise", 330), ("Durand", "Paul", 470), ("Petit", "Jeanne", 610)]:
    a.t(x, 80, prenom, 11.5, TXT, 600, "middle"); a.t(x, 91, nom, 9.5, MUT, 400, "middle")
def bande(y, nom):
    a.rect(17, y, 786, 18, GOLDS, None, 0); a.t(30, y + 13, nom, 11.5, TXT, 700)
def ligne_m(y, nom, nb, vals, act=False):
    if act:
        a.rect(17, y, 184, 18, NAVY, None, 0)
    a.t(30, y + 13, nom, 11.5, "#fff" if act else TXT, 600 if act else 400)
    a.t(160, y + 13, nb, 9.5, "#fff" if act else MUT, 400)
    for j, v in enumerate(vals):
        a.t(330 + j * 140, y + 13, v, 11.5, TXT, 400, "middle")
bande(96, "Français")
ligne_m(114, "Lecture", "2 éval.", ["14 · 16", "11 · abs", "17 · 15"], True)
a.cible(17, 114, 184, 18); a.pastille(206, 112, 1)
ligne_m(132, "Grammaire", "", ["12", "13", "15"])
bande(150, "Mathématiques")
ligne_m(168, "Calcul", "", ["15", "9,5", "16"])
a.rect(16, 198, 788, 396, "#eef1f8", NAVY, 12, 1.5)
a.t(30, 222, "SAISIE DES NOTES", 10.5, NAVY, 700)
a.rect(327, 206, 166, 26, NAVY, None, 7); a.t(410, 223.5, "← Retour Relevés de notes", 12, GOLD, 700, "middle")
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
a.rect(282, 548, 256, 32, NAVY, None, 8); a.t(410, 569, "Enregistrer et revenir au relevé", 12.5, GOLD, 700, "middle")
a.cible(282, 548, 256, 32); a.pastille(546, 546, 6)
open(os.path.join(OUT, "saisie-notes.svg"), "w", encoding="utf-8").write(a.svg())

# 2. Appréciation générale du relevé
b = Svg(820, 450)
b.rect(16, 16, 788, 40, SURF, BORD, 10); b.t(30, 41, "Période 1", 13, TXT, 700)
b.rect(30, 22, 100, 28, GOLDS, None, 6); b.t(80, 40, "En cours", 12, GOLD, 600, "middle")
b.rect(132, 22, 60, 28, "#e8f5e9", None, 6); b.t(162, 40, "Prêt", 12, "#27693a", 600, "middle")
b.rect(28, 20, 166, 32, "none", NAVY, 8, 1.5)
b.btn(560, 23, 56, "Valider", False); b.btn(624, 23, 140, "Publier aux familles", False)
b.cible(26, 18, 172, 36); b.pastille(202, 16, 3)
b.rect(16, 66, 788, 232, "#eef1f8", NAVY, 12, 1.5)
b.rect(26, 74, 26, 22, NAVY, None, 6); b.t(39, 90, "‹", 15, "#fff", 700, "middle")
b.t(62, 90, "APPRÉCIATIONS · LOUISE MARTIN", 10.5, NAVY, 700)
b.rect(262, 74, 26, 22, NAVY, None, 6); b.t(275, 90, "›", 15, "#fff", 700, "middle")
b.rect(327, 74, 166, 26, NAVY, None, 7); b.t(410, 91.5, "← Retour Relevés de notes", 12, GOLD, 700, "middle")
b.t(44, 136, "Catéchisme", 12, TXT, 700)
b.rect(190, 114, 560, 40, SURF, BORD, 6); b.t(200, 138, "Louise participe avec joie et attention aux séances.", 12)
b.t(44, 202, "Appréciation générale", 12, TXT, 700)
b.rect(190, 164, 560, 82, SURF, NAVY, 6, 1.5)
b.t(200, 186, "Très bonne période : Louise lit avec aisance et progresse en calcul.", 12)
b.t(200, 204, "Elle doit encore soigner la présentation de ses cahiers.", 12)
b.cible(186, 110, 568, 140); b.pastille(762, 108, 2)
b.rect(282, 258, 256, 30, NAVY, None, 8); b.t(410, 277, "Enregistrer et revenir au relevé", 12.5, GOLD, 700, "middle")
b.cible(282, 258, 256, 30); b.pastille(544, 256, 4)
b.rect(16, 310, 788, 124, SURF, BORD, 10)
b.rect(284, 311, 92, 36, ACS, None, 0)
b.t(30, 334, "MATIÈRE", 10.5, MUT, 600)
for prenom, nom, x, act in [("Louise", "Martin", 330, True), ("Paul", "Durand", 470, False), ("Jeanne", "Petit", 610, False)]:
    b.t(x, 329, prenom, 11.5, NAVY if act else TXT, 700 if act else 600, "middle"); b.t(x, 341, nom, 9.5, MUT, 400, "middle")
b.cible(284, 314, 92, 34); b.pastille(380, 312, 1)
b.rect(17, 350, 786, 18, GOLDS, None, 0); b.t(30, 363, "Français", 11.5, TXT, 700)
b.t(30, 381, "Lecture", 11.5); b.t(30, 399, "Calcul", 11.5); b.t(30, 417, "Catéchisme", 11.5); b.t(100, 417, "appréciation", 9.5, MUT)
for j, vals in enumerate([("14 · 16", "12", "✎"), ("11 · abs", "13", "✎"), ("17 · 15", "15", "✎")]):
    x = 330 + j * 140
    for i, v in enumerate(vals):
        b.t(x, 381 + i * 18, v, 11.5, GOLD if v == "✎" else TXT, 400, "middle")
open(os.path.join(OUT, "appreciation-releve.svg"), "w", encoding="utf-8").write(b.svg())

# 3. Bulletin du trimestre
c = Svg(820, 510)
c.rect(16, 16, 788, 40, SURF, BORD, 10)
c.t(30, 41, "Bulletins · Premier Trimestre", 13, TXT, 700)
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
c.rect(350, 462, 120, 30, NAVY, None, 8); c.t(410, 482, "Enregistrer", 12.5, GOLD, 700, "middle")
c.cible(350, 462, 120, 30); c.pastille(344, 460, 5)
open(os.path.join(OUT, "appreciations-bulletin.svg"), "w", encoding="utf-8").write(c.svg())

if len(sys.argv) > 2:
    import pymupdf
    for n in ["saisie-notes", "appreciation-releve", "appreciations-bulletin"]:
        d = pymupdf.open(os.path.join(OUT, n + ".svg"))
        d[0].get_pixmap(dpi=72).save(os.path.join(sys.argv[2], n + ".png"))
print("ok")
