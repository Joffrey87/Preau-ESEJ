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
VERT = "#2e7d4f"; VERTS = "#e3f2e8"
a = Svg(820, 720)
# Barre du haut : onglets, période, commutateur.
a.rect(16, 16, 788, 40, SURF, BORD, 10)
a.rect(26, 22, 120, 28, NAVY, None, 6); a.t(86, 40, "Relevés de notes", 11.5, "#fff", 600, "middle")
a.t(196, 40, "Bulletins", 11.5, TXT, 600, "middle")
a.rect(250, 22, 230, 28, SURF, BORD, 6); a.t(262, 40, "Période 2 · 5.10 → 6.11   ▾", 11.5, TXT, 500)
a.rect(600, 22, 90, 28, GOLDS, None, 6); a.t(645, 40, "En cours", 11.5, GOLD, 600, "middle")
a.rect(692, 22, 100, 28, SURF, BORD, 6); a.t(742, 40, "Prêt", 11.5, MUT, 600, "middle")
# Blocs de niveau et « + Évaluation », sur une même ligne.
a.rect(130, 66, 74, 24, GOLDS, "#d9c08a", 7); a.t(167, 82, "CE1 · 4", 11.5, GOLD, 700, "middle")
a.rect(212, 66, 74, 24, SURF, BORD, 7); a.t(249, 82, "CE2 · 3", 11.5, MUT, 600, "middle")
a.rect(294, 66, 74, 24, SURF, BORD, 7); a.t(331, 82, "CM1 · 3", 11.5, MUT, 600, "middle")
a.rect(376, 66, 132, 24, SURF, BORD, 7); a.t(442, 82, "Tous les niveaux", 11.5, MUT, 600, "middle")
a.btn(520, 65, 110, "+ Évaluation", True, 26)
a.cible(520, 65, 110, 26); a.pastille(636, 62, 1)
# Tableau du relevé : la moyenne dans chaque case.
a.rect(16, 100, 788, 96, SURF, BORD, 10)
a.t(30, 118, "MATIÈRE", 10.5, MUT, 600)
for nom, prenom, x in [("M.", "Louise", 330), ("D.", "Paul", 470), ("P.", "Jeanne", 610)]:
    a.t(x, 114, prenom, 11.5, TXT, 400, "middle"); a.t(x, 126, nom, 9.5, MUT, 400, "middle")
a.rect(17, 130, 786, 18, GOLDS, None, 0); a.t(30, 143, "Français", 11.5, TXT, 700)
a.rect(17, 148, 184, 18, NAVY, None, 0); a.t(30, 161, "Lecture", 11.5, "#fff", 600)
for j, v in enumerate(["15,00", "11,75", "16,00"]):
    a.t(330 + j * 140, 161, v, 11.5, TXT, 400, "middle")
a.t(30, 179, "Grammaire", 11.5)
for j, v in enumerate(["12,00", "13,00", "15,00"]):
    a.t(330 + j * 140, 179, v, 11.5, TXT, 400, "middle")
a.cible(17, 148, 388, 18); a.pastille(412, 146, 2)
# Saisie de la matière : formulaire.
a.rect(16, 208, 788, 498, "#eef1f8", NAVY, 12, 1.5)
a.t(30, 232, "SAISIE DES NOTES", 10.5, NAVY, 700)
a.rect(327, 216, 166, 26, NAVY, None, 7); a.t(410, 233.5, "← Retour Relevés de notes", 12, GOLD, 700, "middle")
a.rect(30, 252, 760, 70, "#e4e9f5", NAVY, 10, 1)
a.t(44, 270, "Titre", 10.5, MUT, 500); a.champ(44, 276, 170, "Dictée 3")
a.t(226, 270, "Matière", 10.5, MUT, 500)
a.rect(226, 276, 130, 26, NAVY, None, 7); a.t(238, 293, "Lecture   ▾", 12, "#fff", 600)
a.t(368, 270, "Date", 10.5, MUT, 500); a.champ(368, 276, 100, "14/10/2026")
a.t(480, 270, "Coef.", 10.5, MUT, 500); a.champ(480, 276, 48, "1")
a.t(540, 270, "Noté sur", 10.5, MUT, 500); a.champ(540, 276, 56, "20")
a.t(610, 270, "Niveau(x) concerné(s)", 10.5, MUT, 500)
for k, (nv, x) in enumerate([("CE1", 610), ("CE2", 666), ("CM1", 722)]):
    coche = k < 2
    a.rect(x, 276, 50, 26, "#dbe1f0" if coche else SURF, NAVY if coche else BORD, 6, 1)
    a.t(x + 25, 293, ("✓ " if coche else "") + nv, 11.5, NAVY if coche else MUT, 600, "middle")
a.cible(210, 258, 154, 52); a.pastille(212, 254, 3)
a.cible(606, 258, 184, 52)
# Liste des élèves des niveaux cochés, avec séparateurs ambre.
a.rect(30, 334, 760, 284, SURF, BORD, 10)
a.t(44, 352, "ÉLÈVE", 10.5, MUT, 600); a.t(330, 352, "NOTE /20", 10.5, MUT, 600, "middle"); a.t(430, 352, "APPRÉCIATION", 10.5, MUT, 600)
def sep(y, txt):
    a.rect(31, y, 758, 17, GOLDS, None, 0); a.rect(31, y, 4, 17, GOLD, None, 0); a.t(44, y + 12.5, txt, 10.5, GOLD, 700)
def eleve(y, nom, note, app):
    a.t(44, y + 22, nom, 12, TXT, 500)
    a.rect(300, y + 8, 60, 28, SURF, NAVY if note else BORD, 5, 1.5 if note else 1)
    a.t(330, y + 26, note, 12, TXT, 400, "middle")
    a.rect(430, y + 4, 340, 38, SURF, BORD, 5)
    a.t(440, y + 28, app, 11.5, MUT if not app else TXT)
sep(360, "CE1 · 2 élève(s)")
eleve(380, "Louise Martin", "15", "Très bonne lecture, expressive.")
eleve(426, "Paul Durand", "", "")
sep(474, "CE2 · 1 élève(s)")
eleve(494, "Jeanne Petit", "17", "")
a.t(330, 580, "", 11)
a.cible(40, 358, 744, 24); a.pastille(24, 356, 4)
a.cible(296, 384, 68, 34); a.pastille(368, 382, 5)
a.t(44, 604, "Sans note, l'élève est considéré absent (« abs »).", 10.5, MUT, 400, ital=True)
# Boutons flottants en bas.
a.rect(318, 640, 184, 46, SURF, BORD, 12)
a.btn(328, 648, 80, "Créer", True, 30); a.btn(414, 648, 80, "Annuler", False, 30)
a.cible(324, 644, 172, 38); a.pastille(508, 640, 6)
open(os.path.join(OUT, "saisie-notes.svg"), "w", encoding="utf-8").write(a.svg())

# 2. Appréciation générale du relevé
b = Svg(820, 450)
b.rect(16, 16, 788, 40, SURF, BORD, 10); b.t(30, 41, "Période 2", 13, TXT, 700)
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
b.rect(16, 310, 788, 124, SURF, BORD, 10)
b.rect(284, 311, 92, 36, ACS, None, 0)
b.t(30, 334, "MATIÈRE", 10.5, MUT, 600)
for prenom, nom, x, act in [("Louise", "M.", 330, True), ("Paul", "D.", 470, False), ("Jeanne", "P.", 610, False)]:
    b.t(x, 329, prenom, 11.5, NAVY if act else TXT, 700 if act else 400, "middle"); b.t(x, 341, nom, 9.5, MUT, 400, "middle")
b.cible(284, 314, 92, 34); b.pastille(380, 312, 1)
b.rect(17, 350, 786, 18, GOLDS, None, 0); b.t(30, 363, "Français", 11.5, TXT, 700)
b.t(30, 381, "Lecture", 11.5); b.t(30, 399, "Calcul", 11.5); b.t(30, 417, "Catéchisme", 11.5); b.t(100, 417, "appréciation", 9.5, MUT)
for j, vals in enumerate([("15,00", "12,00", "✎"), ("11,75", "13,00", "✎"), ("16,00", "15,00", "✎")]):
    x = 330 + j * 140
    for i, v in enumerate(vals):
        b.t(x, 381 + i * 18, v, 11.5, GOLD if v == "✎" else TXT, 400, "middle")
open(os.path.join(OUT, "appreciation-releve.svg"), "w", encoding="utf-8").write(b.svg())

# 3. Bulletin du trimestre
c = Svg(820, 560)
c.rect(16, 16, 788, 40, SURF, BORD, 10)
c.t(30, 41, "Bulletins · Premier Trimestre", 13, TXT, 700)
c.rect(16, 66, 788, 430, SURF, BORD, 10)
# Navigation d'élève en haut (prénom + initiale), l'élève en cours dessous, centré.
c.rect(30, 76, 370, 34, SURF, BORD, 8); c.t(46, 98, "‹", 16, NAVY, 700); c.t(66, 98, "Hugo L.", 12, TXT, 600)
c.rect(420, 76, 370, 34, SURF, BORD, 8); c.t(744, 98, "›", 16, NAVY, 700, "end"); c.t(724, 98, "Paul D.", 12, TXT, 600, "end")
c.rect(590, 79, 54, 28, GOLDS, None, 5); c.t(617, 97, "Vers CE2", 9.5, GOLD, 700, "middle")
c.cible(26, 72, 768, 42); c.pastille(802, 70, 1)
c.t(410, 134, "Louise Martin", 13.5, TXT, 700, "middle")
c.t(410, 152, "Moyenne générale  15,20", 11, MUT, 400, "middle")
o = 52
rows = [("g", "Français", "14,80", None), ("m", "Lecture", "15,00", "Lit avec aisance et plaisir."), ("m", "Grammaire", "14,60", "Bonnes bases, à consolider."),
        ("g", "Matières complémentaires", "16,00", None), ("m", "Anglais", "16,00", "Very good work! Louise participe volontiers."),
        ("g", "Catéchisme", "", None), ("m", "Catéchisme", "", "Louise participe avec joie et attention aux séances.")]
y = 120 + o + 20
for k, nom, moy, app in rows:
    if k == "g":
        c.rect(30, y - 15, 760, 22, GOLDS, None, 3); c.t(40, y + 1, nom, 12, TXT, 700); c.t(250, y + 1, moy, 12, TXT, 700, "middle")
    else:
        c.line(30, y - 15, 790, y - 15); c.t(52, y + 1, nom, 12); c.t(250, y + 1, moy, 12, TXT, 400, "middle")
        if app:
            c.rect(290, y - 13, 490, 24, SURF, BORD, 5); c.t(300, y + 3, app, 11.5)
    y += 30
c.cible(224, 104 + o + 20, 52, 82); c.pastille(282, 102 + o + 20, 2)
c.cible(286, 137 + o + 20, 498, 118); c.pastille(790, 134 + o + 20, 3)
c.cible(286, 287 + o + 20, 498, 28); c.pastille(790, 284 + o + 20, 4)
c.line(30, 322 + o + 20, 790, 322 + o + 20)
c.t(44, 352 + o + 20, "Appréciation du trimestre", 12, TXT, 700)
c.rect(230, 334 + o + 20, 550, 76, SURF, NAVY, 6, 1.5)
c.t(240, 356 + o + 20, "Un trimestre très réussi : Louise est sérieuse et appliquée.", 12)
c.t(240, 374 + o + 20, "Elle doit gagner en confiance à l'oral.", 12)
c.cible(226, 330 + o + 20, 558, 84); c.pastille(790, 330 + o + 20, 5)
c.rect(350, 506, 120, 30, NAVY, None, 8); c.t(410, 526, "Enregistrer", 12.5, GOLD, 700, "middle")
c.cible(350, 506, 120, 30); c.pastille(344, 504, 6)
open(os.path.join(OUT, "appreciations-bulletin.svg"), "w", encoding="utf-8").write(c.svg())

if len(sys.argv) > 2:
    import pymupdf
    for n in ["saisie-notes", "appreciation-releve", "appreciations-bulletin"]:
        d = pymupdf.open(os.path.join(OUT, n + ".svg"))
        d[0].get_pixmap(dpi=72).save(os.path.join(sys.argv[2], n + ".png"))
print("ok")
