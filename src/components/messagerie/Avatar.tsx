import { initiales, profil, type Participant } from "@/lib/messagerie";

/** Rond de couleur du profil, avec initiales. */
export function Avatar({ p, taille = "md" }: { p: Pick<Participant, "type" | "libelle">; taille?: "sm" | "md" | "lg" }) {
  const t = taille === "sm" ? "h-7 w-7 text-[10px]" : taille === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-[11px]";
  return (
    <span title={`${p.libelle} · ${profil(p.type).label}`} className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${t} ${profil(p.type).avatar}`}>
      {initiales(p.libelle)}
    </span>
  );
}

/** Pastille du type de profil (Famille, Trésorier, Événement…). */
export function PastilleProfil({ type, className = "" }: { type: string; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium leading-4 ${profil(type).pastille} ${className}`}>{profil(type).label}</span>;
}

/** Avatars empilés d'un groupe. */
export function AvatarsGroupe({ membres }: { membres: Participant[] }) {
  const vus = membres.slice(0, 2);
  if (vus.length < 2) return vus[0] ? <Avatar p={vus[0]} /> : <span className="h-9 w-9 rounded-full bg-surface-2" />;
  return (
    <span className="relative inline-block h-9 w-9 shrink-0">
      <span className="absolute left-0 top-0 scale-[0.8] origin-top-left"><Avatar p={vus[0]} taille="sm" /></span>
      <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-surface"><Avatar p={vus[1]} taille="sm" /></span>
    </span>
  );
}
