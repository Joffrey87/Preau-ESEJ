"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/roles";

// Paramètres (Webmestre seulement) : crédit Claude consommé par les lectures automatiques de Préau.
// Les données viennent de la fonction claude_conso_stats (refusée en base à tout autre compte).

type Somme = { nb: number; echecs: number; usd: number; eur: number };
type ParType = { type: string; nb: number; usd: number; eur: number };
type Profil = Somme & { profil: string; user_id: string | null; nom: string | null; usd_mois: number; usd_annee: number; par_type: ParType[] | null };
type Stats = {
  seuil_usd: number;
  debut_annee: string;
  depuis: string | null;
  mois: Somme;
  annee: Somme;
  total: Somme;
  par_mois: (Somme & { mois: string })[];
  par_profil: Profil[];
  par_type: ParType[];
  taux_jour: { jour: string; taux: number; date_bce: string | null } | null;
  taux_estimes: number;
  tarifs: { modele: string; entree_mtok: number; sortie_mtok: number; cache_ecriture_mtok: number; cache_lecture_mtok: number; source: string | null }[];
};

const TYPES: Record<string, string> = {
  facture: "Factures",
  rib: "RIB",
  facture_rib: "Facture + RIB",
  cheques: "Chèques",
  caisse: "Caisses",
  ventes: "Ventes diverses",
  autre: "Autre",
};
const LIBELLES_PROFIL: Record<string, string> = { evenement: "Événementiel", famille: "Famille", professeur: "Professeur", lecteur: "Autre compte" };
const libelleProfil = (p: Profil) =>
  [ROLES.find((r) => r.slug === p.profil)?.label ?? LIBELLES_PROFIL[p.profil] ?? p.profil, p.nom].filter(Boolean).join(" · ");

const nb = (n: number) => Number(n ?? 0);
/** Petits montants : jusqu'à 4 décimales (une lecture coûte quelques centimes). */
function montant(v: number, devise: "$" | "€") {
  const n = nb(v);
  const petit = n !== 0 && Math.abs(n) < 1;
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: petit ? 4 : 2 })} ${devise}`;
}
const moisLabel = (m: string) => {
  const s = new Date(`${m}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const lectures = (s: Somme) => `${nb(s.nb)}${nb(s.echecs) ? ` (dont ${nb(s.echecs)} en échec)` : ""}`;

const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted";
const td = "px-3 py-2 tabular-nums";
const input = "w-28 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent";

export default function ConsoClaude() {
  const [s, setS] = useState<Stats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [seuil, setSeuil] = useState("");
  const [etat, setEtat] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<Record<string, boolean>>({});

  const charger = useCallback(async () => {
    const { data, error } = await createClient().rpc("claude_conso_stats");
    if (error) return setErreur(error.message);
    const st = data as Stats;
    setS(st);
    setSeuil(String(nb(st.seuil_usd)).replace(".", ","));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial depuis la base
    void charger();
  }, [charger]);

  async function enregistrerSeuil(e: React.FormEvent) {
    e.preventDefault();
    setEtat(null);
    const v = Number(seuil.replace(/\s/g, "").replace(",", "."));
    if (!isFinite(v) || v < 0) return setEtat("Erreur : seuil invalide.");
    const { error } = await createClient().rpc("claude_conso_seuil_definir", { p_seuil: v });
    setEtat(error ? "Erreur : " + error.message : "Enregistré.");
    if (!error) void charger();
  }

  const anneeScolaire = s ? `${s.debut_annee.slice(0, 4)}-${Number(s.debut_annee.slice(0, 4)) + 1}` : "";
  const depasse = !!s && nb(s.mois.usd) > nb(s.seuil_usd);

  return (
    <section id="conso-claude" className="scroll-mt-6">
      <h2 className="mb-1 text-lg font-semibold">Crédit Claude consommé</h2>
      <p className="mb-3 text-sm text-muted">
        Coût des lectures automatiques (factures, RIB, chèques, caisses, ventes) facturées par l&apos;API Claude, en dollars
        (monnaie de facturation) et en euros au taux BCE du jour de chaque lecture. Visible du Webmestre seulement.
      </p>

      {erreur && <p className="rounded-lg border border-negative/40 bg-negative/5 px-3 py-2 text-sm text-negative">Statistiques indisponibles : {erreur}</p>}
      {!s && !erreur && <p className="text-sm text-muted">Chargement…</p>}

      {s && (
        <div className="space-y-4">
          {depasse && (
            <div role="alert" className="rounded-xl border border-negative/50 bg-negative/10 px-4 py-3 text-sm">
              <span className="font-semibold text-negative">Seuil mensuel dépassé : </span>
              {montant(s.mois.usd, "$")} consommés ce mois-ci pour un seuil de {montant(s.seuil_usd, "$")}.
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Période</th>
                  <th className={th}>Lectures</th>
                  <th className={`${th} text-right`}>Coût $</th>
                  <th className={`${th} text-right`}>Coût €</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(
                  [
                    ["Ce mois-ci", s.mois],
                    [`Année scolaire ${anneeScolaire}`, s.annee],
                    ["Total", s.total],
                  ] as [string, Somme][]
                ).map(([l, v]) => (
                  <tr key={l} className={l === "Total" ? "font-semibold" : ""}>
                    <td className="px-3 py-2">{l}</td>
                    <td className={td}>{lectures(v)}</td>
                    <td className={`${td} text-right`}>{montant(v.usd, "$")}</td>
                    <td className={`${td} text-right`}>{montant(v.eur, "€")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.par_mois.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Par mois</h3>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>Mois</th>
                      <th className={th}>Lectures</th>
                      <th className={`${th} text-right`}>Coût $</th>
                      <th className={`${th} text-right`}>Coût €</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {s.par_mois.map((m) => (
                      <tr key={m.mois}>
                        <td className="px-3 py-2">{moisLabel(m.mois)}</td>
                        <td className={td}>{lectures(m)}</td>
                        <td className={`${td} text-right ${nb(m.usd) > nb(s.seuil_usd) ? "font-semibold text-negative" : ""}`}>{montant(m.usd, "$")}</td>
                        <td className={`${td} text-right`}>{montant(m.eur, "€")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {s.par_profil.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Par profil et type de document</h3>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={th}>Profil</th>
                      <th className={th}>Lectures</th>
                      <th className={`${th} text-right`}>Ce mois-ci</th>
                      <th className={`${th} text-right`}>Année scolaire</th>
                      <th className={`${th} text-right`}>Total $</th>
                      <th className={`${th} text-right`}>Total €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.par_profil.map((p) => {
                      const cle = `${p.profil}|${p.user_id ?? ""}`;
                      const types = p.par_type ?? [];
                      return [
                        <tr key={cle} className="border-t border-border">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setOuvert((o) => ({ ...o, [cle]: !o[cle] }))}
                              className="flex items-center gap-1.5 text-left font-medium hover:text-accent"
                              aria-expanded={!!ouvert[cle]}
                            >
                              <span className="inline-block w-3 text-muted">{ouvert[cle] ? "▾" : "▸"}</span>
                              {libelleProfil(p)}
                            </button>
                          </td>
                          <td className={td}>{lectures(p)}</td>
                          <td className={`${td} text-right`}>{montant(p.usd_mois, "$")}</td>
                          <td className={`${td} text-right`}>{montant(p.usd_annee, "$")}</td>
                          <td className={`${td} text-right font-medium`}>{montant(p.usd, "$")}</td>
                          <td className={`${td} text-right`}>{montant(p.eur, "€")}</td>
                        </tr>,
                        ...(ouvert[cle]
                          ? types.map((t) => (
                              <tr key={`${cle}|${t.type}`} className="text-muted">
                                <td className="py-1.5 pl-10 pr-3">{TYPES[t.type] ?? t.type}</td>
                                <td className="px-3 py-1.5 tabular-nums">{nb(t.nb)}</td>
                                <td />
                                <td />
                                <td className="px-3 py-1.5 text-right tabular-nums">{montant(t.usd, "$")}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{montant(t.eur, "€")}</td>
                              </tr>
                            ))
                          : []),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              {s.par_type.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Tous profils :{" "}
                  {s.par_type.map((t) => `${TYPES[t.type] ?? t.type} ${montant(t.usd, "$")} (${nb(t.nb)})`).join(" · ")}
                </p>
              )}
            </div>
          )}

          <form onSubmit={enregistrerSeuil} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-muted">Seuil d&apos;alerte mensuel ($)</span>
              <input value={seuil} onChange={(e) => setSeuil(e.target.value)} inputMode="decimal" className={input} />
            </label>
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90">
              Enregistrer
            </button>
            {etat && <span className={`text-sm ${etat.startsWith("Erreur") ? "text-negative" : "text-positive"}`}>{etat}</span>}
            <span className="basis-full text-xs text-muted">Au-delà, une alerte s&apos;affiche ici et sur votre Tableau de bord.</span>
          </form>

          <p className="text-xs text-muted">
            Suivi commencé {s.depuis ? `le ${new Date(s.depuis).toLocaleDateString("fr-FR")}` : "à la mise en ligne de ce tableau"} : les lectures
            antérieures n&apos;ont pas été enregistrées.
            {s.tarifs.map((t) => (
              <span key={t.modele}>
                {" "}
                Tarif {t.modele} : {nb(t.entree_mtok)} $ / million de jetons en entrée, {nb(t.sortie_mtok)} $ en sortie (réflexion comprise), cache{" "}
                {nb(t.cache_ecriture_mtok)} $ en écriture et {nb(t.cache_lecture_mtok)} $ en lecture{t.source ? ` (${t.source})` : ""}.
              </span>
            ))}
            {s.taux_jour && (
              <span>
                {" "}
                Dernier taux archivé : 1 $ = {nb(s.taux_jour.taux).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} € (
                {new Date(`${s.taux_jour.jour}T12:00:00`).toLocaleDateString("fr-FR")}, BCE).
              </span>
            )}
            {nb(s.taux_estimes) > 0 && (
              <span className="text-gold">
                {" "}
                {nb(s.taux_estimes)} lecture{nb(s.taux_estimes) > 1 ? "s" : ""} convertie{nb(s.taux_estimes) > 1 ? "s" : ""} au dernier taux connu (taux du jour
                indisponible).
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
