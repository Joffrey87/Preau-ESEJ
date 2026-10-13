"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { basculerVers, memoriserSession, type Espace } from "@/lib/basculeEspace";

/** Espaces reliés d'une famille : son Espace famille, la Recherche de fonds (prénom du membre), le profil Directrice ou Président. */
export type LiensEspace = {
  famille: string;
  prenom: string | null;
  directrice: boolean;
  president?: boolean;
  /** Membre Événement relié à la famille : son compte Événement (adresse interne) et son libellé. */
  evenement?: { libelle: string; email: string } | null;
  /** Famille réservée à la bascule : son espace s'ouvre sans changer de compte ni mot de passe. */
  familleLiee?: boolean;
  /** Depuis l'espace de la famille reliée : retour direct à l'espace du compte (même session). */
  retourLiee?: Partial<Record<Espace, string>>;
};

/**
 * Choix entre les espaces d'une famille qui a plusieurs profils (Espace famille, Recherche de fonds, Directrice).
 * Après une première connexion à chacun sur cet appareil, le passage de l'un à l'autre est direct.
 */
export function PanneauBascule({ actuel, liens }: { actuel: Espace; liens: LiensEspace }) {
  const { famille, prenom } = liens;
  const [busy, setBusy] = useState<Espace | null>(null);

  // La session de l'espace en cours est gardée dès l'ouverture du choix (elle sert au retour).
  useEffect(() => {
    void memoriserSession(actuel);
  }, [actuel]);

  const options: { espace: Espace; titre: string; detail: string; icone: string }[] = [
    { espace: "famille", titre: "Espace famille", detail: `Famille ${famille}`, icone: "maison" },
    ...(prenom ? [{ espace: "recherche" as Espace, titre: "Recherche de fonds", detail: prenom, icone: "users" }] : []),
    ...(liens.directrice ? [{ espace: "directrice" as Espace, titre: "Directrice", detail: "Bulletins", icone: "graduation" }] : []),
    ...(liens.president ? [{ espace: "president" as Espace, titre: "Président", detail: "Administration de l'ARIL", icone: "ledger" }] : []),
    ...(liens.evenement ? [{ espace: "evenement" as Espace, titre: "Événement", detail: liens.evenement.libelle, icone: "calendar" }] : []),
  ];
  return (
    <div className="grid gap-1.5">
      {options.map((o) => {
        const actif = o.espace === actuel;
        return (
          <button
            key={o.espace}
            type="button"
            disabled={actif || busy !== null}
            onClick={async () => {
              setBusy(o.espace);
              const direct = liens.retourLiee?.[o.espace] ?? (o.espace === "famille" && liens.familleLiee ? "/famille-liee/entrer" : null);
              if (direct) return window.location.assign(direct);
              await basculerVers(o.espace, actuel, { prenom, famille, evenement: liens.evenement?.email ?? null });
            }}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] leading-tight transition-colors ${
              actif ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2 disabled:opacity-60"
            }`}
          >
            <Icon name={o.icone} className="h-5 w-5 shrink-0" />
            <span className="min-w-0">
              <span className="block">{o.titre}</span>
              <span className="block text-[11px] font-normal text-muted">
                {busy === o.espace ? "Ouverture…" : actif ? `${o.detail} · espace actuel` : o.detail}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
