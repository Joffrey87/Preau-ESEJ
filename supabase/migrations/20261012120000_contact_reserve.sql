-- 12/10/2026 — « Contact réservé à » : le donateur ne doit être contacté que par la personne désignée (membre de la
-- Recherche de fonds ou du bureau). Indicateur porté par chacun des dons du donateur (comme « ne pas solliciter »),
-- sans donnée personnelle : il reste en clair. Écriture réservée à la Recherche de fonds et au bureau.

alter table public.dons add column if not exists contact_reserve_a text;

create or replace function public.definir_contact_reserve(p_ids uuid[], p_valeur text)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if public.mon_role() not in ('recherche-fonds', 'resp-mecenat', 'tresorier', 'president', 'administrateur') then
    raise exception 'Accès refusé';
  end if;
  update public.dons set contact_reserve_a = nullif(btrim(p_valeur), '')
   where id = any (p_ids) and supprime_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.definir_contact_reserve(uuid[], text) from public, anon;
grant execute on function public.definir_contact_reserve(uuid[], text) to authenticated;
