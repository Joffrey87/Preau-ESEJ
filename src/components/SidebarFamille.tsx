"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { oublierSessions } from "@/lib/basculeEspace";
import Icon from "./Icon";
import BasculeTheme from "./BasculeTheme";
import { PanneauBascule } from "./BasculeEspace";

type Lien = { href: string; label: string; icon: string; exact: boolean };
/** Menu par sections : Tableau de bord seul en haut, puis École, Finance, Informations. */
const NAV: { titre: string | null; liens: Lien[] }[] = [
  { titre: null, liens: [{ href: "/espace", label: "Tableau de bord", icon: "dashboard", exact: true }] },
  {
    titre: "École",
    liens: [
      { href: "/espace/bulletins", label: "Bulletins", icon: "bulletin", exact: false },
      { href: "/espace/absences", label: "Absences", icon: "calendar", exact: false },
    ],
  },
  { titre: "Finance", liens: [{ href: "/espace/paiements", label: "Paiements", icon: "invoice", exact: false }] },
  { titre: "Informations", liens: [{ href: "/espace/famille", label: "Ma famille", icon: "maison", exact: false }] },
];

/**
 * Menu de l'Espace famille : même agencement que celui du bureau (logo en haut, pages dessous, déconnexion et thème en
 * bas ; sur téléphone, le logo déplie le menu). Un parent aussi membre de la Recherche de fonds y trouve, au logo, le
 * choix d'espace.
 */
export default function SidebarFamille({
  famille,
  apercu = false,
  bascule,
}: {
  famille: string;
  /** Aperçu du Trésorier : pas de déconnexion ni de changement d'espace. */
  apercu?: boolean;
  /** Espaces reliés : prénom du membre Recherche de fonds de la famille, s'il y en a un ; famille de la Directrice. */
  bascule?: { prenom: string | null; directrice: boolean; president?: boolean };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const enteteRef = useRef<HTMLDivElement>(null);
  const surTelephone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const avecChoix = !apercu && !!bascule && (!!bascule.prenom || bascule.directrice || !!bascule.president);
  const liens = { famille, prenom: bascule?.prenom ?? null, directrice: !!bascule?.directrice, president: !!bascule?.president };

  useEffect(() => {
    if (!choixOuvert) return;
    const ferme = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !enteteRef.current?.contains(e.target as Node)) setChoixOuvert(false);
    };
    document.addEventListener("mousedown", ferme);
    document.addEventListener("keydown", ferme);
    return () => {
      document.removeEventListener("mousedown", ferme);
      document.removeEventListener("keydown", ferme);
    };
  }, [choixOuvert]);

  async function deconnecter() {
    await createClient().auth.signOut();
    oublierSessions();
    router.push("/login");
    router.refresh();
  }

  const contenuLogo = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="Préau" className="h-9 w-9 shrink-0 rounded-full object-contain" />
      <div className="leading-tight">
        <div className="text-sm font-semibold">Préau</div>
        <div className="text-[10px] text-muted">Famille {famille}</div>
      </div>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${avecChoix ? "" : "md:hidden"} ${choixOuvert || menuOuvert ? "rotate-180" : ""}`}
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </>
  );
  const classeLogo = "flex w-full items-center gap-2.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-surface-2";

  return (
    <aside className="flex flex-col border-b border-border bg-surface max-md:sticky max-md:top-0 max-md:z-40 max-md:max-h-dvh max-md:overflow-y-auto md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:sticky md:top-0">
      <div ref={enteteRef} className="relative">
        <button
          type="button"
          onClick={() => (surTelephone() ? setMenuOuvert((o) => !o) : avecChoix && setChoixOuvert((o) => !o))}
          aria-expanded={choixOuvert || menuOuvert}
          aria-haspopup="true"
          title={avecChoix ? "Changer d'espace" : undefined}
          className={`${classeLogo} ${avecChoix ? "" : "md:cursor-default md:hover:bg-transparent"}`}
        >
          {contenuLogo}
        </button>

        {avecChoix && choixOuvert && (
          <div className="absolute left-2 right-2 top-full z-30 mt-1 rounded-xl border border-border bg-surface p-2 shadow-lg md:right-auto md:w-[19rem]">
            <div className="px-1.5 pb-1.5 text-[11px] text-muted">Changer d’espace</div>
            <PanneauBascule actuel="famille" liens={liens} />
          </div>
        )}
      </div>

      <nav
        onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuOuvert(false)}
        className={`${menuOuvert ? "" : "max-md:hidden"} flex-1 px-2 pt-2 pb-8 md:min-h-0 md:overflow-y-auto`}
      >
        {avecChoix && (
          <div className="mb-2 md:hidden">
            <PanneauBascule actuel="famille" liens={liens} />
          </div>
        )}
        {NAV.map((section) => (
          <div key={section.titre ?? "accueil"} className={section.titre ? "mt-3" : ""}>
            {section.titre && <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{section.titre}</div>}
        <ul>
          {section.liens.map((item) => {
            const actif = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    actif ? "bg-accent-soft font-medium text-accent" : "text-foreground hover:bg-surface-2"
                  }`}
                >
                  <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
          </div>
        ))}
      </nav>

      {!apercu && (
        <div className={`${menuOuvert ? "" : "max-md:hidden"} mt-auto border-t border-border px-2 pb-2 pt-2`}>
          {/* À droite du badge « N » de Next (bas gauche, en développement) : déconnexion, thème. */}
          <div className="pl-11">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={deconnecter}
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
