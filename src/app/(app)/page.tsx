import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { formatEuros } from "@/lib/format";

type Op = { type: "recette" | "depense"; montant: number; date_operation: string };

const SHORTCUTS = [
  {
    href: "/comptabilite",
    icon: "ledger",
    title: "Comptabilité",
    desc: "Saisir et suivre les recettes et dépenses.",
  },
  {
    href: "/budget",
    icon: "chart",
    title: "Budget",
    desc: "Comparer le réalisé au budget prévisionnel.",
  },
];

export default async function Home() {
  const supabase = await createClient();

  const { data: exercice } = await supabase
    .from("exercices")
    .select("id, libelle")
    .eq("actif", true)
    .order("date_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [comptesRes, opsRes, budgetRes] = await Promise.all([
    supabase.from("comptes").select("solde_initial").eq("archive", false),
    exercice
      ? supabase
          .from("operations")
          .select("type, montant, date_operation")
          .eq("exercice_id", exercice.id)
      : Promise.resolve({ data: [] as Op[] }),
    exercice
      ? supabase
          .from("budget_lignes")
          .select("montant_prevu, categories(type)")
          .eq("exercice_id", exercice.id)
      : Promise.resolve({
          data: [] as { montant_prevu: number; categories: { type: string } | null }[],
        }),
  ]);

  const soldeInitial = (comptesRes.data ?? []).reduce(
    (s, c) => s + Number(c.solde_initial),
    0,
  );

  const ops = (opsRes.data ?? []) as Op[];
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const isThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  const sum = (arr: Op[], t: Op["type"]) =>
    arr.filter((o) => o.type === t).reduce((s, o) => s + Number(o.montant), 0);

  const recettesExercice = sum(ops, "recette");
  const depensesExercice = sum(ops, "depense");
  const opsMois = ops.filter((o) => isThisMonth(o.date_operation));
  const recettesMois = sum(opsMois, "recette");
  const depensesMois = sum(opsMois, "depense");
  const solde = soldeInitial + recettesExercice - depensesExercice;

  const budgetPrevuDep = (budgetRes.data ?? [])
    .filter((b) => {
      const cat = Array.isArray(b.categories) ? b.categories[0] : b.categories;
      return cat?.type === "depense";
    })
    .reduce((s, b) => s + Number(b.montant_prevu), 0);
  const budgetConsomme =
    budgetPrevuDep > 0 ? (depensesExercice / budgetPrevuDep) * 100 : null;

  const stats = [
    { label: "Solde courant", value: formatEuros(solde), hint: "Tous comptes" },
    { label: "Recettes du mois", value: formatEuros(recettesMois), hint: "Mois en cours" },
    { label: "Dépenses du mois", value: formatEuros(depensesMois), hint: "Mois en cours" },
    {
      label: "Budget consommé",
      value: budgetConsomme === null ? "—" : `${Math.round(budgetConsomme)} %`,
      hint: budgetConsomme === null ? "Budget non défini" : "Dépenses / prévu",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Tableau de bord"
        subtitle={
          exercice
            ? `Vue d'ensemble · ${exercice.libelle}`
            : "Vue d'ensemble de la trésorerie de l'ARIL."
        }
      />

      {!exercice && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
          <Icon name="dashboard" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p>Aucun exercice actif. Créez-en un pour commencer le suivi.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm text-muted">{s.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-muted">{s.hint}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
        Accès rapide
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Icon name={s.icon} className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium group-hover:text-accent">{s.title}</div>
              <div className="mt-0.5 text-sm text-muted">{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
