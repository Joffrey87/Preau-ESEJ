-- Messagerie interne (Communication) : conversations 1:1 et groupes entre tous les profils de Préau.
-- Additive : nouvelles tables msg_*, fonctions msg_*, bucket privé « messagerie », page /messagerie au catalogue Webmestre.
-- Sécurité : RLS activée sans politique de lecture directe sur les tables msg_* (sauf msg_signaux, sans contenu) ;
-- tout passe par des fonctions security definer qui identifient le participant à partir de la session.
--
-- Identité d'un participant (clé texte) :
--   role:<slug>        profil Administration partagé (Trésorier, Président, Directrice…) ; affiché avec son titulaire
--   rf:<prénom>        Recherche de fonds (compte partagé + prénom de la visite)
--   famille:<uuid>     compte famille (profils.role = 'famille')
--   ev:<uuid>          membre Événement (evenement_membres.user_id)
--   prof:<uuid>        professeur (enseignants.user_id)

create table if not exists public.msg_conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','groupe')),
  titre text,
  description text,
  cle_direct text unique,
  cree_par text not null,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  supprimee_le timestamptz
);

create table if not exists public.msg_membres (
  conversation uuid not null references public.msg_conversations(id) on delete cascade,
  participant text not null,
  admin boolean not null default false,
  bloque boolean not null default false,
  sourdine boolean not null default false,
  lu_jusqua timestamptz,
  ajoute_le timestamptz not null default now(),
  primary key (conversation, participant)
);
create index if not exists msg_membres_participant on public.msg_membres(participant);

create table if not exists public.msg_messages (
  id uuid primary key default gen_random_uuid(),
  conversation uuid not null references public.msg_conversations(id) on delete cascade,
  auteur text not null,
  auteur_libelle text not null default '',
  corps text not null default '',
  pj jsonb not null default '[]'::jsonb,
  cree_le timestamptz not null default now(),
  masque boolean not null default false,
  supprime boolean not null default false,
  modere_par text
);
create index if not exists msg_messages_conv on public.msg_messages(conversation, cree_le desc);

-- Utilisateurs bloqués par la modération (ne peuvent plus écrire).
create table if not exists public.msg_blocages (
  participant text primary key,
  par text not null,
  motif text,
  le timestamptz not null default now()
);

-- Blocage personnel : « je ne veux plus recevoir de messages directs de … ».
create table if not exists public.msg_blocages_perso (
  bloqueur text not null,
  bloque text not null,
  le timestamptz not null default now(),
  primary key (bloqueur, bloque)
);

create table if not exists public.msg_moderation (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  auteur text not null,
  action text not null,
  conversation uuid,
  message uuid,
  cible text,
  detail text
);

-- Signal sans contenu pour le temps réel (Supabase Realtime) : « cette conversation a bougé ».
create table if not exists public.msg_signaux (
  conversation uuid primary key references public.msg_conversations(id) on delete cascade,
  maj timestamptz not null default now()
);

alter table public.msg_conversations enable row level security;
alter table public.msg_membres enable row level security;
alter table public.msg_messages enable row level security;
alter table public.msg_blocages enable row level security;
alter table public.msg_blocages_perso enable row level security;
alter table public.msg_moderation enable row level security;
alter table public.msg_signaux enable row level security;

-- ───────────── Identité ─────────────

create or replace function public.msg_prenoms_recherche() returns text[]
language sql stable security definer set search_path = public as $$
  select array(select distinct lower(btrim(x)) from (
    select unnest(array['Alexis','Axel','Baptiste','Joffrey','Pierre-Emmanuel','Pierre-Louis']) x
    union select membre_recherche from familles where membre_recherche is not null
    union select prenom_recherche from acces_personnes where prenom_recherche is not null) s where btrim(x) <> '');
$$;

/** Clé du participant connecté. p_prenom : prénom de visite (Recherche de fonds). */
create or replace function public.msg_cle(p_prenom text default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.mon_role(); v_id uuid;
begin
  if auth.uid() is null then return null; end if;
  if v_role = 'famille' then
    select famille_id into v_id from profils where id = auth.uid() and role = 'famille' and actif;
    return case when v_id is not null then 'famille:' || v_id end;
  end if;
  select id into v_id from enseignants where user_id = auth.uid() and actif;
  if v_id is not null then return 'prof:' || v_id; end if;
  select id into v_id from evenement_membres where user_id = auth.uid() and coalesce(actif, true);
  if v_id is not null then return 'ev:' || v_id; end if;
  if v_role = 'recherche-fonds' then
    if p_prenom is not null and lower(btrim(p_prenom)) = any(public.msg_prenoms_recherche()) then
      return 'rf:' || lower(btrim(p_prenom));
    end if;
    return null;
  end if;
  if v_role in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat') then
    return 'role:' || v_role;
  end if;
  return null;
end $$;

/** Toutes les clés que la session peut porter (compte partagé Recherche de fonds : tous ses prénoms). Sert au stockage et au temps réel. */
create or replace function public.msg_mes_cles() returns text[]
language sql stable security definer set search_path = public as $$
  select case when public.mon_role() = 'recherche-fonds'
    then array(select 'rf:' || p from unnest(public.msg_prenoms_recherche()) p)
    else array_remove(array[public.msg_cle(null)], null) end;
$$;

create or replace function public.msg_est_moderateur() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mon_role() in ('directrice','president') or public.est_webmestre();
$$;

create or replace function public.msg_libelle_role(p_slug text) returns text
language sql immutable as $$
  select case p_slug when 'president' then 'Président' when 'tresorier' then 'Trésorier' when 'secretaire' then 'Secrétaire'
    when 'administrateur' then 'Administrateur' when 'directrice' then 'Directrice' when 'directeur-spirituel' then 'Directeur spirituel'
    when 'resp-mecenat' then 'Resp. Mécénat' else p_slug end;
$$;

/** Fiche d'affichage d'un participant : type (pastille), libellé, détail (titulaire, famille…). */
create or replace function public.msg_info(p_cle text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_t text := split_part(p_cle, ':', 1); v_r text := substr(p_cle, length(split_part(p_cle, ':', 1)) + 2); v jsonb;
begin
  if v_t = 'role' then
    select jsonb_build_object('type', v_r, 'libelle', public.msg_libelle_role(v_r), 'detail', p.nom)
      into v from (select 1) x left join acces_titulaires t on t.profil = v_r left join acces_personnes p on p.id = t.personne;
  elsif v_t = 'rf' then
    v := jsonb_build_object('type', 'recherche-fonds', 'libelle', initcap(v_r), 'detail',
      coalesce((select 'Famille ' || nom from familles where lower(membre_recherche) = v_r limit 1), 'Recherche de fonds'));
  elsif v_t = 'famille' then
    select jsonb_build_object('type', 'famille', 'libelle', 'Famille ' || nom,
      'detail', nullif(concat_ws(' et ', nullif(parent1_prenom, ''), nullif(parent2_prenom, '')), ''))
      into v from familles where id::text = v_r;
  elsif v_t = 'ev' then
    select jsonb_build_object('type', 'evenement', 'libelle', libelle, 'detail', nullif(concat_ws(' ', prenom, nom), ''))
      into v from evenement_membres where id::text = v_r;
  elsif v_t = 'prof' then
    select jsonb_build_object('type', 'professeur', 'libelle', btrim(coalesce(civilite || ' ', '') || prenom || ' ' || nom), 'detail', 'Professeur')
      into v from enseignants where id::text = v_r;
  end if;
  return coalesce(v, jsonb_build_object('type', 'inconnu', 'libelle', 'Participant inconnu', 'detail', null)) || jsonb_build_object('cle', p_cle);
end $$;

create or replace function public.msg_moi(p_prenom text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom);
begin
  if v_cle is null then return null; end if;
  return public.msg_info(v_cle) || jsonb_build_object('moderateur', public.msg_est_moderateur(),
    'bloque', exists (select 1 from msg_blocages where participant = v_cle));
end $$;

/** Annuaire : toutes les personnes joignables (familles avec un compte d'abord). */
create or replace function public.msg_annuaire(p_prenom text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom);
begin
  if v_cle is null then raise exception 'Session inconnue' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(public.msg_info(c) || jsonb_build_object('ordre', o) order by o, public.msg_info(c)->>'libelle')
    from (
      select 'famille:' || f.id as c, 1 as o from familles f
        where exists (select 1 from profils p where p.famille_id = f.id and p.role = 'famille' and p.actif)
      union select 'role:' || r, 0 from unnest(array['president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat']) r
      union select 'rf:' || p, 2 from unnest(public.msg_prenoms_recherche()) p
      union select 'ev:' || id, 3 from evenement_membres where user_id is not null and coalesce(actif, true)
      union select 'prof:' || id, 4 from enseignants where user_id is not null and actif
    ) s where c <> v_cle), '[]'::jsonb);
end $$;

-- ───────────── Outils internes ─────────────

create or replace function public.msg_signaler(p_conv uuid) returns void
language sql security definer set search_path = public as $$
  insert into msg_signaux (conversation, maj) values (p_conv, now()) on conflict (conversation) do update set maj = now();
$$;

create or replace function public.msg_journal(p_auteur text, p_action text, p_conv uuid, p_msg uuid, p_cible text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into msg_moderation (auteur, action, conversation, message, cible, detail) values (p_auteur, p_action, p_conv, p_msg, p_cible, p_detail);
$$;

create or replace function public.msg_membre(p_conv uuid, p_cle text) returns msg_membres
language sql stable security definer set search_path = public as $$
  select m.* from msg_membres m join msg_conversations c on c.id = m.conversation
  where m.conversation = p_conv and m.participant = p_cle and c.supprimee_le is null;
$$;

-- ───────────── Lecture ─────────────

/** Conversations du participant (p_tout : toutes, pour la modération). */
create or replace function public.msg_conversations_liste(p_prenom text default null, p_tout boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); v_mod boolean := public.msg_est_moderateur();
begin
  if v_cle is null then raise exception 'Session inconnue' using errcode = '42501'; end if;
  if p_tout and not v_mod then raise exception 'Réservé à la modération' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'dernier_le' desc nulls last) from (
    select jsonb_build_object(
      'id', c.id, 'type', c.type, 'titre', c.titre, 'description', c.description, 'cree_par', c.cree_par,
      'moi_membre', me.participant is not null, 'admin', coalesce(me.admin, false), 'sourdine', coalesce(me.sourdine, false),
      'bloque', coalesce(me.bloque, false),
      'membres', (select jsonb_agg(public.msg_info(m.participant) || jsonb_build_object('admin', m.admin, 'bloque', m.bloque) order by m.admin desc, m.ajoute_le)
                  from msg_membres m where m.conversation = c.id),
      'dernier', (select jsonb_build_object('auteur', d.auteur, 'auteur_libelle', d.auteur_libelle,
                   'corps', case when d.supprime then 'Message supprimé' when d.masque and not v_mod then 'Message masqué par la modération' else left(d.corps, 140) end,
                   'pj', jsonb_array_length(d.pj))
                  from msg_messages d where d.conversation = c.id order by d.cree_le desc limit 1),
      'dernier_le', coalesce((select max(cree_le) from msg_messages where conversation = c.id), c.cree_le),
      'non_lus', case when me.participant is null then 0 else (select count(*) from msg_messages n where n.conversation = c.id
                   and n.auteur <> v_cle and not n.supprime and not n.masque and n.cree_le > coalesce(me.lu_jusqua, '-infinity')) end
    ) x
    from msg_conversations c
    left join msg_membres me on me.conversation = c.id and me.participant = v_cle
    where c.supprimee_le is null and (me.participant is not null or p_tout)
      and (c.type = 'groupe' or exists (select 1 from msg_messages where conversation = c.id) or c.cree_par = v_cle)
  ) s), '[]'::jsonb);
end $$;

create or replace function public.msg_messages_liste(p_conv uuid, p_prenom text default null, p_avant timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); v_mod boolean := public.msg_est_moderateur(); m msg_membres;
begin
  m := public.msg_membre(p_conv, v_cle);
  if m.participant is null and not v_mod then raise exception 'Conversation inaccessible' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'cree_le') from (
    select jsonb_build_object('id', g.id, 'auteur', g.auteur, 'auteur_libelle', g.auteur_libelle,
      'type', public.msg_info(g.auteur)->>'type', 'cree_le', g.cree_le, 'masque', g.masque, 'supprime', g.supprime,
      'corps', case when g.supprime then '' when g.masque and not (v_mod or coalesce(m.admin, false) or g.auteur = v_cle) then '' else g.corps end,
      'pj', case when g.supprime or (g.masque and not (v_mod or coalesce(m.admin, false))) then '[]'::jsonb else g.pj end) x
    from msg_messages g where g.conversation = p_conv and (p_avant is null or g.cree_le < p_avant)
    order by g.cree_le desc limit 200) s), '[]'::jsonb);
end $$;

create or replace function public.msg_non_lus(p_prenom text default null) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select count(*)::int from msg_messages n
    join msg_membres me on me.conversation = n.conversation and me.participant = public.msg_cle(p_prenom)
    join msg_conversations c on c.id = n.conversation and c.supprimee_le is null
    where not me.sourdine and n.auteur <> me.participant and not n.supprime and not n.masque
      and n.cree_le > coalesce(me.lu_jusqua, '-infinity')), 0);
$$;

create or replace function public.msg_marquer_lu(p_conv uuid, p_prenom text default null) returns void
language sql security definer set search_path = public as $$
  update msg_membres set lu_jusqua = now() where conversation = p_conv and participant = public.msg_cle(p_prenom);
$$;

-- ───────────── Écriture ─────────────

create or replace function public.msg_ouvrir_direct(p_cible text, p_prenom text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); v_paire text; v_id uuid;
begin
  if v_cle is null then raise exception 'Session inconnue' using errcode = '42501'; end if;
  if p_cible = v_cle then raise exception 'Impossible de s''écrire à soi-même.'; end if;
  if (public.msg_info(p_cible)->>'type') = 'inconnu' then raise exception 'Destinataire inconnu.'; end if;
  v_paire := least(v_cle, p_cible) || '|' || greatest(v_cle, p_cible);
  select id into v_id from msg_conversations where cle_direct = v_paire;
  if v_id is null then
    insert into msg_conversations (type, cle_direct, cree_par) values ('direct', v_paire, v_cle) returning id into v_id;
    insert into msg_membres (conversation, participant, lu_jusqua) values (v_id, v_cle, now()), (v_id, p_cible, null);
  else
    update msg_conversations set supprimee_le = null where id = v_id;
    insert into msg_membres (conversation, participant) values (v_id, v_cle), (v_id, p_cible) on conflict do nothing;
  end if;
  return v_id;
end $$;

create or replace function public.msg_creer_groupe(p_titre text, p_membres text[], p_prenom text default null, p_description text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); v_id uuid; c text;
begin
  if v_cle is null then raise exception 'Session inconnue' using errcode = '42501'; end if;
  if exists (select 1 from msg_blocages where participant = v_cle) then raise exception 'Votre messagerie est bloquée par la modération.'; end if;
  if coalesce(btrim(p_titre), '') = '' then raise exception 'Donnez un nom au groupe.'; end if;
  insert into msg_conversations (type, titre, description, cree_par) values ('groupe', btrim(p_titre), nullif(btrim(p_description), ''), v_cle) returning id into v_id;
  insert into msg_membres (conversation, participant, admin, lu_jusqua) values (v_id, v_cle, true, now());
  foreach c in array coalesce(p_membres, '{}') loop
    if c <> v_cle and (public.msg_info(c)->>'type') <> 'inconnu' then
      insert into msg_membres (conversation, participant) values (v_id, c) on conflict do nothing;
    end if;
  end loop;
  perform public.msg_journal(v_cle, 'groupe créé', v_id, null, null, btrim(p_titre));
  perform public.msg_signaler(v_id);
  return v_id;
end $$;

create or replace function public.msg_envoyer(p_conv uuid, p_corps text, p_pj jsonb default '[]'::jsonb, p_prenom text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); m msg_membres; c msg_conversations; v_id uuid; v_info jsonb; v_autre text; e jsonb;
begin
  m := public.msg_membre(p_conv, v_cle);
  if m.participant is null then raise exception 'Vous ne faites pas partie de cette conversation.' using errcode = '42501'; end if;
  if m.bloque then raise exception 'Un administrateur du groupe vous empêche d''écrire ici.'; end if;
  if exists (select 1 from msg_blocages where participant = v_cle) then raise exception 'Votre messagerie est bloquée par la modération.'; end if;
  select * into c from msg_conversations where id = p_conv;
  if c.type = 'direct' then
    select participant into v_autre from msg_membres where conversation = p_conv and participant <> v_cle limit 1;
    if exists (select 1 from msg_blocages_perso where bloqueur = v_autre and bloque = v_cle) then raise exception 'Ce destinataire ne reçoit plus vos messages.'; end if;
  end if;
  p_pj := coalesce(p_pj, '[]'::jsonb);
  if jsonb_typeof(p_pj) <> 'array' or jsonb_array_length(p_pj) > 10 then raise exception 'Pièces jointes invalides.'; end if;
  for e in select * from jsonb_array_elements(p_pj) loop
    if coalesce(e->>'path', '') not like p_conv::text || '/%' then raise exception 'Pièce jointe invalide.'; end if;
  end loop;
  if coalesce(btrim(p_corps), '') = '' and jsonb_array_length(p_pj) = 0 then raise exception 'Message vide.'; end if;
  v_info := public.msg_info(v_cle);
  insert into msg_messages (conversation, auteur, auteur_libelle, corps, pj)
    values (p_conv, v_cle, concat_ws(' · ', v_info->>'libelle', v_info->>'detail'), left(coalesce(p_corps, ''), 8000), p_pj)
    returning id into v_id;
  update msg_conversations set maj_le = now() where id = p_conv;
  update msg_membres set lu_jusqua = now() where conversation = p_conv and participant = v_cle;
  perform public.msg_signaler(p_conv);
  return v_id;
end $$;

/** Gestion d'un groupe par ses administrateurs (quitter / sourdine : chacun pour soi). */
create or replace function public.msg_groupe_action(p_conv uuid, p_action text, p_cible text default null, p_valeur text default null, p_prenom text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); m msg_membres; c msg_conversations; v_mod boolean := public.msg_est_moderateur();
begin
  select * into c from msg_conversations where id = p_conv and supprimee_le is null;
  if c.id is null then raise exception 'Conversation introuvable.'; end if;
  m := public.msg_membre(p_conv, v_cle);
  if p_action = 'sourdine' then
    update msg_membres set sourdine = (p_valeur = 'oui') where conversation = p_conv and participant = v_cle; return;
  elsif p_action = 'quitter' then
    if c.type <> 'groupe' then raise exception 'On ne quitte qu''un groupe.'; end if;
    delete from msg_membres where conversation = p_conv and participant = v_cle;
    -- Dernier administrateur parti : le plus ancien membre le devient.
    if not exists (select 1 from msg_membres where conversation = p_conv and admin) then
      update msg_membres set admin = true where conversation = p_conv
        and participant = (select participant from msg_membres where conversation = p_conv order by ajoute_le limit 1);
    end if;
    perform public.msg_journal(v_cle, 'a quitté le groupe', p_conv, null, v_cle, null);
    perform public.msg_signaler(p_conv); return;
  end if;
  if c.type <> 'groupe' then raise exception 'Action réservée aux groupes.'; end if;
  if not (coalesce(m.admin, false) or v_mod) then raise exception 'Réservé aux administrateurs du groupe.' using errcode = '42501'; end if;
  if p_action = 'renommer' then
    if coalesce(btrim(p_valeur), '') = '' then raise exception 'Nom vide.'; end if;
    update msg_conversations set titre = btrim(p_valeur), maj_le = now() where id = p_conv;
  elsif p_action = 'description' then
    update msg_conversations set description = nullif(btrim(p_valeur), ''), maj_le = now() where id = p_conv;
  elsif p_action = 'ajouter' then
    if (public.msg_info(p_cible)->>'type') = 'inconnu' then raise exception 'Participant inconnu.'; end if;
    insert into msg_membres (conversation, participant) values (p_conv, p_cible) on conflict do nothing;
  elsif p_action = 'retirer' then
    delete from msg_membres where conversation = p_conv and participant = p_cible;
  elsif p_action in ('nommer_admin', 'retirer_admin') then
    update msg_membres set admin = (p_action = 'nommer_admin') where conversation = p_conv and participant = p_cible;
    if not exists (select 1 from msg_membres where conversation = p_conv and admin) then raise exception 'Le groupe doit garder au moins un administrateur.'; end if;
  elsif p_action in ('bloquer', 'debloquer') then
    update msg_membres set bloque = (p_action = 'bloquer') where conversation = p_conv and participant = p_cible;
  elsif p_action = 'supprimer' then
    update msg_conversations set supprimee_le = now() where id = p_conv;
  else
    raise exception 'Action inconnue : %', p_action;
  end if;
  perform public.msg_journal(coalesce(v_cle, public.mon_role()), 'groupe : ' || p_action, p_conv, null, p_cible, p_valeur);
  perform public.msg_signaler(p_conv);
end $$;

/** Masquer, réafficher ou supprimer un message : son auteur (supprimer), un administrateur du groupe ou la modération. */
create or replace function public.msg_moderer_message(p_msg uuid, p_action text, p_prenom text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom); g msg_messages; m msg_membres; v_mod boolean := public.msg_est_moderateur(); v_admin boolean;
begin
  select * into g from msg_messages where id = p_msg;
  if g.id is null then raise exception 'Message introuvable.'; end if;
  m := public.msg_membre(g.conversation, v_cle);
  v_admin := coalesce(m.admin, false) and (select type from msg_conversations where id = g.conversation) = 'groupe';
  if p_action = 'supprimer' and (g.auteur = v_cle or v_admin or v_mod) then
    update msg_messages set supprime = true, corps = '', pj = '[]'::jsonb, modere_par = v_cle where id = p_msg;
  elsif p_action in ('masquer', 'afficher') and (v_admin or v_mod) then
    update msg_messages set masque = (p_action = 'masquer'), modere_par = v_cle where id = p_msg;
  else
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if g.auteur <> v_cle then
    perform public.msg_journal(coalesce(v_cle, public.mon_role()), 'message : ' || p_action, g.conversation, p_msg, g.auteur, left(g.corps, 200));
  end if;
  perform public.msg_signaler(g.conversation);
end $$;

/** Modération : bloquer / débloquer un utilisateur dans toute la messagerie. */
create or replace function public.msg_bloquer_utilisateur(p_cible text, p_bloque boolean, p_motif text default null, p_prenom text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_cle text := coalesce(public.msg_cle(p_prenom), public.mon_role());
begin
  if not public.msg_est_moderateur() then raise exception 'Réservé à la modération.' using errcode = '42501'; end if;
  if p_bloque then
    insert into msg_blocages (participant, par, motif) values (p_cible, v_cle, nullif(btrim(p_motif), ''))
      on conflict (participant) do update set par = excluded.par, motif = excluded.motif, le = now();
  else
    delete from msg_blocages where participant = p_cible;
  end if;
  perform public.msg_journal(v_cle, case when p_bloque then 'utilisateur bloqué' else 'utilisateur débloqué' end, null, null, p_cible, p_motif);
end $$;

/** Blocage personnel (messages directs). */
create or replace function public.msg_bloquer_perso(p_cible text, p_bloque boolean, p_prenom text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_cle text := public.msg_cle(p_prenom);
begin
  if v_cle is null then raise exception 'Session inconnue' using errcode = '42501'; end if;
  if p_bloque then insert into msg_blocages_perso (bloqueur, bloque) values (v_cle, p_cible) on conflict do nothing;
  else delete from msg_blocages_perso where bloqueur = v_cle and bloque = p_cible; end if;
end $$;

create or replace function public.msg_mes_blocages(p_prenom text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(bloque), '[]'::jsonb) from msg_blocages_perso where bloqueur = public.msg_cle(p_prenom);
$$;

create or replace function public.msg_moderation_liste() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.msg_est_moderateur() then raise exception 'Réservé à la modération.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'journal', coalesce((select jsonb_agg(jsonb_build_object('quand', j.quand, 'auteur', public.msg_info(j.auteur)->>'libelle', 'action', j.action,
        'cible', case when j.cible like '%:%' then public.msg_info(j.cible)->>'libelle' else j.cible end, 'detail', j.detail,
        'conversation', (select coalesce(titre, 'Conversation directe') from msg_conversations where id = j.conversation)) order by j.quand desc)
      from (select * from msg_moderation order by quand desc limit 200) j), '[]'::jsonb),
    'bloques', coalesce((select jsonb_agg(public.msg_info(b.participant) || jsonb_build_object('motif', b.motif, 'le', b.le)) from msg_blocages b), '[]'::jsonb));
end $$;

-- ───────────── Temps réel ─────────────

create or replace function public.msg_peut_voir(p_conv text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.msg_est_moderateur()
    or exists (select 1 from msg_membres where conversation::text = p_conv and participant = any(public.msg_mes_cles()));
$$;

drop policy if exists msg_signaux_lecture on public.msg_signaux;
create policy msg_signaux_lecture on public.msg_signaux for select to authenticated using (public.msg_peut_voir(conversation::text));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'msg_signaux') then
    alter publication supabase_realtime add table public.msg_signaux;
  end if;
end $$;

-- ───────────── Pièces jointes (bucket privé) ─────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messagerie', 'messagerie', false, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic','application/pdf'])
on conflict (id) do nothing;

create or replace function public.msg_peut_deposer(p_conv text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from msg_membres m join msg_conversations c on c.id = m.conversation
    where m.conversation::text = p_conv and c.supprimee_le is null and not m.bloque
      and m.participant = any(public.msg_mes_cles())
      and not exists (select 1 from msg_blocages b where b.participant = m.participant));
$$;

drop policy if exists "messagerie depot" on storage.objects;
create policy "messagerie depot" on storage.objects for insert to authenticated
  with check (bucket_id = 'messagerie' and public.msg_peut_deposer((storage.foldername(name))[1]));
drop policy if exists "messagerie lecture" on storage.objects;
create policy "messagerie lecture" on storage.objects for select to authenticated
  using (bucket_id = 'messagerie' and public.msg_peut_voir((storage.foldername(name))[1]));

-- ───────────── Droits d'exécution ─────────────

revoke all on function public.msg_signaler(uuid), public.msg_journal(text, text, uuid, uuid, text, text), public.msg_membre(uuid, text) from public, anon, authenticated;

-- ───────────── Catalogue Webmestre : Messagerie ouverte à tous ─────────────

insert into public.acces_pages (cle, libelle, section, ordre) values ('/messagerie', 'Messagerie', 'Communication', 39)
on conflict (cle) do nothing;
insert into public.acces_profils (profil, page, niveau)
select p, '/messagerie', 'modification'
from unnest(array['president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat','recherche-fonds','evenement']) p
on conflict (profil, page) do nothing;
