-- Correctif : la politique « com pj lecture » interrogeait com_messages / com_participants avec les droits
-- de l'appelant (aucun accès direct) → « permission denied for table com_messages » sur TOUTE lecture du
-- stockage (signatures des reçus fiscaux, photos, etc.). La vérification passe par une fonction définie
-- avec les droits du propriétaire ; la règle d'accès est inchangée.

create or replace function public.com_peut_lire_pj(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.com_messages m join public.com_participants p on p.fil_id = m.fil_id
     where m.pj @> jsonb_build_array(jsonb_build_object('path', p_path))
       and p.boite_id in (select public.com_mes_boites()));
$$;
revoke execute on function public.com_peut_lire_pj(text) from public, anon;
grant execute on function public.com_peut_lire_pj(text) to authenticated;

drop policy if exists "com pj lecture" on storage.objects;
create policy "com pj lecture" on storage.objects for select to authenticated
  using (bucket_id = 'messagerie' and (
    (storage.foldername(name))[1] in (select x::text from public.com_mes_boites() x)
    or public.com_peut_lire_pj(name)));
