import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ImportDons from "@/components/ImportDons";

export default function ImportDonsPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <PageHeader
        title="Importer des dons (.xlsx)"
        subtitle="Reprise unique de vos dons existants. Lecture locale + chiffrement à l'entrée."
        action={
          <Link href="/dons" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            ← Retour aux dons
          </Link>
        }
      />
      <ImportDons />
    </div>
  );
}
