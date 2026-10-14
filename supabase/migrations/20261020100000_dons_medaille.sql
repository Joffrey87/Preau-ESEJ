-- 20/10/2026 — Dons : colonne « Médaille » (la médaille est posée sur le tableau physique des dons de l'école).
-- Additif. Écriture par RPC : Trésorier, Directrice, Directeur spirituel. Pas pour les dons boursiers.
alter table public.dons add column if not exists medaille_affichee boolean not null default false;
alter table public.dons add column if not exists medaille_par text;
alter table public.dons add column if not exists medaille_le timestamptz;

create or replace function public.definir_medaille_don(p_id uuid, p_affichee boolean, p_par text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if public.mon_role() is null or public.mon_role() not in ('tresorier', 'directrice', 'directeur-spirituel') then
    raise exception 'Accès refusé';
  end if;
  update public.dons
     set medaille_affichee = coalesce(p_affichee, false),
         medaille_par = case when coalesce(p_affichee, false)
                             then coalesce(nullif(btrim(p_par), ''), public.mon_role()) end,
         medaille_le = case when coalesce(p_affichee, false) then now() end
   where id = p_id and coalesce(don_boursier, false) = false;
  if not found then
    raise exception 'Don introuvable ou don boursier';
  end if;
end;
$$;
revoke all on function public.definir_medaille_don(uuid, boolean, text) from public, anon;
grant execute on function public.definir_medaille_don(uuid, boolean, text) to authenticated;
