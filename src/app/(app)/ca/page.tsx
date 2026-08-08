import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";

export default function ConseilAdministrationPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <PageHeader
        title="Conseil d'administration"
        subtitle="Préparation des réunions et bilan à présenter."
      />

      <Link
        href="/comptabilite/bilan?periode=mois"
        className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon name="chart" className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium group-hover:text-accent">Bilan mensuel à présenter</div>
          <div className="mt-0.5 text-sm text-muted">
            Synthèse financière (résultat, trésorerie, budget), frais de scolarité et dons — exportable en PDF pour le CA.
          </div>
        </div>
      </Link>

      <div className="mt-6 rounded-xl border border-border bg-surface-2 px-5 py-4 text-sm text-muted">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Icon name="calendar" className="h-4 w-4 text-gold" />
          À venir
        </p>
        <p className="mt-1">
          Ordre du jour, convocation, procès-verbaux et suivi des décisions du conseil seront ajoutés ici.
        </p>
      </div>
    </div>
  );
}
