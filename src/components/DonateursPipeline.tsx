"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import { TONE_CLASSES, cleDonateur } from "@/lib/statutDon";
import {
  agregerDonateurs,
  badgesDe,
  suggestionsDonateurs,
  picCourant,
  type DonAgg,
  type ProfilDonateur,
} from "@/lib/donateurs";
import CampagneCollecte from "@/components/CampagneCollecte";
import FicheDonateur from "@/components/FicheDonateur";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { PARAMS } from "@/lib/segments";
import { nomCliquableCls } from "@/lib/ui";
import type { Don } from "@/components/GestionDons";

type SegFiltre = "tous" | "grand" | "actif" | "sommeil" | "perdu" | "nouveau" | "fidele";

const FILTRES: { key: SegFiltre; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "grand", label: "Grands donateurs" },
  { key: "actif", label: "Actifs" },
  { key: "sommeil", label: "En sommeil" },
  { key: "perdu", label: "Perdus" },
  { key: "nouveau", label: "Nouveaux" },
  { key: "fidele", label: "Fidèles" },
];

const correspond = (p: ProfilDonateur, f: SegFiltre) =>
  f === "tous" ||
  (f === "grand" && p.estGrand) ||
  (f === "actif" && p.etat === "actif") ||
  (f === "sommeil" && p.etat === "sommeil") ||
  (f === "perdu" && p.etat === "perdu") ||
  (f === "nouveau" && p.estNouveau) ||
  (f === "fidele" && p.estFidele);

export default function DonateursPipeline({ donsInit }: { donsInit: Don[] }) {
  const coffre = useCoffre();
  const { dons, verrou } = useDonsDechiffres(donsInit);
  const today = todayISO();
  const [filtre, setFiltre] = useState<SegFiltre>("tous");
  const [ficheCle, setFicheCle] = useState<string | null>(null);

  const profils = useMemo(
    () => agregerDonateurs(dons as unknown as DonAgg[], today),
    [dons, today],
  );
  const profilParCle = useMemo(() => new Map(profils.map((p) => [p.cle, p])), [profils]);
  const donsParCle = useMemo(() => {
    const m = new Map<string, Don[]>();
    for (const d of dons) {
      const cle = cleDonateur(d);
      if (!cle) continue;
      const liste = m.get(cle) ?? m.set(cle, []).get(cle)!;
      liste.push(d);
    }
    return m;
  }, [dons]);
  const suggestions = useMemo(() => suggestionsDonateurs(profils, today), [profils, today]);
  const pic = picCourant(today);

  const stats = useMemo(() => {
    const grands = profils.filter((p) => p.estGrand).length;
    const actifs = profils.filter((p) => p.etat === "actif").length;
    const sommeil = profils.filter((p) => p.etat === "sommeil").length;
    const perdus = profils.filter((p) => p.etat === "perdu").length;
    const collecte12 = dons
      .filter((d) => d.date_don && d.date_don >= reculMois(today, 12))
      .reduce((s, d) => s + Number(d.montant || 0), 0);
    return { total: profils.length, grands, actifs, sommeil, perdus, collecte12 };
  }, [profils, dons, today]);

  const affiches = profils.filter((p) => correspond(p, filtre));

  if (verrou) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-6 text-center text-sm">
        <p className="text-gold">🔒 Coffre verrouillé — les donateurs ne peuvent pas être qualifiés.</p>
        <div className="mt-3 flex justify-center">
          <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
        </div>
      </div>
    );
  }

  if (!coffre.estConfigure && donsInit.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center text-sm text-muted">
        Aucun don pour l&apos;instant. <Link href="/dons/import" className="text-accent hover:underline">Importez vos dons</Link> pour voir les profils se remplir ici.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tuile label="Donateurs" valeur={String(stats.total)} />
        <Tuile label="Grands donateurs" valeur={String(stats.grands)} accent="violet" />
        <Tuile label="Actifs" valeur={String(stats.actifs)} accent="positive" />
        <Tuile label="En sommeil" valeur={String(stats.sommeil)} accent="gold" />
        <Tuile label="Collecte 12 mois" valeur={formatEuros(stats.collecte12)} />
      </div>

      {/* Légende des états (règles de segmentation) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
        <span className="font-medium text-foreground">Légende</span>
        <span><span className={`mr-1 inline-block rounded-full px-1.5 py-0.5 font-medium ${TONE_CLASSES.green}`}>Actif</span>dernier don &lt; {PARAMS.sommeilMois} mois</span>
        <span><span className={`mr-1 inline-block rounded-full px-1.5 py-0.5 font-medium ${TONE_CLASSES.amber}`}>En sommeil</span>{PARAMS.sommeilMois}–{PARAMS.perduMois} mois sans don</span>
        <span><span className={`mr-1 inline-block rounded-full px-1.5 py-0.5 font-medium ${TONE_CLASSES.red}`}>Perdu</span>&gt; {PARAMS.perduMois} mois sans don</span>
        <span><span className={`mr-1 inline-block rounded-full px-1.5 py-0.5 font-medium ${TONE_CLASSES.violet}`}>Grand donateur</span>≥ {PARAMS.seuilGrandDonateur.toLocaleString("fr-FR")} €/an</span>
      </div>

      {/* Campagne « objectif » — trouver X € avant une échéance */}
      <CampagneCollecte profils={profils} today={today} onOuvrirFiche={setFicheCle} />

      {/* Prochaines actions suggérées */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Prochaines actions suggérées</h2>
          {pic && <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs text-gold">Période favorable : {pic}</span>}
        </div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted">Aucune action prioritaire pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.slice(0, 8).map((s) => (
              <li key={s.cle} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
                <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[s.tone]}`}>
                  {s.action}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{s.nom}</div>
                  <div className="text-xs text-muted">{s.motif}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Filtres segment */}
      <div className="flex flex-wrap gap-1.5">
        {FILTRES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltre(f.key)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              filtre === f.key ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table des donateurs qualifiés */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 font-medium">Qualification</th>
              <th className="px-4 py-3 text-right font-medium">Cumul</th>
              <th className="px-4 py-3 text-right font-medium">Cette année</th>
              <th className="px-4 py-3 text-right font-medium">Dons</th>
              <th className="px-4 py-3 font-medium">Dernier don</th>
            </tr>
          </thead>
          <tbody>
            {affiches.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Aucun donateur pour ce filtre.</td></tr>
            ) : (
              affiches.map((p) => (
                <tr key={p.cle} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setFicheCle(p.cle)} className={nomCliquableCls}>
                      {p.nom}
                    </button>
                    {p.courriel && <div className="text-xs text-muted">{p.courriel}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {badgesDe(p).map((b) => (
                        <span key={b.key} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[b.tone]}`}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{formatEuros(p.cumul)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{p.cumulAnnee ? formatEuros(p.cumulAnnee) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.nbDons}</td>
                  <td className="px-4 py-3">
                    <div className="tabular-nums">{formatDate(p.dernier)}</div>
                    <div className="text-xs text-muted">
                      {p.moisDepuisDernier === 0 ? "ce mois-ci" : `il y a ${p.moisDepuisDernier} mois`}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {ficheCle && profilParCle.get(ficheCle) && (
        <FicheDonateur
          profil={profilParCle.get(ficheCle)!}
          dons={donsParCle.get(ficheCle) ?? []}
          onClose={() => setFicheCle(null)}
        />
      )}
    </div>
  );
}

function reculMois(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 - n, d);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "positive" | "gold" | "violet" }) {
  const col =
    accent === "positive" ? "text-positive" : accent === "gold" ? "text-gold" : accent === "violet" ? "text-violet-600 dark:text-violet-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}
