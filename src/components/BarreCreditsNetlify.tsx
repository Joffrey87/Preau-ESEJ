"use client";

import { useEffect, useState } from "react";

type Etat =
  | { kind: "chargement" }
  | { kind: "non_configure"; message: string }
  | { kind: "erreur"; message: string }
  | {
      kind: "ok";
      pct: number;
      deploiements_mois: number;
      credits_utilises: number;
      credits_restants: number;
      credits_total: number;
    };

function fmtCredits(n: number) {
  // Un décimal si besoin (ex. 1090.5), sinon entier.
  return Number.isInteger(n) ? String(n) : n.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

/** Barre sous celle des coûts Claude : % consommé (plan + packs) + nb de déploiements du mois. */
export default function BarreCreditsNetlify() {
  const [etat, setEtat] = useState<Etat>({ kind: "chargement" });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const rep = await fetch("/api/netlify-credits", { cache: "no-store" });
        const j = (await rep.json()) as {
          configure?: boolean;
          message?: string;
          erreur?: string;
          pct?: number;
          deploiements_mois?: number;
          credits_utilises?: number;
          credits_restants?: number;
          credits_total?: number;
        };
        if (annule) return;
        if (!rep.ok) {
          setEtat({ kind: "erreur", message: j.erreur ?? `Erreur ${rep.status}` });
          return;
        }
        if (j.configure === false) {
          setEtat({ kind: "non_configure", message: j.message ?? "Jeton Netlify absent." });
          return;
        }
        setEtat({
          kind: "ok",
          pct: Number(j.pct) || 0,
          deploiements_mois: Number(j.deploiements_mois) || 0,
          credits_utilises: Number(j.credits_utilises) || 0,
          credits_restants: Number(j.credits_restants) || 0,
          credits_total: Number(j.credits_total) || 0,
        });
      } catch (e) {
        if (!annule) setEtat({ kind: "erreur", message: e instanceof Error ? e.message : "Échec réseau" });
      }
    })();
    return () => {
      annule = true;
    };
  }, []);

  if (etat.kind === "chargement") {
    return <p className="text-[11px] text-muted">Crédits Netlify…</p>;
  }
  if (etat.kind === "non_configure") {
    return (
      <p className="text-[11px] text-muted" title={etat.message}>
        Crédits Netlify : jeton non configuré (NETLIFY_AUTH_TOKEN).
      </p>
    );
  }
  if (etat.kind === "erreur") {
    return <p className="text-[11px] text-negative">Crédits Netlify indisponibles : {etat.message}</p>;
  }

  const pctAffiche = Math.min(100, Math.max(0, etat.pct));
  const ton = etat.pct >= 75 ? "bg-negative" : etat.pct >= 50 ? "bg-gold" : "bg-positive";
  const deploiements = etat.deploiements_mois;
  const libDeploy = deploiements <= 1 ? `${deploiements} déploiement` : `${deploiements} déploiements`;
  const titre = `${fmtCredits(etat.credits_restants)} restants / ${fmtCredits(etat.credits_total)} (plan + packs) · ${fmtCredits(etat.credits_utilises)} utilisés`;

  return (
    <div className="min-w-[14rem] flex-1">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[11px] text-muted">
        <span>Crédits Netlify</span>
        <span className="tabular-nums">
          {Math.round(etat.pct)}&nbsp;% · {libDeploy} ce mois
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pctAffiche)}
        aria-label={`Crédits Netlify : ${Math.round(etat.pct)} pour cent utilisés, ${fmtCredits(etat.credits_restants)} restants sur ${fmtCredits(etat.credits_total)}, ${libDeploy} ce mois`}
        title={titre}
      >
        <div className={`h-full rounded-full ${ton}`} style={{ width: `${pctAffiche}%` }} />
      </div>
    </div>
  );
}
