import Link from "next/link";
import Icon from "@/components/Icon";
import AccesFamilles from "@/components/AccesFamilles";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { emailVue } from "@/lib/vueRoleServeur";
import { cookies } from "next/headers";
import { COOKIE_PRENOM, ROLES_PRENOM_A_L_ACCES, roleByEmail } from "@/lib/roles";
import { chargerTableauDeBord, type Ton } from "@/lib/tableauDeBord";

// Tableau de bord : page d'accueil de chaque profil d'Administration. Les priorités du jour, puis une tuile par onglet
// du profil avec ses chiffres essentiels (voir lib/tableauDeBord.ts).

const POINT: Record<Ton, string> = { rouge: "bg-negative", ambre: "bg-gold", bleu: "bg-accent", vert: "bg-positive", neutre: "bg-muted" };
const BORD: Record<Ton, string> = {
  rouge: "hover:border-negative/50",
  ambre: "hover:border-gold/60",
  bleu: "hover:border-accent",
  vert: "hover:border-positive/50",
  neutre: "hover:border-accent",
};
const TEXTE: Record<Ton, string> = { rouge: "text-negative", ambre: "text-gold", bleu: "text-accent", vert: "text-positive", neutre: "text-foreground" };

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = await emailVue(user?.email);
  const role = roleByEmail(email);
  // Prénom salué : celui du profil (Président, Directrice…), ou, pour un profil partagé, celui choisi à la visite.
  const meta = (user?.user_metadata ?? {}) as { prenom?: string };
  const prenomVisite = decodeURIComponent((await cookies()).get(COOKIE_PRENOM)?.value ?? "");
  const prenom = (ROLES_PRENOM_A_L_ACCES.includes(role?.slug ?? "") && prenomVisite ? prenomVisite : (role?.prenom ?? meta.prenom ?? "")).trim();
  const { exercice, tuiles, priorites } = await chargerTableauDeBord(supabase, email, todayISO());
  const finances = tuiles.some((t) => t.href === "/comptabilite");

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const salut = now.getHours() < 18 ? "Bonjour" : "Bonsoir";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      {/* En-tête personnalisé */}
      <div className="mb-8 flex items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="Préau" className="h-20 w-20 shrink-0 rounded-full object-contain sm:h-24 sm:w-24" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gold">{dateStr}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {salut}
            {prenom ? ` ${prenom}` : ""}
            {role ? <span className="font-normal text-muted"> · {role.label}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {[role?.titre ?? "ARIL · École du Saint-Enfant-Jésus", finances && exercice ? exercice.libelle : null].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {/* Priorités du jour : ce qui attend une action, dans les onglets du profil. */}
      <section className="mb-9">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
          <Icon name="check" className="h-4 w-4 text-gold" />
          Vos priorités du jour
        </h2>
        {priorites.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-positive/10 text-positive">
              <Icon name="check" className="h-5 w-5" />
            </span>
            Rien d’urgent à traiter aujourd’hui. Tout est à jour de votre côté.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {priorites.map((p) => (
              <Link key={p.titre} href={p.href} className={`group flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 transition-colors ${BORD[p.ton]}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${POINT[p.ton]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.titre}</span>
                  <span className="mt-0.5 block text-sm text-muted">{p.detail}</span>
                </span>
                <Icon name="transfer" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Accès des familles (visible du Trésorier et des administrateurs seulement) */}
      <AccesFamilles />

      {/* Vos onglets en bref : une tuile par onglet, ses chiffres essentiels. */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Vos onglets en bref</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tuiles.map((t) => (
            <Link key={t.href} href={t.href} className="group flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Icon name={t.icone} className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium group-hover:text-accent">{t.titre}</div>
                  {t.sousTitre && <div className="truncate text-[11.5px] text-muted">{t.sousTitre}</div>}
                </div>
                <Icon name="transfer" className="ml-auto h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              {t.chiffres.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                  {t.chiffres.map((c) => (
                    <div key={c.label} className="min-w-0">
                      <dt className="truncate text-[11px] text-muted">{c.label}</dt>
                      <dd className={`text-[15px] font-semibold tabular-nums ${TEXTE[c.ton ?? "neutre"]}`}>{c.valeur}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted">{t.description ?? "Ouvrir l’onglet."}</p>
              )}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
