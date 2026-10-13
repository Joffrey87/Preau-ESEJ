"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { prenomVisite } from "@/lib/messagerie";

/** Nombre de messages non lus, mis à jour en temps réel (Supabase Realtime) et, en secours, toutes les 30 s. */
export function useNonLus(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const supabase = createClient();
    let actif = true;
    const charger = async () => {
      const { data } = await supabase.rpc("msg_non_lus", { p_prenom: prenomVisite() });
      if (actif && typeof data === "number") setN(data);
    };
    void charger();
    const canal = supabase
      .channel(`msg-badge-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "msg_signaux" }, () => void charger())
      .subscribe();
    const minuteur = setInterval(charger, 30000);
    const auRetour = () => document.visibilityState === "visible" && void charger();
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("msg-lu", charger);
    return () => {
      actif = false;
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("msg-lu", charger);
      void supabase.removeChannel(canal);
    };
  }, []);
  return n;
}

/** Pastille de non-lus (rien quand tout est lu). */
export function PastilleNonLus({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={`${n} message${n > 1 ? "s" : ""} non lu${n > 1 ? "s" : ""}`}
      className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-negative px-1 text-[10px] font-semibold leading-[1.15rem] text-white shadow-sm ${className}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
