"use client";

import { useEffect, useState } from "react";

type Etat =
  | { kind: "chargement" }
  | { kind: "non_configure"; message: string }
  | { kind: "erreur"; message: string }
  | { kind: "ok"; pct: number; deploiements_mois: number; credits_utilises: number };

/** Barre sous celle des coûts Claude : % du quota Netlify mensuel + nb de déploiements du mois. */
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
        aria-label={`Crédits Netlify : ${Math.round(etat.pct)} pour cent, ${libDeploy} ce mois`}
        title={`${etat.credits_utilises} / 1000 crédits (quota mensuel, hors packs)`}
      >
        <div className={`h-full rounded-full ${ton}`} style={{ width: `${pctAffiche}%` }} />
      </div>
    </div>
  );
}
