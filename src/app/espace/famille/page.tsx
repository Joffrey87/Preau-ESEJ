import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import { todayISO } from "@/lib/format";
import { chargerEspace, anneeCourante, classeEn } from "@/lib/espaceFamille";
import { depuis, prenomEleve, termineEnJuin } from "@/lib/eleves";

export default async function MaFamille() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const apercu = await familleEnApercu(user);
  const { espace, association, erreur } = await chargerEspace(supabase, apercu);
  if (!espace) return <p className="text-sm text-negative">{erreur ?? "Espace indisponible."}</p>;
  const f = espace.famille;
  const annee = anneeCourante(espace, todayISO());
  const champs: [string, string | null][] = [
    ["Parent", f.parent1],
    ["Parent", f.parent2],
    ["Adresse", f.adresse],
    ["Ville", f.cp_ville],
    ["Téléphone", f.telephone],
    ["Courriels", f.courriels],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Famille {f.nom}</h1>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Coordonnées</h2>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          {champs.map(([l, v], k) => (
            <div key={k} className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted">{l}</dt>
              <dd>{v || <span className="text-muted">—</span>}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Une information à corriger ? Écrivez à {association?.courriel_contact ?? "l'école"}.
        </p>
      </section>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Enfants</h2>
        {espace.eleves.length === 0 ? (
          <p className="text-sm text-muted">La liste de vos enfants sera complétée par l&apos;école.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {espace.eleves.map((e) => {
              const c = annee ? classeEn(e, annee) : null;
              return (
                <li key={e.id}>
                  <span className="font-medium">{prenomEleve(e)}</span> — {c ?? "plus scolarisé à l'école"} · {depuis(e)}
                  {annee && termineEnJuin(e, annee) && (
                    <span className="ml-1 text-xs text-gold">dernière année (juin non dû pour cet enfant)</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
