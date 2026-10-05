-- 05/10/2026 — « Donateur Bourse » / « Don boursier » : dons faits pour payer des bourses de frais de scolarité,
-- et non pour financer l'école.
--  - dons.donateur_bourse : le donateur est un donateur « bourse » (copie portée par chacun de ses dons) ;
--  - dons.don_boursier    : ce don précis est un don boursier (un donateur peut faire les deux sortes de dons).
-- Ce sont de simples indicateurs, sans donnée personnelle : ils restent en clair (la jauge des dons et le profil
-- Recherche de fonds les lisent sans coffre). Seul droit d'écriture des membres Recherche de fonds : ces deux champs.

alter table public.dons add column if not exists donateur_bourse boolean not null default false;
alter table public.dons add column if not exists don_boursier boolean not null default false;

create or replace function public.definir_boursier(
  p_ids uuid[],
  p_donateur_bourse boolean default null,
  p_don_boursier boolean default null
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if public.mon_role() not in ('recherche-fonds', 'resp-mecenat', 'tresorier', 'president', 'administrateur') then
    raise exception 'Accès refusé';
  end if;
  update public.dons
     set donateur_bourse = coalesce(p_donateur_bourse, donateur_bourse),
         don_boursier = coalesce(p_don_boursier, don_boursier)
   where id = any (p_ids) and supprime_le is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.definir_boursier(uuid[], boolean, boolean) from public, anon;
grant execute on function public.definir_boursier(uuid[], boolean, boolean) to authenticated;

-- Jauge des dons : les écritures « Don » reliées à un don boursier n'y comptent pas.
create or replace function public.dons_exercice_courant()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.peut_voir_pipeline() then null else (
    select jsonb_build_object(
      'exercice', e.libelle,
      'debut', e.date_debut,
      'fin', e.date_fin,
      'dons', coalesce((
        select jsonb_agg(jsonb_build_object('date', o.date_operation, 'montant', o.montant) order by o.date_operation)
          from operations o join categories c on c.id = o.categorie_id
         where o.exercice_id = e.id and c.nom = 'Don' and o.type = 'recette'
           and not coalesce(o.est_ventilee, false)
           and not exists (select 1 from operations f where f.parent_id = o.id)
           and not exists (select 1 from dons d where d.operation_id = o.id and d.don_boursier and d.supprime_le is null)
      ), '[]'::jsonb))
    from exercices e
    where (now() at time zone 'Europe/Paris')::date between e.date_debut and e.date_fin
    limit 1)
  end
$$;
