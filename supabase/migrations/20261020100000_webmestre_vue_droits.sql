-- Webmestre : en basculant sa vue sur un profil, il en reçoit TOUS les droits en base (RLS et fonctions),
-- uniquement pour ce profil et uniquement lui. Additif : nouvelle table + nouvelles fonctions ;
-- mon_role() garde le même résultat pour tout autre compte.

create table if not exists public.webmestre_vue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profil text not null check (profil in ('president','tresorier','secretaire','administrateur','directrice',
                                          'directeur-spirituel','resp-mecenat','recherche-fonds')),
  depuis timestamptz not null default now()
);
alter table public.webmestre_vue enable row level security;
-- Aucune politique : lecture et écriture seulement par les fonctions ci-dessous.

/** Rôle réel du compte connecté (ancien corps de mon_role). */
create or replace function public.mon_role_reel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from profils where id = auth.uid() and actif),
    (select split_part(email, '@', 1) from auth.users
      where id = auth.uid() and email like '%@roles.esej'),
    'lecteur'
  );
$$;

/** Le Webmestre se reconnaît toujours à son rôle réel, même en vue basculée. */
create or replace function public.est_webmestre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from webmestre where profil = public.mon_role_reel());
$$;

/** Profil vers lequel le Webmestre a basculé (valable 12 h), sinon null. */
create or replace function public.ma_vue_webmestre() returns text
language sql stable security definer set search_path = public as $$
  select v.profil from webmestre_vue v
   where v.user_id = auth.uid() and v.depuis > now() - interval '12 hours'
     and exists (select 1 from webmestre w where w.profil = public.mon_role_reel());
$$;

/** Rôle effectif : celui de la vue du Webmestre, sinon le rôle réel. Toutes les règles s'appuient dessus. */
create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.ma_vue_webmestre(), public.mon_role_reel());
$$;

/** Bascule (ou retour, p_profil null) de la vue du Webmestre ; journalisée. */
create or replace function public.webmestre_vue_definir(p_profil text) returns text
language plpgsql security definer set search_path = public as $$
declare v_reel text := public.mon_role_reel(); v_ancien text := public.ma_vue_webmestre();
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  if p_profil is null or p_profil = v_reel then
    delete from webmestre_vue where user_id = auth.uid();
    if v_ancien is not null then
      insert into acces_historique (auteur, action, profil, ancien, nouveau) values (v_reel, 'vue Webmestre', v_reel, v_ancien, v_reel);
    end if;
    return null;
  end if;
  if p_profil not in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat','recherche-fonds') then
    raise exception 'Profil inconnu : %', p_profil;
  end if;
  insert into webmestre_vue (user_id, profil, depuis) values (auth.uid(), p_profil, now())
    on conflict (user_id) do update set profil = excluded.profil, depuis = excluded.depuis;
  if v_ancien is distinct from p_profil then
    insert into acces_historique (auteur, action, profil, ancien, nouveau)
      values (v_reel, 'vue Webmestre', p_profil, coalesce(v_ancien, v_reel), p_profil);
  end if;
  return p_profil;
end $$;

/** Contexte d'accès : pour le Webmestre, la vue enregistrée en base fait foi (p_vue gardé pour compatibilité). */
create or replace function public.acces_contexte(p_vue text default null, p_personne text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_web boolean := public.est_webmestre();
  v_vue text := public.ma_vue_webmestre();
  v_profil text := public.mon_role();
begin
  return jsonb_build_object(
    'webmestre', v_web,
    'profil_webmestre', (select profil from webmestre),
    'profil', v_profil,
    'vue', v_vue,
    'niveaux', coalesce((select jsonb_object_agg(a.cle, public.acces_niveau_de(v_profil, a.cle, p_personne)) from acces_pages a), '{}'::jsonb)
  );
end $$;

-- Journal et passation : toujours au nom du rôle réel.
create or replace function public.acces_journal(p_action text, p_profil text, p_page text, p_ancien text, p_nouveau text, p_detail text)
returns void language sql security definer set search_path = public as $$
  insert into acces_historique (auteur, action, profil, page, ancien, nouveau, detail)
  values (coalesce(public.mon_role_reel(), '?'), p_action, p_profil, p_page, p_ancien, p_nouveau, p_detail);
$$;

create or replace function public.webmestre_transmettre(p_profil text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ancien text;
begin
  select profil into v_ancien from webmestre for update;
  if v_ancien is distinct from public.mon_role_reel() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  if p_profil = v_ancien then raise exception 'Ce profil est déjà Webmestre'; end if;
  if p_profil not in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat') then
    raise exception 'Le Webmestre doit être un profil Administration';
  end if;
  delete from webmestre_vue;
  update webmestre set profil = p_profil, depuis = now();
  perform public.acces_journal('passation Webmestre', p_profil, null, v_ancien, p_profil, null);
end $$;

revoke all on function public.mon_role_reel(), public.ma_vue_webmestre(), public.webmestre_vue_definir(text) from public, anon;
grant execute on function public.mon_role_reel(), public.ma_vue_webmestre(), public.webmestre_vue_definir(text) to authenticated;
