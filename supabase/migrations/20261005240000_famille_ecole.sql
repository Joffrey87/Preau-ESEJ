-- 05/10/2026 — Caractéristique « Famille » : donateurs et contacts qui sont (ou ont été) des familles de l'école.
--  - dons.famille_statut     : 'actuelle' (inscrite à l'année scolaire en cours) ou 'ancienne' (inscrite avant) ;
--                              copie portée par chacun des dons du donateur, comme « Donateur Bourse ».
--  - contacts.famille_statut : même valeur pour une fiche du carnet d'adresses.
-- Simple repère, sans donnée personnelle : en clair. Écriture sur les dons par fonction réservée aux
-- mêmes rôles que « Donateur Bourse » (la Recherche de fonds ne peut modifier que des indicateurs).

alter table public.dons add column if not exists famille_statut text
  check (famille_statut in ('actuelle', 'ancienne'));
alter table public.contacts add column if not exists famille_statut text
  check (famille_statut in ('actuelle', 'ancienne'));

create or replace function public.definir_famille(p_ids uuid[], p_statut text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if public.mon_role() not in ('recherche-fonds', 'resp-mecenat', 'tresorier', 'president', 'administrateur') then
    raise exception 'Accès refusé';
  end if;
  if p_statut is not null and p_statut not in ('actuelle', 'ancienne') then
    raise exception 'Statut inconnu';
  end if;
  update public.dons set famille_statut = p_statut where id = any (p_ids) and supprime_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.definir_famille(uuid[], text) from public, anon;
grant execute on function public.definir_famille(uuid[], text) to authenticated;
