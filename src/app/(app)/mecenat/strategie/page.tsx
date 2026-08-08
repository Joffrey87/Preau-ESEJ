import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { PARAMS, SEGMENTS, PICS_ANNEE } from "@/lib/segments";
import { ETAPES } from "@/lib/pipeline";

export default function StrategiePage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
      <PageHeader
        title="Stratégie mécénat & pipeline donateurs"
        subtitle="Les règles qui pilotent la relation donateurs. À présenter au responsable Mécénat — modifiables."
        action={
          <Link href="/mecenat/pipeline" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Voir le pipeline →
          </Link>
        }
      />

      <div className="space-y-8">
        <Bloc titre="Le principe" numero="1">
          <p>
            Le pipeline est un <strong>radar relationnel</strong>, nourri par l&apos;historique réel des dons.
            Il combine deux couches :
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Un profil calculé automatiquement</strong> pour chaque donateur (cumul, ancienneté,
              récence, régularité) — mis à jour à chaque nouvel import de dons.
            </li>
            <li>
              <strong>Un suivi relationnel manuel</strong> (étape, responsable, prochaine action) que l&apos;on
              renseigne uniquement pour les donateurs que l&apos;on décide de travailler.
            </li>
          </ul>
        </Bloc>

        <Bloc titre="Segmentation des donateurs" numero="2">
          <p className="mb-3">Chaque donateur est classé automatiquement, ce qui oriente l&apos;action à mener :</p>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-muted">
                  <th className="px-4 py-2 font-medium">Segment</th>
                  <th className="px-4 py-2 font-medium">Règle</th>
                  <th className="px-4 py-2 font-medium">Action recommandée</th>
                </tr>
              </thead>
              <tbody>
                {SEGMENTS.map((s) => (
                  <tr key={s.key} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      <span className="mr-1">{s.emoji}</span>
                      {s.label}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.regle}</td>
                    <td className="px-4 py-3">{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloc>

        <Bloc titre="Paramètres actés" numero="3">
          <p className="mb-3">
            Ces seuils ont été décidés le 08/08/2026 et peuvent être ajustés (ils sont regroupés dans le
            fichier <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">segments.ts</code>) :
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Param label="Grand donateur" valeur={`≥ ${PARAMS.seuilGrandDonateur.toLocaleString("fr-FR")} €/an`} />
            <Param label="Nouveau" valeur={`< ${PARAMS.nouveauMois} mois`} />
            <Param label="En sommeil" valeur={`${PARAMS.sommeilMois} mois sans don`} />
            <Param label="Perdu" valeur={`${PARAMS.perduMois} mois sans don`} />
            <Param label="Fidèle" valeur={`≥ ${PARAMS.fideleAnnees} années`} />
            <Param label="Suivi des foyers" valeur="Non regroupés (à venir)" />
          </div>
        </Bloc>

        <Bloc titre="Comment ça guide les contacts" numero="4">
          <p className="mb-2">
            Le radar propose une liste <strong>« à contacter »</strong> priorisée : grands donateurs sans
            contact récent, fidèles qui n&apos;ont pas encore redonné cette année, donateurs en sommeil.
          </p>
          <p className="mb-2">Elle se cale sur les <strong>4 pics de générosité</strong> de l&apos;année :</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PICS_ANNEE.map((p) => (
              <div key={p.mois} className="rounded-lg border border-border bg-surface p-3 text-center">
                <div className="text-sm font-semibold text-gold">{p.mois}</div>
                <div className="mt-1 text-xs text-muted">{p.motif}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 mb-2">
            Chaque donateur travaillé avance dans le <strong>parcours relationnel</strong> (« moves management ») :
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {ETAPES.map((e, i) => (
              <span key={e.key} className="flex items-center gap-1.5">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{e.label}</span>
                {i < ETAPES.length - 1 && <span className="text-muted">→</span>}
              </span>
            ))}
          </div>
        </Bloc>

        <Bloc titre="Indicateurs de vigilance" numero="5">
          <p className="mb-3">Deux risques à surveiller en continu :</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold">Concentration</div>
              <p className="mt-1 text-sm text-muted">
                La part des <strong>5 premiers donateurs</strong> doit rester{" "}
                <strong className="text-foreground">&lt; {PARAMS.concentrationTop5Max} %</strong> de la collecte.
                Au-delà, la perte de 2-3 donateurs mettrait l&apos;école en danger.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-sm font-semibold">Rétention</div>
              <p className="mt-1 text-sm text-muted">
                Le taux de donateurs qui redonnent d&apos;une année sur l&apos;autre doit viser{" "}
                <strong className="text-foreground">≥ {PARAMS.retentionCible} %</strong>. Fidéliser coûte bien
                moins cher que recruter.
              </p>
            </div>
          </div>
        </Bloc>

        <div className="rounded-xl border border-dashed border-border bg-surface-2 px-5 py-4 text-sm text-muted">
          Cadre issu des plans de financement de l&apos;école (V2 — stratégie de collecte ; V3 — plan global).
          Objectif de collecte annuelle : <strong className="text-foreground">≥ {PARAMS.collecteCible.toLocaleString("fr-FR")} €</strong>.
        </div>
      </div>
    </div>
  );
}

function Bloc({ titre, numero, children }: { titre: string; numero: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs text-accent-fg">{numero}</span>
        {titre}
      </h2>
      <div className="text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Param({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{valeur}</div>
    </div>
  );
}
