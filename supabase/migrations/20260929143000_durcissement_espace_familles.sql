-- Durcissement après l'audit Supabase (29/09/2026).
-- Fonctions SECURITY DEFINER : jamais exécutables sans connexion.
revoke execute on function public.espace_famille() from anon, public;
revoke execute on function public.rattacher_compte_famille(text, text) from anon, public;
revoke execute on function public.est_admin() from anon;
revoke execute on function public.est_bureau() from anon;
revoke execute on function public.est_tresorier() from anon;
revoke execute on function public.gere_scolarite() from anon;
revoke execute on function public.ma_famille() from anon;
revoke execute on function public.mon_role() from anon;
revoke execute on function public.peut_voir_sensible() from anon;
grant execute on function public.espace_famille() to authenticated;
grant execute on function public.rattacher_compte_famille(text, text) to authenticated;
alter function public.mode_don_depuis_compta(text) set search_path = public;
alter function public.mode_compta_depuis_don(text, text) set search_path = public;
alter function public.unaccent_simple(text) set search_path = public;
alter function public.mecenat_stats() set search_path = public;

-- Les signatures du bucket « modeles » ne se lisent qu'au bureau.
drop policy if exists modeles_lecture on storage.objects;
create policy modeles_lecture on storage.objects for select to authenticated
  using (bucket_id = 'modeles' and public.est_bureau());

-- Coordonnées de l'association (en-tête des attestations) pour l'espace famille.
create or replace function public.association_espace()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.ma_famille() is null then null else (
    select jsonb_build_object('adresse_rue', adresse_rue, 'adresse_cp_ville', adresse_cp_ville,
                              'tresorier_nom', tresorier_nom, 'courriel_contact', courriel_contact)
      from modele_recu where id = 1) end
$$;
revoke execute on function public.association_espace() from anon, public;
grant execute on function public.association_espace() to authenticated;
