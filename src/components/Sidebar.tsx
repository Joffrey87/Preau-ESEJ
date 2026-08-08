"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "@/lib/nav";
import { roleByEmail } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import Icon from "./Icon";

// Agencement « rail dense » : menu compact, sections réduites à un fin libellé,
// tous les liens visibles sans barre de défilement, pas de bandeau supérieur.
export default function Sidebar({ userEmail, userName }: { userEmail?: string; userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col border-b border-border bg-surface md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:sticky md:top-0">
      <Link
        href="/"
        className="flex items-center gap-2.5 border-b border-border px-4 py-3 transition-colors hover:bg-surface-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Préau" className="h-9 w-9 shrink-0 rounded-full object-contain" />
        <div className="leading-tight">
          <div className="text-sm font-semibold">Préau</div>
          <div className="text-[10px] text-muted">ARIL · Saint-Enfant-Jésus</div>
        </div>
      </Link>

      <nav className="flex-1 px-2 py-2">
        {NAV.map((section, i) => (
          <div key={section.title} className={i === 0 ? "" : "mt-2 border-t border-border/70 pt-2"}>
            <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
              {section.title}
            </div>
            <ul>
              {section.items.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

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
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-foreground hover:bg-surface-2"
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

      {userEmail && (
        <div className="mt-auto border-t border-border px-2 py-2">
          <div className="px-2 pb-1 text-[11px] text-muted truncate">
            {userName ? (
              <>
                <span className="font-medium text-foreground">{userName}</span>
                {roleByEmail(userEmail)?.label ? ` · ${roleByEmail(userEmail)?.label}` : ""}
              </>
            ) : (
              <>
                Connecté :{" "}
                <span className="font-medium text-foreground">
                  {roleByEmail(userEmail)?.label ?? userEmail}
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-foreground hover:bg-surface-2"
          >
            <Icon name="logout" className="h-4 w-4 shrink-0" />
            <span>Déconnexion</span>
          </button>
        </div>
      )}
    </aside>
  );
}
