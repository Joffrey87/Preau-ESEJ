import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { PARAMS } from "@/lib/segments";

type Statut = "actif" | "developper" | "explorer";

const STATUT: Record<Statut, { label: string; cls: string }> = {
  actif: { label: "Actif", cls: "bg-positive/15 text-positive" },
  developper: { label: "À développer", cls: "bg-gold-soft text-gold" },
  explorer: { label: "À explorer", cls: "bg-surface-2 text-muted" },
};

type Axe = {
  titre: string;
  description: string;
  statut: Statut;
  href?: string;
  hrefLabel?: string;
};

// Axes de diversification du financement de l'école (au-delà des seuls dons).
const AXES: Axe[] = [
  {
    titre: "Dons des particuliers",
    description:
      "Collecte régulière auprès des familles et sympathisants. Segmentée et pilotée par le radar donateurs.",
    statut: "actif",
    href: "/mecenat/pipeline",
    hrefLabel: "Ouvrir le pipeline",
  },
  {
    titre: "Grands donateurs & mécènes",
    description:
      "Relation nominative avec les donateurs à fort potentiel : rendez-vous annuel, projets fléchés, argument IFI.",
    statut: "actif",
    href: "/mecenat/strategie",
    hrefLabel: "Voir la stratégie",
  },
  {
    titre: "Mécénat d'entreprise",
    description:
      "Entreprises locales : mécénat financier, en nature ou de compétences (réduction d'impôt 60 %). Cibler le tissu économique de proximité.",
    statut: "developper",
  },
  {
    titre: "Fondations & appels à projets",
    description:
      "Fondations sous égide, fonds de dotation, appels à projets diocésains ou éducatifs. Financement par projet, souvent pluriannuel.",
    statut: "developper",
  },
  {
    titre: "Subventions publiques",
    description:
      "Collectivités (commune, département, région), CAF, dispositifs éducatifs. À instruire selon l'éligibilité de l'établissement.",
    statut: "developper",
  },
  {
    titre: "Événements & collectes",
    description:
      "Kermesse, gala de charité, ventes solidaires, cagnottes en ligne. Recette directe et occasion de recruter de nouveaux donateurs.",
    statut: "developper",
  },
  {
    titre: "Cotisations & ventes",
    description:
      "Adhésions à l'association, produits dérivés, prestations. Ressources propres, récurrentes et prévisibles.",
    statut: "explorer",
  },
  {
    titre: "Legs & libéralités",
    description:
      "Legs, donations, assurance-vie. Générosité de long terme à sécuriser juridiquement — potentiel élevé, horizon lointain.",
    statut: "explorer",
  },
];

export default function FinancementPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Financement"
        subtitle="Diversifier les ressources de l'école au-delà des seuls dons — chaque axe réduit la dépendance aux autres."
      />

      <div className="mb-6 rounded-xl border border-dashed border-border bg-surface-2 px-5 py-4 text-sm text-muted">
        Objectif de collecte annuelle :{" "}
        <strong className="text-foreground">≥ {PARAMS.collecteCible.toLocaleString("fr-FR")} €</strong>. Plus les
        sources sont variées, moins la perte d&apos;un grand donateur met l&apos;équilibre en danger
        (concentration des 5 premiers &lt; {PARAMS.concentrationTop5Max} %).
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AXES.map((a) => {
          const s = STATUT[a.statut];
          return (
            <div key={a.titre} className="flex flex-col rounded-xl border border-border bg-surface p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold">{a.titre}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
              </div>
              <p className="flex-1 text-sm text-muted">{a.description}</p>
              {a.href && (
                <Link href={a.href} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                  {a.hrefLabel ?? "Ouvrir"} →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
