"use client";

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

/**
 * Volet d'informations complémentaires, déroulé sous la ligne d'opération.
 *
 * Deux comportements, selon la façon dont il a été ouvert :
 *   — ouvert par un clic sur la ligne : il se referme dès que la souris le quitte ;
 *   — épinglé par le bouton « i » : il reste jusqu'au clic suivant sur ce bouton.
 */
export default function VoletDetail({
  op,
  epingle,
  onFermer,
  colSpan,
}: {
  op: OpDetail;
  epingle: boolean;
  onFermer: () => void;
  colSpan: number;
}) {
  return (
    <tr
      className="border-b border-border bg-surface-2/40"
      onMouseLeave={epingle ? undefined : onFermer}
    >
      <td className="px-4 py-3" />
      <td colSpan={colSpan - 1} className="px-4 py-3">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {op.libelle_origine && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">Libellé bancaire (brut)</dt>
              <dd className="font-mono text-xs break-all">{op.libelle_origine}</dd>
            </div>
          )}
          <Ligne label="Libellé affiché" value={op.libelle} />
          <Ligne label="Catégorie" value={op.categorie ?? "—"} />
          <Ligne label="Date" value={formatDate(op.date_operation)} />
          <Ligne
            label="Montant"
            value={`${op.type === "recette" ? "+" : "−"}${formatEuros(Number(op.montant))}`}
          />
          <Ligne label="Mode de paiement" value={op.mode_paiement ?? "—"} />
          <Ligne label="Compte" value={op.compte ?? "—"} />
        </dl>
        {epingle && (
          <p className="mt-2 text-xs text-muted">
            Volet épinglé — cliquez de nouveau sur ⓘ pour le refermer.
          </p>
        )}
      </td>
    </tr>
  );
}

function Ligne({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
