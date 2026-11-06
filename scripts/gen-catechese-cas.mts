/**
 * 4 cas Catéchisme : avec / sans appréciation enseignante × relevé / bulletin.
 * Crops → /workspace/catechese-*.png
 */
import { writeFileSync, mkdirSync, readFileSync } from "fs";

const PUBLIC = "/workspace/Preau-ESEJ/public";
const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
  if (u.startsWith("/recu/")) {
    const buf = readFileSync(PUBLIC + u);
    return new Response(buf);
  }
  return origFetch(input as any, init);
}) as typeof fetch;

const { construireBulletinsPdf } = await import("../src/lib/bulletinPdf.ts");
const vide = { moy: null, moyClasse: null, rang: null };

const TEXTE_ENSEIGNANTE =
  "Participation sérieuse en classe : bons souvenirs des leçons, attitude recueillie.";
const TEXTE_CHANOINE =
  "Élève attentive et recueillie. Très bonne participation aux leçons du catéchisme.";

function baseReleve(apps: { titre: string; texte: string }[]) {
  return {
    v: 1 as const,
    mode: "releve" as const,
    eleve: { prenom: "Eulalie", nom: "DE LA FONTAINE", niveau: "CE2", naissance: null },
    classe: { nom: "CE2", titulaire: "Mademoiselle de Fonclare", roleTitulaire: "Enseignante" as const },
    periode: { libelle: "Du 01.09.2026 au 15.10.2026", annee: "2026-2027", trimestre: null, numero: 1 },
    afficherRang: false,
    general: vide,
    groupes: [
      {
        nom: "Français",
        chiffre: vide,
        matieres: [{ nom: "Lecture", enseignants: "", chiffre: vide, commentaire: "14/20 · 15,5/20" }],
      },
      {
        nom: "Matières complémentaires",
        chiffre: vide,
        matieres: [
          {
            nom: "Catéchisme",
            enseignants: "Chanoine Journé",
            chiffre: vide,
            commentaire: "18/20 · 17/20",
            appreciations: apps,
          },
          { nom: "Anglais", enseignants: "Monsieur Lenoble", chiffre: vide, commentaire: "15/20 · 14,5/20" },
        ],
      },
    ],
    mention: null,
    appreciation: "Trimestre sérieux et appliqué.",
    absences: undefined,
    presentiel: null,
    rubriques: [],
  };
}

function baseBulletin(apps: { titre: string; texte: string }[]) {
  return {
    v: 1 as const,
    mode: "trimestre" as const,
    eleve: { prenom: "Eulalie", nom: "DE LA FONTAINE", niveau: "CE2", naissance: "2017-05-14" },
    classe: { nom: "CE2", titulaire: "Mademoiselle de Fonclare", roleTitulaire: "Enseignante" as const },
    periode: { libelle: "Premier Trimestre", annee: "2026-2027", trimestre: 1, numero: undefined },
    afficherRang: false,
    general: { moy: 14.85, moyClasse: null, rang: null },
    groupes: [
      {
        nom: "Français",
        chiffre: { moy: 14.2, moyClasse: null, rang: null },
        matieres: [
          { nom: "Lecture", enseignants: "", chiffre: { moy: 14.75, moyClasse: null, rang: null }, commentaire: null },
        ],
      },
      {
        nom: "Matières complémentaires",
        chiffre: { moy: 16.1, moyClasse: null, rang: null },
        matieres: [
          {
            nom: "Catéchisme",
            enseignants: "Chanoine Journé",
            chiffre: { moy: 17.5, moyClasse: null, rang: null },
            commentaire: null,
            appreciations: apps,
          },
          {
            nom: "Anglais",
            enseignants: "Monsieur Lenoble",
            chiffre: { moy: 14.75, moyClasse: null, rang: null },
            commentaire: "Progrès constants à l'oral. Vocabulaire bien acquis.",
          },
        ],
      },
    ],
    mention: "encouragements" as const,
    appreciation: "Trimestre sérieux et appliqué.",
    absences: { justifiees: 1, injustifiees: 0, retards: 0 },
    presentiel: null,
    rubriques: [],
  };
}

const avec = [
  { titre: "", texte: TEXTE_CHANOINE },
  { titre: "Mademoiselle de Fonclare", texte: TEXTE_ENSEIGNANTE },
];
const sans = [{ titre: "", texte: TEXTE_CHANOINE }];

const cas = [
  { cle: "avec-enseignante-releve", syn: baseReleve(avec) },
  { cle: "avec-enseignante-bulletin", syn: baseBulletin(avec) },
  { cle: "sans-enseignante-releve", syn: baseReleve(sans) },
  { cle: "sans-enseignante-bulletin", syn: baseBulletin(sans) },
] as const;

mkdirSync("/tmp/catechese", { recursive: true });

for (const c of cas) {
  const pdf = await construireBulletinsPdf([c.syn as any]);
  const pdfPath = `/tmp/catechese/${c.cle}.pdf`;
  writeFileSync(pdfPath, pdf);
  console.log("PDF", c.cle, pdf.length);
}

console.log("PDFs ready");
