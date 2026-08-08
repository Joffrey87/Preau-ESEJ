"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "@/lib/nav";
import { roleByEmail } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import Icon from "./Icon";

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col border-b border-border bg-surface md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:sticky md:top-0 md:overflow-y-auto">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Préau" className="h-10 w-10 shrink-0 rounded-full object-contain" />
        <div className="leading-tight">
          <div className="font-semibold">Préau</div>
          <div className="text-xs text-muted">ARIL · École Saint-Enfant-Jésus</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3">
        {NAV.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                if (!item.ready) {
                  return (
                    <li key={item.href}>
                      <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted/70 cursor-default">
                        <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0 opacity-70" />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
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
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-accent-soft text-accent font-medium"
                          : "text-foreground hover:bg-surface-2"
                      }`}
                    >
                      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {userEmail && (
        <div className="border-t border-border px-3 py-3">
          <div className="px-2 pb-2 text-xs text-muted truncate">
            Connecté : <span className="font-medium text-foreground">{roleByEmail(userEmail)?.label ?? userEmail}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-2"
          >
            <Icon name="logout" className="h-[18px] w-[18px] shrink-0" />
            <span>Déconnexion</span>
          </button>
        </div>
      )}
    </aside>
  );
}
