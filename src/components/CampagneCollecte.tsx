"use client";

import { useMemo, useState } from "react";
import { formatEuros, formatDate } from "@/lib/format";
import { TONE_CLASSES } from "@/lib/statutDon";
import {
  planCampagne,
  relancesComplementaires,
  badgeTemperature,
  type CibleCampagne,
  type ProfilDonateur,
} from "@/lib/donateurs";
import { nomCliquableCls } from "@/lib/ui";

/** Mois/année d'une date ISO (AAAA-MM-JJ → MM/AAAA). */
function moisAnnee(iso: string): string {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}

/** Dernier jour du mois de `iso` (défaut d'échéance : « fin de ce mois »). */
function finDuMois(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const dernier = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(dernier).padStart(2, "0")}`;
}

/** Texte d'analyse d'une cible (infobulle « ? »). */
function analyseCible(c: CibleCampagne): string {
  const anciennete =
    c.moisDepuisDernier <= 0 ? "ce mois-ci" : `il y a ${c.moisDepuisDernier} mois`;
  const tempLabel = badgeTemperature(c.temperature).label.toLowerCase();
  return [
    `Profil : ${formatEuros(c.cumul)} donnés au total, sur ${c.nbAnnees} an${c.nbAnnees > 1 ? "s" : ""} (${c.nbDons} don${c.nbDons > 1 ? "s" : ""}).`,
    `Meilleure année : ${formatEuros(c.meilleureAnnee)}. Don habituel : ${formatEuros(Math.round(c.cumul / Math.max(1, c.nbDons)))}.`,
    `Dernier don ${anciennete} → relation « ${tempLabel} ».`,
    `Probabilité de redon : ${c.probaDetail}.`,
    `Montant à demander : ${formatEuros(c.demande)} (don habituel arrondi).`,
    `Collecte espérée = ${formatEuros(c.demande)} × ${Math.round(c.proba * 100)} % = ${formatEuros(c.espere)}.`,
  ].join("\n");
}

export default function CampagneCollecte({
  profils,
  today,
  onOuvrirFiche,
}: {
  profils: ProfilDonateur[];
  today: string;
  onOuvrirFiche?: (cle: string) => void;
}) {
  const [objectif, setObjectif] = useState(10000);
  const [echeance, setEcheance] = useState(finDuMois(today));
  const [delaiMin, setDelaiMin] = useState(6);
  const [toutVoir, setToutVoir] = useState(false);
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [demandes, setDemandes] = useState<Record<string, number>>({});

  const exclure = (cle: string) => setExclus((s) => new Set(s).add(cle));
  const reinclure = () => setExclus(new Set());
  const ajusterDemande = (cle: string, valeur: string) =>
    setDemandes((d) => {
      const next = { ...d };
      if (valeur.trim() === "") delete next[cle];
      else next[cle] = Math.max(0, Number(valeur.replace(",", ".")));
      return next;
    });

  const profilsRetenus = useMemo(() => profils.filter((p) => !exclus.has(p.cle)), [profils, exclus]);

  const plan = useMemo(
    () => planCampagne(profilsRetenus, objectif, { delaiMinMois: delaiMin, demandes }),
    [profilsRetenus, objectif, delaiMin, demandes],
  );
  const relances = useMemo(
    () => relancesComplementaires(profilsRetenus, { delaiMinMois: delaiMin }),
    [profilsRetenus, delaiMin],
  );

  const atteignable = plan.nbPourObjectif > 0;
  const cumulObjectif = atteignable
    ? plan.cibles[plan.nbPourObjectif - 1].cumulEspere
    : plan.totalEspere;
  const progression = Math.min(100, Math.round((cumulObjectif / objectif) * 100));

  // Par défaut on montre les cibles nécessaires + 5 de marge ; sinon tout.
  const limite = toutVoir ? plan.cibles.length : Math.max(plan.nbPourObjectif + 5, 8);
  const affichees = plan.cibles.slice(0, limite);

  // Liste du PDF : 15 donateurs max, pour tenir sur une seule page.
  const listePDF = (atteignable ? plan.cibles.filter((c) => c.dansObjectif) : plan.cibles).slice(0, 15);
  const totalDemandePDF = listePDF.reduce((s, c) => s + c.demande, 0);
  const totalEsperePDF = listePDF.reduce((s, c) => s + c.espere, 0);
  const restePDF = Math.max(0, objectif - totalEsperePDF);

  return (
    <section className="rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">🎯 Campagne collecte</h2>
          <p className="text-xs text-muted">
            Quels donateurs solliciter pour réunir un objectif avant une échéance.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="self-end rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
          >
            🖨 Exporter en PDF
          </button>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Objectif</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
              <input
                type="number"
                min={0}
                step={500}
                value={objectif}
                onChange={(e) => setObjectif(Math.max(0, Number(e.target.value)))}
                className="w-24 bg-transparent text-right text-sm font-medium tabular-nums outline-none"
              />
              <span className="text-sm text-muted">€</span>
            </div>
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Échéance</span>
            <input
              type="date"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Sans don depuis ≥</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={delaiMin}
                onChange={(e) => setDelaiMin(Math.max(0, Number(e.target.value)))}
                className="w-12 bg-transparent text-right text-sm font-medium tabular-nums outline-none"
              />
              <span className="text-sm text-muted">mois</span>
            </div>
          </label>
        </div>
      </div>

      {/* Verdict + progression */}
      <div className="rounded-lg border border-border bg-surface p-3">
        {atteignable ? (
          <p className="text-sm">
            En sollicitant les <strong>{plan.nbPourObjectif}</strong> premiers donateurs ci-dessous, la collecte
            espérée atteint <strong>{formatEuros(cumulObjectif)}</strong> — objectif de{" "}
            <strong>{formatEuros(objectif)}</strong> jouable d&apos;ici le {formatDate(echeance)}.
          </p>
        ) : (
          <p className="text-sm text-gold">
            L&apos;espérance totale sur les donateurs ciblés est de{" "}
            <strong>{formatEuros(plan.totalEspere)}</strong>, en-dessous de l&apos;objectif. Élargir la cible
            (réduire le délai), relever les montants, ou compléter par d&apos;autres axes que les dons.
          </p>
        )}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progression}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
          <span>Espérance cumulée {formatEuros(cumulObjectif)}</span>
          <span>{formatEuros(objectif)}</span>
        </div>
      </div>

      {exclus.size > 0 && (
        <div className="no-print mt-3 flex items-center gap-2 text-xs text-muted">
          <span>{exclus.size} donateur{exclus.size > 1 ? "s" : ""} exclu{exclus.size > 1 ? "s" : ""} de la campagne.</span>
          <button type="button" onClick={reinclure} className="text-accent hover:underline">
            Tout réintégrer
          </button>
        </div>
      )}
      {Object.keys(demandes).length > 0 && (
        <div className="no-print mt-2 flex items-center gap-2 text-xs text-muted">
          <span>{Object.keys(demandes).length} montant{Object.keys(demandes).length > 1 ? "s" : ""} ajusté{Object.keys(demandes).length > 1 ? "s" : ""} manuellement.</span>
          <button type="button" onClick={() => setDemandes({})} className="text-accent hover:underline">
            Réinitialiser les montants
          </button>
        </div>
      )}

      {/* Table des cibles */}
      {plan.cibles.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Aucun donateur ne correspond (seuil de sollicitation ou délai). Réduisez le délai « sans don depuis »
          ou importez davantage de dons.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Donateur</th>
                  <th className="px-3 py-2 font-medium">Relation</th>
                  <th className="px-3 py-2 text-right font-medium">Déjà donné</th>
                  <th className="px-3 py-2 font-medium">Dernier don</th>
                  <th className="px-3 py-2 text-right font-medium">Demander</th>
                  <th className="px-3 py-2 text-right font-medium">Proba</th>
                  <th className="px-3 py-2 text-right font-medium">Espérée</th>
                  <th className="px-3 py-2 text-right font-medium">Cumul esp.</th>
                  <th className="no-print px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {affichees.map((c, i) => {
                  const b = badgeTemperature(c.temperature);
                  return (
                    <tr
                      key={c.cle}
                      className={`border-b border-border last:border-0 ${c.dansObjectif ? "bg-accent-soft/20" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        {onOuvrirFiche ? (
                          <button
                            type="button"
                            onClick={() => onOuvrirFiche(c.cle)}
                            className={nomCliquableCls}
                          >
                            {c.nom}
                          </button>
                        ) : (
                          <div className="font-medium">{c.nom}</div>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[b.tone]}`}>
                            {b.label}
                          </span>
                          {c.estGrand && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES.violet}`}>
                              Grand
                            </span>
                          )}
                          {c.estFidele && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES.blue}`}>
                              Fidèle
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted">{c.origine ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-semibold tabular-nums">{formatEuros(c.cumul)}</div>
                        <div className="text-xs text-muted tabular-nums">
                          {c.nbDons} don{c.nbDons > 1 ? "s" : ""} · {c.nbAnnees} an{c.nbAnnees > 1 ? "s" : ""} · max {formatEuros(c.meilleureAnnee)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="tabular-nums">{formatDate(c.dernier)}</div>
                        <div className="text-xs text-muted">
                          {c.moisDepuisDernier === 0 ? "ce mois-ci" : `il y a ${c.moisDepuisDernier} mois`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={c.demande}
                          onChange={(e) => ajusterDemande(c.cle, e.target.value)}
                          aria-label={`Montant à demander à ${c.nom}`}
                          className={`w-20 rounded-md border px-1.5 py-0.5 text-right text-sm font-semibold tabular-nums outline-none focus:border-accent ${
                            demandes[c.cle] != null ? "border-accent bg-accent-soft/50 text-accent" : "border-border bg-surface"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{Math.round(c.proba * 100)} %</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEuros(c.espere)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{formatEuros(c.cumulEspere)}</td>
                      <td className="no-print px-2 py-2 text-center whitespace-nowrap">
                        <span
                          title={analyseCible(c)}
                          className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-border text-xs text-muted hover:border-accent hover:text-accent"
                          aria-label="Détail de l'analyse"
                        >
                          ?
                        </span>
                        <button
                          type="button"
                          onClick={() => exclure(c.cle)}
                          title="Exclure de la campagne"
                          aria-label="Exclure ce donateur"
                          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-negative/10 hover:text-negative"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {plan.cibles.length > affichees.length && !toutVoir && (
            <button
              type="button"
              onClick={() => setToutVoir(true)}
              className="no-print mt-2 text-sm text-accent hover:underline"
            >
              Voir les {plan.cibles.length - affichees.length} autres donateurs
            </button>
          )}
          <p className="no-print mt-3 text-xs text-muted">
            Survolez le « ? » de chaque ligne pour le détail du calcul. « Demander » = don habituel arrondi ;
            « proba » et « espérée » sont des repères de priorisation (récence &amp; fidélité), pas une promesse.
          </p>
        </>
      )}

      {/* Relances complémentaires : donateurs récents mais sous leur niveau habituel */}
      {relances.length > 0 && (
        <div className="no-print mt-5 rounded-lg border border-gold/40 bg-gold-soft/20 p-3">
          <h3 className="text-sm font-semibold">Relances complémentaires — à votre appréciation</h3>
          <p className="mt-0.5 text-xs text-muted">
            Ils ont donné <strong>récemment</strong> (donc exclus de la campagne ci-dessus), mais <strong>en-dessous
            de leur niveau habituel</strong> : leur proposer un complément fléché sur un projet précis peut être
            pertinent. Classés par probabilité — à vous de trancher.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium">Donateur</th>
                  <th className="px-3 py-2 text-right font-medium">Cette année</th>
                  <th className="px-3 py-2 text-right font-medium">Habituel</th>
                  <th className="px-3 py-2 text-right font-medium">Complément</th>
                  <th className="px-3 py-2 text-right font-medium">Proba</th>
                  <th className="px-3 py-2 font-medium">Argument</th>
                </tr>
              </thead>
              <tbody>
                {relances.map((r) => (
                  <tr key={r.cle} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2">
                      {onOuvrirFiche ? (
                        <button
                          type="button"
                          onClick={() => onOuvrirFiche(r.cle)}
                          className="text-left font-medium text-accent hover:underline"
                        >
                          {r.nom}
                        </button>
                      ) : (
                        <span className="font-medium">{r.nom}</span>
                      )}
                      <div className="text-xs text-muted">
                        il y a {r.moisDepuisDernier} mois
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{formatEuros(r.cumulAnnee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEuros(r.meilleureAnnee)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuros(r.complement)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{Math.round(r.proba * 100)} %</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.argument}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ————— Document imprimable (PDF 1 page) ————— */}
      <div id="campagne-pdf" className="print-only" style={{ color: "#14213d", fontFamily: "inherit", width: "94%", margin: "0 auto" }}>
        {/* En-tête généreux, centré */}
        <div style={{ textAlign: "center", paddingBottom: "11px", borderBottom: "2px solid #c8952f" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#c8952f", fontWeight: 600 }}>
            École du Saint-Enfant-Jésus · Reims
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#021d51", margin: "7px 0 0", letterSpacing: "0.3px" }}>
            Campagne de collecte
          </h1>
          <div style={{ fontSize: "10px", color: "#8a8377", marginTop: "4px" }}>Document interne · édité le {formatDate(today)}</div>
        </div>

        {/* Paramètres */}
        <div style={{ display: "flex", gap: "10px", margin: "11px 0 10px" }}>
          {[
            { l: "Objectif", v: formatEuros(objectif) },
            { l: "Échéance", v: formatDate(echeance) },
            { l: "Sans don depuis", v: `≥ ${delaiMin} mois` },
            { l: "À solliciter", v: String(listePDF.length) },
          ].map((c) => (
            <div key={c.l} style={{ flex: 1, textAlign: "center", border: "1px solid #cdd8ec", borderRadius: "12px", padding: "8px 6px", background: "#f4f7fc" }}>
              <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.4px", color: "#8a8377" }}>{c.l}</div>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#021d51", marginTop: "2px" }}>{c.v}</div>
            </div>
          ))}
        </div>

        {/* Synthèse */}
        <p style={{ margin: "0 0 11px", fontSize: "12px", color: "#3a4256", textAlign: "center" }}>
          {restePDF <= 0 ? (
            <>
              En sollicitant ces <strong style={{ color: "#021d51" }}>{listePDF.length}</strong> donateurs, la collecte
              espérée est de <strong style={{ color: "#021d51" }}>{formatEuros(totalEsperePDF)}</strong> — objectif de{" "}
              <strong style={{ color: "#021d51" }}>{formatEuros(objectif)}</strong> couvert d&apos;ici le{" "}
              <strong>{formatDate(echeance)}</strong>.
            </>
          ) : (
            <>
              En sollicitant ces <strong style={{ color: "#021d51" }}>{listePDF.length}</strong> donateurs, on espère{" "}
              <strong style={{ color: "#021d51" }}>{formatEuros(totalEsperePDF)}</strong> d&apos;ici le {formatDate(echeance)}.
              Pour l&apos;objectif de <strong style={{ color: "#021d51" }}>{formatEuros(objectif)}</strong>, il reste{" "}
              <strong style={{ color: "#c8952f" }}>{formatEuros(restePDF)}</strong> à trouver.
            </>
          )}
        </p>

        {/* Légende des pastilles (température de la relation) */}
        <div style={{ display: "flex", justifyContent: "center", gap: "18px", marginBottom: "11px", fontSize: "9.5px", color: "#5b6472" }}>
          {[
            { c: "#15803d", l: "Chaud · ≤ 6 mois" },
            { c: "#e08a2b", l: "Tiède · 6-18 mois" },
            { c: "#34618e", l: "Froid · > 18 mois" },
          ].map((t) => (
            <span key={t.l} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: t.c }} />
              {t.l}
            </span>
          ))}
        </div>
        <p style={{ margin: "-3px 0 11px", fontSize: "8.5px", fontStyle: "italic", color: "#7683a0", textAlign: "center" }}>
          « % de oui » = probabilité estimée de redon, d&apos;après la récence du dernier don et la fidélité — repère indicatif.
        </p>

        {/* Lignes individualisées (une par donateur) */}
        <div>
          {listePDF.map((c) => {
            const tc = c.temperature === "chaud" ? "#15803d" : c.temperature === "tiede" ? "#e08a2b" : "#34618e";
            return (
              <div
                key={c.cle}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: "4px 18px", background: "#f4f7fc", border: "1px solid #cdd8ec", borderRadius: "20px", marginBottom: "9px" }}
              >
                <span title={badgeTemperature(c.temperature).label} style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: tc }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f1b33" }}>{c.nom}</div>
                  <div style={{ fontSize: "8.5px", color: "#4a5568", marginTop: "1px" }}>
                    {formatEuros(c.cumul)} donnés · {c.nbDons} don{c.nbDons > 1 ? "s" : ""} / {c.nbAnnees} an
                    {c.nbAnnees > 1 ? "s" : ""} · dernier {moisAnnee(c.dernier)} ({c.moisDepuisDernier}m.)
                  </div>
                </div>
                <div style={{ flex: "none", width: "104px" }}>
                  <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.3px", color: "#7683a0" }}>Relation</div>
                  <div style={{ fontSize: "10.5px", fontWeight: 500, color: "#1e2a3d" }}>{c.origine ?? "—"}</div>
                </div>
                <div style={{ flex: "none", textAlign: "right", width: "88px" }}>
                  <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.3px", color: "#7683a0" }}>À demander</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#021d51", lineHeight: 1 }}>{formatEuros(c.demande)}</div>
                </div>
                <div style={{ flex: "none", textAlign: "right", width: "68px" }}>
                  <div style={{ fontSize: "8.5px", color: "#4a5568" }}>{Math.round(c.proba * 100)}% de oui</div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#15803d" }}>{formatEuros(c.espere)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bandeau total */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "18px", padding: "10px 18px", borderRadius: "16px", background: "#021d51", color: "#ffffff" }}>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>Total · {listePDF.length} donateurs à solliciter</div>
          <div style={{ fontSize: "12px" }}>
            <span style={{ opacity: 0.8 }}>À demander</span> <strong>{formatEuros(totalDemandePDF)}</strong>
            &nbsp;·&nbsp; <span style={{ opacity: 0.8 }}>espérance</span>{" "}
            <strong style={{ color: "#a9e4bf" }}>{formatEuros(totalEsperePDF)}</strong>
          </div>
        </div>

        {/* Note */}
        <p style={{ marginTop: "10px", fontSize: "9px", color: "#8a8377", lineHeight: 1.5, textAlign: "center" }}>
          « À demander » = don habituel du donateur, arrondi. La probabilité et l&apos;espérance sont des repères
          indicatifs (récence &amp; fidélité), pas un engagement. Données confidentielles.
        </p>
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          @page { size: A4; margin: 14mm; }
          html, body { background: #ffffff !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Ne garder que le document PDF : masquer tout ce qui ne le contient pas
             (display:none, pas visibility → aucune page blanche résiduelle). */
          body *:not(:has(#campagne-pdf)):not(#campagne-pdf):not(#campagne-pdf *) { display: none !important; }
          /* Neutraliser la boîte des conteneurs autour du document (padding/bordure/fond). */
          body :has(#campagne-pdf) { margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; box-shadow: none !important; max-width: none !important; }
          #campagne-pdf { display: block !important; }
        }
      `}</style>
    </section>
  );
}
