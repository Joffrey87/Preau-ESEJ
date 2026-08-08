import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GestionPipeline from "@/components/GestionPipeline";
import { createClient } from "@/lib/supabase/server";
import type { Prospect } from "@/lib/pipeline";

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prospects")
    .select("*")
    .order("prochaine_action_date", { ascending: true, nullsFirst: false })
    .order("nom");

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Pipeline grands donateurs & prospects"
        subtitle="Du contact à la fidélisation : suivre chaque prospect, son étape et la prochaine action."
        action={
          <Link href="/mecenat/strategie" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Stratégie & règles
          </Link>
        }
      />
      <GestionPipeline prospects={(data ?? []) as Prospect[]} />
    </div>
  );
}
