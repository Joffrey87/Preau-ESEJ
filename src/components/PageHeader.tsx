import { formatDate } from "@/lib/format";

// Titre de page compact, en ligne : pas de bandeau ni de gros séparateur.
export default function PageHeader({
  title,
  subtitle,
  action,
  maj,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Date de la dernière écriture bancaire intégrée (voir `date_maj_comptes`). */
  maj?: string | null;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        {maj && <PastilleMaj maj={maj} />}
      </div>
      {action}
    </div>
  );
}

/** « À jour au … » : date de la dernière écriture bancaire intégrée. */
export function PastilleMaj({ maj }: { maj: string }) {
  return (
    <span
      className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
      title="Date de la dernière écriture bancaire intégrée dans Préau : les paiements postérieurs n'apparaissent qu'après l'import du relevé suivant."
    >
      À jour au {formatDate(maj)}
    </span>
  );
}
