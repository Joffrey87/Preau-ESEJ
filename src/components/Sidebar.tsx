"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NAV } from "@/lib/nav";
import type { Niveau } from "@/lib/acces";
import { estEvenement, estProfesseur, pagesAutorisees, roleByEmail } from "@/lib/roles";
import { ICONES_ROLES, PROFILS_VUE } from "@/lib/vueRole";
import { MISES_A_JOUR, entreeEnAmbre } from "@/lib/misesAJour";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import Icon from "./Icon";
import PastilleNonLus from "./communication/PastilleNonLus";
import BasculeTheme from "./BasculeTheme";
import { PanneauBascule, type LiensEspace } from "./BasculeEspace";
import { oublierSessions, type Espace } from "@/lib/basculeEspace";
import { OuvrirBasculeReelle, finirBasculeReelle, ouvrirChoixBasculeReelle } from "./BasculeReelle";

/** Espace de bascule du profil connecté (Directrice, Président ; sinon Recherche de fonds). */
const espaceDuRole = (slug?: string, email?: string): Espace =>
  estEvenement(email) ? "evenement" : estProfesseur(email) ? "professeur" : slug === "directrice" ? "directrice" : slug === "president" ? "president" : "recherche";

// Agencement « rail dense » : menu compact, sections réduites à un fin libellé,
// tous les liens visibles sans barre de défilement, pas de bandeau supérieur.
export default function Sidebar({
  userEmail,
  peutChanger = false,
  slugActif = "",
  familles = [],
  bascule,
  niveaux,
  webmestre = false,
  basculeReelle,
}: {
  userEmail?: string;
  /** Trésorier : le bloc « Préau » ouvre le choix du profil (vue seulement). */
  peutChanger?: boolean;
  slugActif?: string;
  /** Familles de l'école, pour choisir laquelle voir (aperçu de son espace). */
  familles?: { id: string; nom: string }[];
  /** Profil relié à un Espace famille (Recherche de fonds, Directrice) : le logo propose le passage de l'un à l'autre. */
  bascule?: LiensEspace;
  /** Droits réglés par le Webmestre : un onglet masqué disparaît du menu. */
  niveaux?: Record<string, Niveau>;
  /** Le profil connecté est Webmestre : le logo mène aussi à la page Webmestre. */
  webmestre?: boolean;
  /** Bascule réelle du Webmestre en cours : sur son compte, ou sur un autre (le logo ouvre alors le choix des comptes). */
  basculeReelle?: "webmestre" | "autre";
}) {
  const pathname = usePathname();
  const recherche = useSearchParams();
  const router = useRouter();
  const [choixOuvert, setChoixOuvert] = useState(false);
  // Téléphone : le menu entier (pages, déconnexion, thème) se déplie en touchant le logo Préau.
  const [menuOuvert, setMenuOuvert] = useState(false);
  const surTelephone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const [famillesOuvertes, setFamillesOuvertes] = useState(false);
  const enteteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!choixOuvert) return;
    const ferme = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !enteteRef.current?.contains(e.target as Node)) {
        setChoixOuvert(false);
      }
    };
    document.addEventListener("mousedown", ferme);
    document.addEventListener("keydown", ferme);
    return () => {
      document.removeEventListener("mousedown", ferme);
      document.removeEventListener("keydown", ferme);
    };
  }, [choixOuvert]);

  async function handleLogout() {
    const supabase = createClient();
    // Le Webmestre quitte sa vue basculée (sans effet pour les autres comptes).
    if ((await supabase.rpc("est_webmestre")).data === true) await supabase.rpc("webmestre_vue_definir", { p_profil: null });
    await finirBasculeReelle();
    await supabase.auth.signOut();
    oublierSessions();
    document.cookie = "recherche_prenom=; path=/; max-age=0; SameSite=Lax";
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col border-b border-border bg-surface max-md:sticky max-md:top-0 max-md:z-40 max-md:max-h-dvh max-md:overflow-y-auto md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:sticky md:top-0">
      <div ref={enteteRef} className="relative">
        {peutChanger || bascule || basculeReelle === "autre" ? (
          <button
            type="button"
            onClick={() => (surTelephone() ? setMenuOuvert((o) => !o) : basculeReelle === "autre" ? ouvrirChoixBasculeReelle() : setChoixOuvert((o) => !o))}
            aria-expanded={choixOuvert || menuOuvert}
            aria-haspopup="true"
            title={basculeReelle === "autre" ? "Changer de compte (Webmestre)" : bascule ? "Changer d'espace" : "Voir l'application en tant que…"}
            className="flex w-full items-center gap-2.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-surface-2"
          >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="Préau" className="h-9 w-9 shrink-0 rounded-full object-contain" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Préau</div>
          <div className="text-[10px] text-muted">Saint-Enfant-Jésus</div>
        </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${choixOuvert || menuOuvert ? "rotate-180" : ""}`} aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        ) : (
          <Link
            href="/"
            onClick={(e) => {
              if (surTelephone()) {
                e.preventDefault();
                setMenuOuvert((o) => !o);
              }
            }}
            aria-expanded={menuOuvert}
            className="flex items-center gap-2.5 border-b border-border px-4 py-3 transition-colors hover:bg-surface-2"
          >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="Préau" className="h-9 w-9 shrink-0 rounded-full object-contain" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Préau</div>
          <div className="text-[10px] text-muted">Saint-Enfant-Jésus</div>
        </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform md:hidden ${menuOuvert ? "rotate-180" : ""}`} aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </Link>
        )}

        {!peutChanger && bascule && choixOuvert && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 rounded-xl border border-border bg-surface p-2 shadow-lg md:w-[19rem] md:right-auto">
            <div className="px-1.5 pb-1.5 text-[11px] text-muted">Changer d’espace</div>
            <PanneauBascule actuel={espaceDuRole(roleByEmail(userEmail)?.slug, userEmail)} liens={bascule} />
          </div>
        )}

        {peutChanger && choixOuvert && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 rounded-xl border border-border bg-surface p-2 shadow-lg md:w-[19rem] md:right-auto">
            <div className="px-1.5 pb-1.5 text-[11px] text-muted">
              Voir l’application en tant que… <span className="text-muted/70">(aperçu : vos droits restent ceux de votre profil)</span>
            </div>
            {webmestre && (
              <Link
                href="/webmestre"
                onClick={() => setChoixOuvert(false)}
                className="mb-2 flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent hover:opacity-90"
              >
                <Icon name="bouclier" className="h-5 w-5" />
                Page Webmestre
              </Link>
            )}
            {webmestre && <OuvrirBasculeReelle active={basculeReelle === "webmestre"} onAction={() => setChoixOuvert(false)} />}
            <div className="grid grid-cols-2 gap-1.5">
              {PROFILS_VUE.map((r) => {
                const actif = r.slug === slugActif;
                return (
                  <a
                    key={r.slug}
                    href={`/changer-profil/${r.slug}`}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-[12px] leading-tight transition-colors ${
                      actif
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-border hover:bg-surface-2"
                    }`}
                  >
                    <Icon name={ICONES_ROLES[r.slug] ?? "users"} className="h-6 w-6" />
                    {r.label}
                  </a>
                );
              })}
              <button
                type="button"
                onClick={() => setFamillesOuvertes((o) => !o)}
                aria-expanded={famillesOuvertes}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center text-[12px] leading-tight transition-colors ${
                  famillesOuvertes ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"
                }`}
              >
                <Icon name="maison" className="h-6 w-6" />
                Famille…
              </button>
            </div>
            {famillesOuvertes && (
              <div className="mt-2 border-t border-border pt-2">
                <div className="px-1.5 pb-1 text-[11px] text-muted">Quelle famille voir ?</div>
                <ul className="max-h-56 overflow-y-auto">
                  {familles.map((f) => (
                    <li key={f.id}>
                      <a href={`/apercu-famille/${f.id}`} className="block rounded-md px-2 py-1 text-[13px] hover:bg-surface-2">
                        {f.nom}
                      </a>
                    </li>
                  ))}
                  {familles.length === 0 && <li className="px-2 py-1 text-xs text-muted">Aucune famille.</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Menu défilant à la molette s'il dépasse la hauteur de l'écran, sans barre de défilement visible ; marge en bas pour que le dernier item ne colle pas au bord. */}
      <nav onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuOuvert(false)} className={`${menuOuvert ? "" : "max-md:hidden"} flex-1 overscroll-contain px-2 pt-2 pb-8 md:min-h-0 md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {!peutChanger && bascule && (
          <div className="mb-2 md:hidden">
            <PanneauBascule actuel={espaceDuRole(roleByEmail(userEmail)?.slug, userEmail)} liens={bascule} />
          </div>
        )}
        {peutChanger && (
          <button
            type="button"
            onClick={() => setChoixOuvert(true)}
            className="mb-2 flex w-full items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 text-[13px] hover:bg-surface-2 md:hidden"
          >
            <Icon name="users" className="h-4 w-4 shrink-0" />
            <span>Voir en tant que…</span>
          </button>
        )}
        {navDe(userEmail, niveaux).map((section, i) => (
          <div key={section.title || "accueil"} className={i === 0 ? "" : "mt-2 border-t border-border/70 pt-2"}>
            {section.title && (
              <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                {section.title}
              </div>
            )}
            <ul>
              {section.items.map((item) => {
                // Liens vers un onglet (?onglet=…) : actifs sur cet onglet ; le lien simple de la même page, sur les autres.
                const [chemin, requete] = item.href.split("?");
                const ongletLien = requete ? new URLSearchParams(requete).get("onglet") : null;
                const ongletsMenu = section.items.filter((x) => x.href.startsWith(chemin + "?")).map((x) => new URLSearchParams(x.href.split("?")[1]).get("onglet"));
                const ongletActuel = recherche.get("onglet");
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : ongletLien
                      ? pathname === chemin && ongletActuel === ongletLien
                      : pathname.startsWith(item.href) && !(ongletActuel && ongletsMenu.includes(ongletActuel));

                if (!item.ready) {
                  return (
                    <li key={item.href}>
                      <span className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-muted/60">
                        <Icon name={item.icon} className="h-4 w-4 shrink-0 opacity-60" />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="rounded bg-surface-2 px-1 py-px text-[9px] font-medium text-muted">
                          Bientôt
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.titre}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-foreground hover:bg-surface-2"
                      }`}
                    >
                      <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                      {item.href === "/communication" && <PastilleNonLus />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {userEmail && (
        <div className={`${menuOuvert ? "" : "max-md:hidden"} mt-auto border-t border-border px-2 pb-2 pt-2`}>
          {/* Mises à jour : encart à part, pour le profil Recherche de fonds ; chaque point mène à l'endroit concerné. */}
          {roleByEmail(userEmail)?.slug === "recherche-fonds" && (
            <div className="mb-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              {/* Chaque entrée porte son propre titre (« Mises à jour du … »), en ambre pendant 3 jours après l'ajout. */}
              {MISES_A_JOUR.map((m, i) => (
                <div key={m.depuis} className={i ? "mt-1.5" : ""}>
                  <div suppressHydrationWarning className={`text-[10.5px] ${entreeEnAmbre(m, todayISO()) ? "font-semibold text-gold" : "text-muted"}`}>{m.titre ?? `Depuis le ${m.depuis}`}</div>
                  <ul className="mt-0.5 space-y-0.5 text-[12px] leading-snug">
                    {m.points.map((p) => (
                      <li key={p.texte} className="flex items-baseline gap-1.5">
                        {/* Petite puce ; bleu-gris discret, moins marqué que les textes du menu. */}
                        <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 self-start rounded-full bg-[color-mix(in_srgb,var(--accent)_45%,var(--muted))]" />
                        <Link href={p.href} className="text-[color-mix(in_srgb,var(--accent)_45%,var(--muted))] hover:text-accent hover:underline">
                          {p.texte}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {/* À droite du badge « N » de Next (bas gauche, en développement) : déconnexion, thème. */}
          <div className="pl-11">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
            >
              <Icon name="logout" className="h-4 w-4 shrink-0" />
              <span>Déconnexion</span>
            </button>
            <BasculeTheme />
          </div>
          </div>
        </div>
      )}
    </aside>
  );
}

const NAV_PROFESSEUR: typeof NAV = [
  {
    title: "École",
    items: [
      { href: "/bulletins", label: "Notes & Bulletins", icon: "bulletin", ready: true },
      { href: "/bulletins?onglet=absences", label: "Appel & absences", icon: "calendar", ready: true },
      { href: "/bulletins?onglet=trombi", label: "Élèves", icon: "users", ready: true },
    ],
  },
  { title: "Aide", items: [{ href: "/guide-professeurs", label: "Guide", icon: "ampoule", ready: true }] },
];

/** Menu du compte : un profil restreint ne voit que ses pages. */
function navDe(email?: string, niveaux?: Record<string, Niveau>) {
  // Professeurs : Notes & Bulletins, puis Appel & absences et Élèves (trombinoscope) directement dans le menu.
  if (estProfesseur(email)) return NAV_PROFESSEUR;
  const pages = pagesAutorisees(email);
  const slug = roleByEmail(email)?.slug ?? "";
  // Un lien vers un onglet suit les droits de sa page (/bulletins?onglet=… → /bulletins) et ses propres profils.
  const visible = (i: (typeof NAV)[number]["items"][number]) => {
    const h = i.href.split("?")[0];
    if (i.href !== h && i.roles && !i.roles.includes(slug)) return false;
    return !i.sauf?.includes(slug) && (niveaux && h in niveaux ? niveaux[h] !== "masque" : pages ? pages.includes(h) : !i.roles || i.roles.includes(slug));
  };
  return NAV.map((s) => ({ ...s, items: s.items.filter(visible) })).filter((s) => s.items.length > 0);
}
