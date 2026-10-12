"use client";

import { mentionLabel, note20, rangTexte, type Synthese } from "@/lib/bulletins";

/** Bulletin tel que la famille le lit (synthèse figée) : même présentation que le PDF. */
export default function VueBulletin({ s }: { s: Synthese }) {
  const avecRang = s.afficherRang;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gold">{s.periode.libelle}</div>
          <h2 className="text-lg font-semibold">
            {s.eleve.prenom} {s.eleve.nom}
          </h2>
          <div className="text-xs text-muted">
            {s.classe.nom}
            {s.eleve.niveau ? ` · ${s.eleve.niveau}` : ""}
            {s.classe.titulaire ? ` · Titulaire : ${s.classe.titulaire}` : ""}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted">Moyenne générale</div>
          <div className="text-xl font-semibold tabular-nums text-accent">{note20(s.general.moy)}</div>
          <div className="text-[11px] text-muted">
            Classe {note20(s.general.moyClasse)}
            {avecRang && s.general.rang ? ` · ${rangTexte(s.general.rang)}` : ""}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[34rem] text-[13px]">
          <thead>
            <tr className="bg-accent text-left text-[11px] text-accent-fg">
              <th className="px-3 py-2 font-medium">Matière</th>
              <th className="px-2 py-2 text-center font-medium">Moyenne</th>
              <th className="px-2 py-2 text-center font-medium">Classe</th>
              {avecRang && <th className="px-2 py-2 text-center font-medium">Rang</th>}
              <th className="px-3 py-2 font-medium">Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {s.groupes.map((g) => (
              <Groupe key={g.nom} g={g} avecRang={avecRang} />
            ))}
          </tbody>
        </table>
      </div>

      {mentionLabel(s.mention) && (
        <p className="text-sm">
          <span className="text-muted">Mention : </span>
          <strong className="text-gold">{mentionLabel(s.mention)}</strong>
        </p>
      )}
      <div className="rounded-xl border border-gold/50 bg-gold-soft/40 p-4">
        <div className="mb-1 text-xs font-semibold">Appréciation générale</div>
        <p className="whitespace-pre-line text-sm leading-relaxed">{s.appreciation || "—"}</p>
      </div>
    </div>
  );
}

function Chiffres({ c, fort = false, avecRang }: { c: Synthese["general"]; fort?: boolean; avecRang: boolean }) {
  return (
    <>
      <td className={`px-2 py-1.5 text-center tabular-nums ${fort ? "font-semibold" : ""}`}>{note20(c.moy)}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-muted">{note20(c.moyClasse)}</td>
      {avecRang && <td className="px-2 py-1.5 text-center tabular-nums">{rangTexte(c.rang)}</td>}
    </>
  );
}

function Groupe({ g, avecRang }: { g: Synthese["groupes"][number]; avecRang: boolean }) {
  return (
    <>
      <tr className="border-t border-border bg-gold-soft/60 font-semibold">
        <td className="px-3 py-1.5">{g.nom}</td>
        <Chiffres c={g.chiffre} fort avecRang={avecRang} />
        <td />
      </tr>
      {g.matieres.map((m) => (
        <tr key={m.nom} className="border-t border-border/60 align-top">
          <td className="px-3 py-1.5 pl-5">
            <div>{m.nom}</div>
            {m.enseignants && <div className="text-[10.5px] text-muted">{m.enseignants}</div>}
          </td>
          <Chiffres c={m.chiffre} avecRang={avecRang} />
          <td className="px-3 py-1.5 text-[12.5px]">{m.commentaire}</td>
        </tr>
      ))}
    </>
  );
}
