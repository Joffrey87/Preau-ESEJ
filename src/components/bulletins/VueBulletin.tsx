"use client";

import { classeEleve, dateJJMMAAAA, mentionLabel, note20, rangTexte, titreDocument, type Synthese } from "@/lib/bulletins";
import { texteAbsences } from "@/lib/absences";
import { tauxTexte } from "@/lib/calendrier";

/** Bulletin tel que la famille le lit (synthèse figée) : même présentation que le PDF. */
export default function VueBulletin({ s }: { s: Synthese }) {
  const releve = s.mode === "releve";
  const avecClasse = !s.mode;
  const avecRang = s.afficherRang && avecClasse;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-gold">{titreDocument(s)}</div>
          {!s.mode && s.periode.numero && <div className="text-[11px] text-muted">{s.periode.libelle}</div>}
          <h2 className="text-lg font-semibold">
            {s.eleve.prenom} {s.eleve.nom}
          </h2>
          <div className="text-xs text-muted">
            {/* La classe de l'élève seule (son niveau), jamais le regroupement de classes. */}
            {classeEleve(s)}
            {s.mode === "trimestre" && s.eleve.naissance ? ` · Né(e) le ${dateJJMMAAAA(s.eleve.naissance)}` : ""}
            {s.classe.titulaire ? ` · Titulaire : ${s.classe.titulaire}` : ""}
          </div>
        </div>
        {s.general.moy !== null && !releve && (
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted">Moyenne générale</div>
            <div className="text-xl font-semibold tabular-nums text-accent">{note20(s.general.moy)}</div>
            <div className={`text-[11px] text-muted ${avecClasse ? "" : "hidden"}`}>
              Classe {note20(s.general.moyClasse)}
              {avecRang && s.general.rang ? ` · ${rangTexte(s.general.rang)}` : ""}
            </div>
          </div>
        )}
      </div>

      {/* Sans notes (grande section) : pas de tableau, seulement les appréciations. */}
      {s.groupes.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[34rem] text-[13px]">
            <thead>
              <tr className="bg-accent text-left text-[11px] text-accent-fg">
                <th className="px-3 py-2 font-medium">Matière</th>
                {!releve && <th className="px-2 py-2 text-center font-medium">Moyenne</th>}
                {avecClasse && <th className="px-2 py-2 text-center font-medium">Classe</th>}
                {avecRang && <th className="px-2 py-2 text-center font-medium">Rang</th>}
                <th className="px-3 py-2 font-medium">{releve ? "Notes de la période" : "Appréciation"}</th>
              </tr>
            </thead>
            <tbody>
              {s.groupes.map((g) => (
                <Groupe key={g.nom} g={g} avecRang={avecRang} releve={releve} avecClasse={avecClasse} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.absences && (
        <p className="text-sm">
          <span className="text-muted">Absences : </span>
          {texteAbsences(s.absences)}
        </p>
      )}
      {s.presentiel !== undefined && s.presentiel !== null && (
        <p className="text-sm">
          <span className="text-muted">Taux de présentiel : </span>
          {tauxTexte(s.presentiel)}
        </p>
      )}
      {mentionLabel(s.mention) && (
        <p className="text-sm">
          <span className="text-muted">Mention : </span>
          <strong className="text-gold">{mentionLabel(s.mention)}</strong>
        </p>
      )}
      {!!s.rubriques?.length && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
          {s.rubriques.map((x) => (
            <div key={x.titre}>
              <div className="text-xs font-semibold">{x.titre}</div>
              <p className="whitespace-pre-line text-sm leading-relaxed">{x.texte}</p>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-gold/50 bg-gold-soft/40 p-4">
        <div className="mb-1 text-xs font-semibold">{s.mode === "trimestre" ? "Appréciation du trimestre" : "Appréciation générale"}</div>
        <p className="whitespace-pre-line text-sm leading-relaxed">{s.appreciation || "—"}</p>
      </div>
    </div>
  );
}

function Chiffres({
  c,
  fort = false,
  avecRang,
  releve = false,
  avecClasse = true,
  vide = false,
}: {
  c: Synthese["general"];
  fort?: boolean;
  avecRang: boolean;
  releve?: boolean;
  avecClasse?: boolean;
  /** Appréciation seule (Catéchisme) : colonnes chiffrées laissées vides. */
  vide?: boolean;
}) {
  if (releve) return null;
  if (vide)
    return (
      <>
        <td />
        {avecClasse && <td />}
        {avecRang && <td />}
      </>
    );
  return (
    <>
      <td className={`px-2 py-1.5 text-center tabular-nums ${fort ? "font-semibold" : ""}`}>{note20(c.moy)}</td>
      {avecClasse && <td className="px-2 py-1.5 text-center tabular-nums text-muted">{note20(c.moyClasse)}</td>}
      {avecRang && <td className="px-2 py-1.5 text-center tabular-nums">{rangTexte(c.rang)}</td>}
    </>
  );
}

function Groupe({ g, avecRang, releve, avecClasse }: { g: Synthese["groupes"][number]; avecRang: boolean; releve: boolean; avecClasse: boolean }) {
  return (
    <>
      <tr className="border-t border-border bg-gold-soft/60 font-semibold">
        <td className="px-3 py-1.5">{g.nom}</td>
        <Chiffres c={g.chiffre} fort avecRang={avecRang} releve={releve} vide={g.matieres.every((m) => m.appreciationSeule)} avecClasse={avecClasse} />
        <td />
      </tr>
      {g.matieres.map((m) => (
        <tr key={m.nom} className="border-t border-border/60 align-top">
          <td className="px-3 py-1.5 pl-5">
            <div>{m.nom}</div>
            {m.enseignants && <div className="text-[10.5px] text-muted">{m.enseignants}</div>}
          </td>
          <Chiffres c={m.chiffre} avecRang={avecRang} releve={releve} vide={!!m.appreciationSeule} avecClasse={avecClasse} />
          <td className="px-3 py-1.5 text-[12.5px]">{m.commentaire}</td>
        </tr>
      ))}
    </>
  );
}
