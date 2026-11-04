"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EVT_COM, EVT_SIGNAL } from "@/lib/communication";

// Un seul abonnement par onglet, même si la pastille est montée deux fois (menu ordinateur et menu téléphone).
let abonnes = 0;
let arreter: (() => void) | null = null;
function abonner(sb: ReturnType<typeof createClient>) {
  abonnes += 1;
  if (abonnes === 1) {
    // Sujet unique à chaque abonnement : `removeChannel` est asynchrone, et `sb.channel("com-signaux")` rendait
    // l'ancien canal encore abonné si la pastille se remontait avant la fin du désabonnement (navigation, retour
    // en ligne) ; `.on()` levait alors « cannot add postgres_changes callbacks … after subscribe() », erreur
    // non rattrapée qui faisait tomber toute la page (« This page couldn't load »).
    try {
      const canal = sb
        .channel(`com-signaux-${Math.random().toString(36).slice(2)}-${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "com_signaux" }, (p) => {
          const fil = (p.new as { fil_id?: string } | null)?.fil_id ?? null;
          window.dispatchEvent(new CustomEvent(EVT_SIGNAL, { detail: fil }));
        })
        .subscribe();
      arreter = () => {
        sb.removeChannel(canal).catch(() => {});
      };
    } catch (e) {
      // Sans temps réel, la relecture périodique et au retour sur l'onglet prend le relais.
      console.warn("Messagerie : temps réel indisponible", e);
      arreter = null;
    }
  }
  return () => {
    abonnes -= 1;
    if (abonnes === 0 && arreter) {
      arreter();
      arreter = null;
    }
  };
}

/**
 * Pastille du menu : nombre de conversations non lues. C'est aussi le seul abonnement temps réel de la page (une
 * connexion par utilisateur) : à chaque signal « un fil a bougé » (com_signaux, filtré par la base sur les fils du
 * compte), le compteur est relu et la messagerie ouverte est prévenue (événement EVT_SIGNAL).
 */
export default function PastilleNonLus() {
  const sb = useMemo(() => createClient(), []);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    const maj = () => {
      if (document.visibilityState !== "visible") return;
      sb.rpc("com_non_lus").then(({ data }) => vivant && setN(typeof data === "number" ? data : 0));
    };
    maj();
    const desabonner = abonner(sb);
    // Filet de sécurité si le temps réel est coupé (veille, réseau) : relecture toutes les 5 minutes.
    const t = window.setInterval(maj, 300_000);
    window.addEventListener(EVT_COM, maj);
    window.addEventListener(EVT_SIGNAL, maj);
    document.addEventListener("visibilitychange", maj);
    return () => {
      vivant = false;
      desabonner();
      window.removeEventListener(EVT_SIGNAL, maj);
      window.clearInterval(t);
      window.removeEventListener(EVT_COM, maj);
      document.removeEventListener("visibilitychange", maj);
    };
  }, [sb]);
  if (!n) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full bg-gold px-1.5 text-[10.5px] font-semibold leading-[1.4] text-white" title={`${n} conversation(s) non lue(s)`}>
      {n}
    </span>
  );
}
