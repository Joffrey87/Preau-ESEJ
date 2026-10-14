-- « Réservé à » (distinct du Responsable, qui reste porté par prospects.reserve_a / dons.contact_reserve_a) :
-- personne à qui le contact est réservé. Colonnes facultatives, additif ; aucune donnée existante modifiée.
alter table public.prospects add column if not exists reserve_pour text;
alter table public.dons add column if not exists reserve_pour text;

create or replace function public.definir_reserve_pour_prospect(p_id uuid, p_valeur text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.peut_suivre_donateurs() then raise exception 'Accès refusé'; end if;
  if length(btrim(coalesce(p_valeur, ''))) > 80 then raise exception 'Nom trop long (80 caractères au plus)'; end if;
  update public.prospects set reserve_pour = nullif(btrim(p_valeur), '') where id = p_id;
end;
$$;
revoke all on function public.definir_reserve_pour_prospect(uuid, text) from public, anon;
grant execute on function public.definir_reserve_pour_prospect(uuid, text) to authenticated;

create or replace function public.definir_reserve_pour_dons(p_ids uuid[], p_valeur text)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.peut_suivre_donateurs() then raise exception 'Accès refusé'; end if;
  if length(btrim(coalesce(p_valeur, ''))) > 80 then raise exception 'Nom trop long (80 caractères au plus)'; end if;
  update public.dons set reserve_pour = nullif(btrim(p_valeur), '') where id = any (p_ids) and supprime_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.definir_reserve_pour_dons(uuid[], text) from public, anon;
grant execute on function public.definir_reserve_pour_dons(uuid[], text) to authenticated;
