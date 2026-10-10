-- 10/10/2026 — « Ne souhaite pas être sollicité » : indicateur porté par chacun des dons du donateur (comme « Donateur
-- Bourse »). Ces donateurs sont exclus des exports de Relations donateurs, des campagnes et des actions suggérées.
-- Simple indicateur, sans donnée personnelle : il reste en clair. Écriture réservée à la Recherche de fonds et au bureau.

alter table public.dons add column if not exists ne_pas_solliciter boolean not null default false;

create or replace function public.definir_ne_pas_solliciter(p_ids uuid[], p_valeur boolean)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if public.mon_role() not in ('recherche-fonds', 'resp-mecenat', 'tresorier', 'president', 'administrateur') then
    raise exception 'Accès refusé';
  end if;
  update public.dons set ne_pas_solliciter = coalesce(p_valeur, false)
   where id = any (p_ids) and supprime_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.definir_ne_pas_solliciter(uuid[], boolean) from public, anon;
grant execute on function public.definir_ne_pas_solliciter(uuid[], boolean) to authenticated;
