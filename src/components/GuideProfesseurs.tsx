"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { GUIDE_PROFESSEURS } from "@/lib/guideProfesseurs";

/** Guide des Professeurs : une carte par usage (étapes numérotées, encadré « Bon à savoir »), téléchargeable en PDF. */
export default function GuideProfesseurs() {
  const [occupe, setOccupe] = useState(false);
  const telecharger = async () => {
    setOccupe(true);
    try {
      await (await import("@/lib/guideProfesseursPdf")).telechargerGuide();
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3">
        <Icon name="ampoule" className="h-6 w-6 shrink-0 text-gold" />
        <p className="min-w-0 flex-1 text-[13px]">
          Préau en six gestes : se repérer, saisir des notes, le relevé de la période, le bulletin du trimestre, l&apos;appel et vos élèves.
          Besoin d&apos;aide sur une page ? L&apos;ampoule, en bas à droite, ouvre ses fiches.
        </p>
        <button type="button" onClick={telecharger} disabled={occupe} className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
          {occupe ? "Préparation…" : "Télécharger en PDF"}
        </button>
      </div>

      <nav className="flex flex-wrap gap-2 text-[12.5px]">
        {GUIDE_PROFESSEURS.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border bg-surface px-3 py-1 text-accent hover:bg-accent-soft">
            {i + 1}. {s.titre}
          </a>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        {GUIDE_PROFESSEURS.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-3 bg-accent px-4 py-2.5 text-accent-fg">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold text-[13px] font-semibold text-white">{i + 1}</span>
              <h2 className="flex-1 text-[15px] font-semibold">{s.titre}</h2>
              <Icon name={s.icone} className="h-5 w-5 opacity-80" />
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[13px] italic text-muted">{s.resume}</p>
              <ol className="space-y-2">
                {s.etapes.map((e, k) => (
                  <li key={k} className="flex gap-2.5 text-[13px] leading-relaxed">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold">{k + 1}</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ol>
              {s.astuce && (
                <p className="rounded-lg border-l-[3px] border-gold bg-gold-soft/50 px-3 py-2 text-[12.5px]">
                  <strong className="text-gold">Bon à savoir · </strong>
                  {s.astuce}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
