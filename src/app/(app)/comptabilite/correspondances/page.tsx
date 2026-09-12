import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GestionCorrespondances, { type Echantillon } from "@/components/GestionCorrespondances";
import { createClient } from "@/lib/supabase/server";
import { toutesLesOperations } from "@/lib/operations";
import type { Correspondance } from "@/lib/correspondances";

type OpBrute = {
  libelle_origine: string | null;
  libelle: string;
  montant: number;
  type: "recette" | "depense";
  date_operation: string;
};

export default async function CorrespondancesPage() {
  const supabase = await createClient();

  const opsP = toutesLesOperations<OpBrute>(
    supabase,
    "libelle_origine, libelle, montant, type, date_operation",
  );
  const [reglesRes, catsRes] = await Promise.all([
    supabase.from("correspondances").select("*").order("ordre"),
    supabase.from("categories").select("id, nom, type").eq("archive", false).order("ordre"),
  ]);
  const ops = await opsP;

  // Un échantillon par libellé bancaire distinct : c'est sur lui que portent les
  // règles, et c'est ce qui rend l'aperçu lisible (1 278 opérations → ~200 motifs).
  const parLibelle = new Map<string, Echantillon>();
  for (const o of ops) {
    const brut = (o.libelle_origine ?? o.libelle ?? "").trim();
    if (!brut) continue;
    const e = parLibelle.get(brut);
    if (e) {
      e.occurrences += 1;
      // On garde l'occurrence la plus récente comme représentant.
      if (o.date_operation > e.date_operation) {
        e.date_operation = o.date_operation;
        e.montant = Number(o.montant);
      }
    } else {
      parLibelle.set(brut, {
        libelle_origine: brut,
        montant: Number(o.montant),
        type: o.type,
        date_operation: o.date_operation,
        occurrences: 1,
      });
    }
  }
  const echantillons = [...parLibelle.values()].sort((a, b) => b.occurrences - a.occurrences);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Correspondances"
        subtitle="Règles de réécriture des libellés bancaires : intitulé lisible, catégorie proposée, alerte de vérification. Elles s'appliquent à l'import et sont modifiables ici."
        action={
          <Link
            href="/comptabilite"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
          >
            ← Retour à la comptabilité
          </Link>
        }
      />

      <GestionCorrespondances
        regles={(reglesRes.data ?? []) as Correspondance[]}
        categories={catsRes.data ?? []}
        echantillons={echantillons}
      />
    </div>
  );
}
