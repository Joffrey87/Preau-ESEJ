"use client";

import { useMemo, useState } from "react";
import { Modal } from "./GestionComptes";
import type { Don } from "@/components/GestionDons";
import type { EtatDonateur, ProfilDonateur } from "@/lib/donateurs";
import { aucunCritere, construireExport, selectionnerExport, telechargerExport, type CriteresExport } from "@/lib/exportRelations";

function CaseExport({ label, coche, onChange, aide }: { label: string; coche: boolean; onChange: () => void; aide?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 hover:bg-surface-2">
      <input type="checkbox" checked={coche} onChange={onChange} className="mt-0.5 h-4 w-4" />
      <span>
        {label}
        {aide && <span className="block text-xs text-muted">{aide}</span>}
      </span>
    </label>
  );
}

/**
 * Bouton « Exporter » de Relations donateurs : choix des donateurs (aucune case cochée au départ), puis fichier Excel
 * prêt pour un publipostage — une ligne par foyer, coordonnées et dernier don.
 */
export default function ExportRelations({
  profils,
  donsParCle,
  aujourdhui,
}: {
  /** Tous les profils, « Donateurs Bourse » compris (exclus tant que l'option n'est pas cochée). */
  profils: ProfilDonateur[];
  donsParCle: Map<string, Don[]>;
  aujourdhui: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [criteres, setCriteres] = useState<CriteresExport>({ etats: [], grands: false, fideles: false, inclureBourse: false });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bascule = (e: EtatDonateur) =>
    setCriteres((c) => ({ ...c, etats: c.etats.includes(e) ? c.etats.filter((x) => x !== e) : [...c.etats, e] }));

  const { fichier, exclus, total } = useMemo(() => {
    const { retenus, exclus } = selectionnerExport(profils, donsParCle, criteres);
    const fichier = construireExport(retenus, donsParCle);
    return { fichier, exclus, total: retenus.length };
  }, [profils, donsParCle, criteres]);

  const nbExclus = exclus.nePasSolliciter + exclus.famille + exclus.asa + exclus.bourse;

  async function exporter() {
    setBusy(true);
    setMessage(null);
    try {
      const nom = await telechargerExport(fichier, aujourdhui);
      setMessage(`Fichier « ${nom} » téléchargé.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export impossible.");
    }
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setOuvert(true);
        }}
        className="rounded-full border border-border px-3 py-1 text-sm text-muted hover:bg-surface-2"
        title="Exporter une sélection de donateurs au format Excel (publipostage)"
      >
        Exporter
      </button>
      {ouvert && (
        <Modal title="Exporter les donateurs (Excel)" onClose={() => setOuvert(false)} fermerAuClicExterieur>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Quels donateurs ?</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <CaseExport label="Actifs" coche={criteres.etats.includes("actif")} onChange={() => bascule("actif")} />
                <CaseExport label="En sommeil" coche={criteres.etats.includes("sommeil")} onChange={() => bascule("sommeil")} />
                <CaseExport label="Perdus" coche={criteres.etats.includes("perdu")} onChange={() => bascule("perdu")} />
                <CaseExport label="Grands donateurs" coche={criteres.grands} onChange={() => setCriteres((c) => ({ ...c, grands: !c.grands }))} />
                <CaseExport label="Fidèles" coche={criteres.fideles} onChange={() => setCriteres((c) => ({ ...c, fideles: !c.fideles }))} />
              </div>
              <p className="mt-1 text-xs text-muted">Les cases se cumulent (un donateur qui correspond à l&apos;une d&apos;elles est retenu).</p>
            </div>

            <CaseExport
              label="Inclure les Donateurs Bourse"
              coche={criteres.inclureBourse}
              onChange={() => setCriteres((c) => ({ ...c, inclureBourse: !c.inclureBourse }))}
              aide="Exclus par défaut : ils donnent pour payer des bourses de scolarité."
            />

            <div className="rounded-lg bg-surface-2 px-3 py-2">
              {aucunCritere(criteres) ? (
                <span className="text-muted">Cochez au moins une case pour voir la sélection.</span>
              ) : (
                <>
                  <div>
                    <strong>{total}</strong> donateur{total > 1 ? "s" : ""} retenu{total > 1 ? "s" : ""}, dont{" "}
                    <strong>{fichier.publipostage.length}</strong> dans le fichier de publipostage
                    {fichier.courrielSeulement > 0 && ` (${fichier.courrielSeulement} avec courriel seulement, sans adresse postale)`}.
                  </div>
                  {fichier.sansCoordonnees.length > 0 && (
                    <div className="text-xs text-muted">
                      {fichier.sansCoordonnees.length} sans adresse ni courriel : listés dans un second onglet.
                    </div>
                  )}
                  {nbExclus > 0 && (
                    <div className="text-xs text-muted">
                      Exclus d&apos;office : {exclus.nePasSolliciter} « ne souhaite pas être sollicité », {exclus.famille} famille
                      {exclus.famille > 1 ? "s" : ""} de l&apos;école, {exclus.asa} Amitié Sainte-Anne
                      {exclus.bourse > 0 ? `, ${exclus.bourse} Donateur${exclus.bourse > 1 ? "s" : ""} Bourse` : ""}.
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
              Le fichier contient des données personnelles (noms, adresses, courriels) : à conserver avec soin et à supprimer une
              fois le publipostage terminé. Les couples sont sur une seule ligne (« Monsieur et Madame »).
            </p>
            {message && <p className="text-xs text-muted">{message}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOuvert(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
                Fermer
              </button>
              <button
                type="button"
                onClick={exporter}
                disabled={busy || aucunCritere(criteres) || fichier.publipostage.length === 0}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Export…" : "Exporter en Excel"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
