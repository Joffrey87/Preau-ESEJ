"use client";

import { useState } from "react";
import { Modal } from "./GestionComptes";
import { PROFILS_BUREAU, PROFILS_RECHERCHE_FONDS } from "@/lib/profilsContact";
import type { ProfilDonateur } from "@/lib/donateurs";

/**
 * Liste des profils auxquels le contact d'un donateur peut être réservé (Recherche de fonds, puis bureau), avec le
 * nombre de donateurs réservés à chacun ; un clic sur un profil ouvre la liste de ses donateurs.
 */
export default function ListeProfilsContact({ profils, onOuvrirFiche }: { profils: ProfilDonateur[]; onOuvrirFiche: (cle: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);
  const reserves = (nom: string) => profils.filter((p) => p.contactReserveA === nom);

  const groupe = (titre: string, noms: string[]) => (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{titre}</h3>
      <ul className="overflow-hidden rounded-lg border border-border">
        {noms.map((n) => {
          const nb = reserves(n).length;
          return (
            <li key={n} className="border-b border-border last:border-0">
              <button
                type="button"
                onClick={() => setChoisi(choisi === n ? null : n)}
                aria-expanded={choisi === n}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className={choisi === n ? "font-medium text-accent" : ""}>{n}</span>
                <span className="text-xs tabular-nums text-muted">
                  {nb} donateur{nb > 1 ? "s" : ""} réservé{nb > 1 ? "s" : ""}
                </span>
              </button>
              {choisi === n && nb > 0 && (
                <ul className="border-t border-border bg-surface-2/50 px-3 py-1.5">
                  {reserves(n).map((p) => (
                    <li key={p.cle}>
                      <button
                        type="button"
                        onClick={() => {
                          setOuvert(false);
                          onOuvrirFiche(p.cle);
                        }}
                        className="py-0.5 text-sm text-accent hover:underline"
                      >
                        {p.nom}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        title="Profils de la Recherche de fonds et du bureau, avec les donateurs dont le contact leur est réservé"
      >
        Profils
      </button>
      {ouvert && (
        <Modal title="Profils" onClose={() => setOuvert(false)} fermerAuClicExterieur>
          <div className="space-y-4">
            {groupe("Recherche de fonds", PROFILS_RECHERCHE_FONDS)}
            {groupe("Bureau", PROFILS_BUREAU)}
            <p className="text-xs text-muted">Le contact d&apos;un donateur se réserve depuis sa fiche (« Contact réservé à »).</p>
          </div>
        </Modal>
      )}
    </>
  );
}
