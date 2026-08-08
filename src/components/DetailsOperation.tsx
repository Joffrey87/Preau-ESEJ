"use client";

import { useState } from "react";
import { Modal } from "@/components/GestionComptes";
import Icon from "@/components/Icon";
import { formatEuros, formatDate } from "@/lib/format";

export type OpDetail = {
  libelle: string;
  libelle_origine: string | null;
  date_operation: string;
  montant: number;
  type: "recette" | "depense";
  categorie: string | null;
  mode_paiement: string | null;
  compte: string | null;
};

// Petit bouton « détails » : ouvre le libellé bancaire brut + infos secondaires
// qu'on ne veut pas encombrer sur la vue synthétique.
export default function DetailsOperation({ op }: { op: OpDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1.5 inline-flex text-muted/70 hover:text-accent"
        aria-label="Détails de l'opération"
        title="Détails"
      >
        <Icon name="info" className="h-4 w-4" />
      </button>
      {open && (
        <Modal title="Détail de l'opération" onClose={() => setOpen(false)}>
          <dl className="space-y-2.5 text-sm">
            <Ligne label="Libellé affiché" value={op.libelle} />
            {op.libelle_origine && op.libelle_origine !== op.libelle && (
              <Ligne label="Libellé bancaire (brut)" value={op.libelle_origine} mono />
            )}
            <Ligne label="Date" value={formatDate(op.date_operation)} />
            <Ligne
              label="Montant"
              value={`${op.type === "recette" ? "+" : "−"}${formatEuros(Number(op.montant))}`}
            />
            <Ligne label="Catégorie" value={op.categorie ?? "—"} />
            <Ligne label="Mode de paiement" value={op.mode_paiement ?? "—"} />
            <Ligne label="Compte" value={op.compte ?? "—"} />
          </dl>
        </Modal>
      )}
    </>
  );
}

function Ligne({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : ""}>{value}</dd>
    </div>
  );
}
