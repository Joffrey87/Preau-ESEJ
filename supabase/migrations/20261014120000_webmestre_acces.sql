-- Webmestre et droits d'accès par profil / onglet (masqué, lecture seule, modification).
-- Non cassant : nouvelles tables seulement ; les valeurs semées reproduisent les accès actuels.

create table public.acces_pages (
  cle text primary key,            -- chemin de la page, ex. '/comptabilite'
  libelle text not null,
  section text not null default '',
  ordre int not null default 0
);

create table public.acces_profils (
  profil text not null,
  page text not null references public.acces_pages(cle) on update cascade on delete cascade,
  niveau text not null check (niveau in ('masque','lecture','modification')),
  primary key (profil, page)
);

create table public.acces_personnes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  note text,
  cree_le timestamptz not null default now()
);

create table public.acces_personne_profils (
  personne uuid not null references public.acces_personnes(id) on delete cascade,
  profil text not null,
  note text,
  primary key (personne, profil)
);

-- Exception pour une personne, par-dessus le réglage de son profil.
create table public.acces_personne_pages (
  personne uuid not null references public.acces_personnes(id) on delete cascade,
  profil text not null,
  page text not null references public.acces_pages(cle) on update cascade on delete cascade,
  niveau text not null check (niveau in ('masque','lecture','modification')),
  primary key (personne, profil, page)
);

-- Exactement un Webmestre : une seule ligne possible (clé = true), suppression interdite.
create table public.webmestre (
  unique_ligne boolean primary key default true check (unique_ligne),
  profil text not null check (profil in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat')),
  depuis timestamptz not null default now()
);

create table public.acces_historique (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  auteur text not null,
  action text not null,
  profil text,
  page text,
  ancien text,
  nouveau text,
  detail text
);

create or replace function public.webmestre_empeche_suppression() returns trigger
language plpgsql as $$ begin raise exception 'Le Webmestre ne peut être supprimé : utilisez la passation.'; end $$;
create trigger webmestre_pas_de_suppression before delete or truncate on public.webmestre
  for each statement execute function public.webmestre_empeche_suppression();

alter table public.acces_pages enable row level security;
alter table public.acces_profils enable row level security;
alter table public.acces_personnes enable row level security;
alter table public.acces_personne_profils enable row level security;
alter table public.acces_personne_pages enable row level security;
alter table public.webmestre enable row level security;
alter table public.acces_historique enable row level security;

create or replace function public.est_webmestre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from webmestre where profil = public.mon_role());
$$;

-- Lecture : le bureau lit le catalogue et la matrice ; le Webmestre lit tout. Écriture : uniquement par les fonctions ci-dessous.
create policy acces_pages_lecture on public.acces_pages for select to authenticated using (public.est_bureau() or public.mon_role() = 'recherche-fonds');
create policy acces_profils_lecture on public.acces_profils for select to authenticated using (public.est_bureau() or public.mon_role() = 'recherche-fonds');
create policy webmestre_lecture on public.webmestre for select to authenticated using (public.est_bureau());
create policy acces_personnes_lecture on public.acces_personnes for select to authenticated using (public.est_webmestre());
create policy acces_personne_profils_lecture on public.acces_personne_profils for select to authenticated using (public.est_webmestre());
create policy acces_personne_pages_lecture on public.acces_personne_pages for select to authenticated using (public.est_webmestre());
create policy acces_historique_lecture on public.acces_historique for select to authenticated using (public.est_webmestre());

/** Niveau d'un profil (et éventuellement d'une personne) sur une page ; page absente du catalogue = null. */
create or replace function public.acces_niveau_de(p_profil text, p_page text, p_personne text default null) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pp.niveau from acces_personne_pages pp join acces_personnes p on p.id = pp.personne
      where p_personne is not null and lower(p.nom) = lower(p_personne) and pp.profil = p_profil and pp.page = p_page limit 1),
    (select niveau from acces_profils where profil = p_profil and page = p_page),
    case when exists (select 1 from acces_pages where cle = p_page) then 'masque' end
  );
$$;

/** Pour les politiques RLS à venir : niveau du compte connecté sur une page. */
create or replace function public.acces_niveau(p_page text) returns text
language sql stable security definer set search_path = public as $$
  select public.acces_niveau_de(public.mon_role(), p_page, null);
$$;

/**
 * Contexte d'accès du compte connecté. p_vue : profil simulé (pris en compte pour le Webmestre seulement) ;
 * p_personne : prénom de la visite (Recherche de fonds) pour les exceptions par personne.
 */
create or replace function public.acces_contexte(p_vue text default null, p_personne text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.mon_role();
  v_web boolean := exists (select 1 from webmestre where profil = v_role);
  v_profil text := case when v_web and p_vue is not null then p_vue else v_role end;
begin
  return jsonb_build_object(
    'webmestre', v_web,
    'profil_webmestre', (select profil from webmestre),
    'profil', v_profil,
    'niveaux', coalesce((select jsonb_object_agg(a.cle, public.acces_niveau_de(v_profil, a.cle, p_personne)) from acces_pages a), '{}'::jsonb)
  );
end $$;

create or replace function public.acces_journal(p_action text, p_profil text, p_page text, p_ancien text, p_nouveau text, p_detail text)
returns void language sql security definer set search_path = public as $$
  insert into acces_historique (auteur, action, profil, page, ancien, nouveau, detail)
  values (coalesce(public.mon_role(), '?'), p_action, p_profil, p_page, p_ancien, p_nouveau, p_detail);
$$;

create or replace function public.acces_verifier_webmestre() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_webmestre() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
end $$;

create or replace function public.acces_definir(p_profil text, p_page text, p_niveau text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ancien text;
begin
  perform public.acces_verifier_webmestre();
  select niveau into v_ancien from acces_profils where profil = p_profil and page = p_page;
  insert into acces_profils (profil, page, niveau) values (p_profil, p_page, p_niveau)
    on conflict (profil, page) do update set niveau = excluded.niveau;
  perform public.acces_journal('droit profil', p_profil, p_page, coalesce(v_ancien, 'masque'), p_niveau, null);
end $$;

create or replace function public.acces_personne_enregistrer(p_id uuid, p_nom text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform public.acces_verifier_webmestre();
  if v_id is null then
    insert into acces_personnes (nom, note) values (trim(p_nom), nullif(trim(p_note), '')) returning id into v_id;
    perform public.acces_journal('personne ajoutée', null, null, null, trim(p_nom), p_note);
  else
    update acces_personnes set nom = trim(p_nom), note = nullif(trim(p_note), '') where id = v_id;
    perform public.acces_journal('personne modifiée', null, null, null, trim(p_nom), p_note);
  end if;
  return v_id;
end $$;

create or replace function public.acces_personne_supprimer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  perform public.acces_verifier_webmestre();
  delete from acces_personnes where id = p_id returning nom into v_nom;
  perform public.acces_journal('personne retirée', null, null, v_nom, null, null);
end $$;

create or replace function public.acces_personne_profil(p_personne uuid, p_profil text, p_lie boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  perform public.acces_verifier_webmestre();
  select nom into v_nom from acces_personnes where id = p_personne;
  if p_lie then
    insert into acces_personne_profils (personne, profil, note) values (p_personne, p_profil, nullif(trim(p_note), ''))
      on conflict (personne, profil) do update set note = excluded.note;
    perform public.acces_journal('profil attribué', p_profil, null, null, v_nom, p_note);
  else
    delete from acces_personne_profils where personne = p_personne and profil = p_profil;
    delete from acces_personne_pages where personne = p_personne and profil = p_profil;
    perform public.acces_journal('profil retiré', p_profil, null, v_nom, null, null);
  end if;
end $$;

/** Exception par personne ; p_niveau null = revenir au réglage du profil. */
create or replace function public.acces_personne_definir(p_personne uuid, p_profil text, p_page text, p_niveau text) returns void
language plpgsql security definer set search_path = public as $$
declare v_nom text; v_ancien text;
begin
  perform public.acces_verifier_webmestre();
  select nom into v_nom from acces_personnes where id = p_personne;
  select niveau into v_ancien from acces_personne_pages where personne = p_personne and profil = p_profil and page = p_page;
  if p_niveau is null then
    delete from acces_personne_pages where personne = p_personne and profil = p_profil and page = p_page;
  else
    insert into acces_personne_pages (personne, profil, page, niveau) values (p_personne, p_profil, p_page, p_niveau)
      on conflict (personne, profil, page) do update set niveau = excluded.niveau;
  end if;
  perform public.acces_journal('exception personne', p_profil, p_page, coalesce(v_ancien, 'profil'), coalesce(p_niveau, 'profil'), v_nom);
end $$;

/** Passation : en une seule transaction, la ligne unique change de titulaire (jamais zéro ni deux Webmestres). */
create or replace function public.webmestre_transmettre(p_profil text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ancien text;
begin
  select profil into v_ancien from webmestre for update;
  if v_ancien is distinct from public.mon_role() then raise exception 'Réservé au Webmestre' using errcode = '42501'; end if;
  if p_profil = v_ancien then raise exception 'Ce profil est déjà Webmestre'; end if;
  if p_profil not in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat') then
    raise exception 'Le Webmestre doit être un profil Administration';
  end if;
  update webmestre set profil = p_profil, depuis = now();
  perform public.acces_journal('passation Webmestre', p_profil, null, v_ancien, p_profil, null);
end $$;

revoke all on function public.acces_niveau_de(text, text, text), public.acces_niveau(text), public.acces_contexte(text, text),
  public.acces_journal(text, text, text, text, text, text), public.acces_verifier_webmestre(), public.est_webmestre(),
  public.acces_definir(text, text, text), public.acces_personne_enregistrer(uuid, text, text), public.acces_personne_supprimer(uuid),
  public.acces_personne_profil(uuid, text, boolean, text), public.acces_personne_definir(uuid, text, text, text),
  public.webmestre_transmettre(text) from public, anon;
grant execute on function public.acces_niveau(text), public.acces_contexte(text, text), public.est_webmestre(),
  public.acces_definir(text, text, text), public.acces_personne_enregistrer(uuid, text, text), public.acces_personne_supprimer(uuid),
  public.acces_personne_profil(uuid, text, boolean, text), public.acces_personne_definir(uuid, text, text, text),
  public.webmestre_transmettre(text) to authenticated;

-- Catalogue des onglets (ajouter une ligne pour un nouvel onglet, ex. RH : masqué partout par défaut).
insert into public.acces_pages (cle, libelle, section, ordre) values
  ('/', 'Tableau de bord', '', 0),
  ('/comptabilite', 'Comptabilité', 'Comptabilité', 10),
  ('/comptabilite/import', 'Import de relevé', 'Comptabilité', 11),
  ('/comptabilite/correspondances', 'Règles de correspondance', 'Comptabilité', 12),
  ('/budget', 'Budget', 'Comptabilité', 13),
  ('/scolarite', 'Frais de scolarité', 'Comptabilité', 14),
  ('/bulletins', 'Bulletins', 'École', 20),
  ('/dons', 'Dons', 'Financement', 30),
  ('/mecenat/pipeline', 'Relations donateurs', 'Financement', 31),
  ('/recus-fiscaux', 'Reçus fiscaux', 'Financement', 32),
  ('/remerciements', 'Remerciements', 'Financement', 33),
  ('/acces-familles', 'Accès des familles', 'Communication', 40),
  ('/mails', 'Mails', 'Communication', 41),
  ('/courriers', 'Courriers à confirmer', 'Communication', 42),
  ('/carnet', 'Carnet d''adresses', 'Vie associative', 50),
  ('/ca', 'Conseil d''administration', 'Vie associative', 51),
  ('/recherche/axes', 'Axes de recherche', 'Recherche de fonds', 60),
  ('/recherche/suivi', 'Suivi des actions', 'Recherche de fonds', 61),
  ('/parametres', 'Paramètres', 'Support', 70),
  ('/processus', 'Processus', 'Support', 71);

-- Valeurs par défaut = accès actuels (menu + pages autorisées du code en ligne).
insert into public.acces_profils (profil, page, niveau)
select r.profil, a.cle, 'masque' from public.acces_pages a
cross join (values ('president'),('tresorier'),('secretaire'),('administrateur'),('directrice'),('directeur-spirituel'),('resp-mecenat'),('recherche-fonds')) r(profil);

update public.acces_profils set niveau = 'modification' where profil = 'tresorier' and page <> '/bulletins';
update public.acces_profils set niveau = 'modification' where profil = 'president'
  and page in ('/', '/budget', '/scolarite', '/dons', '/mecenat/pipeline', '/remerciements');
update public.acces_profils set niveau = 'lecture' where profil = 'president' and page = '/comptabilite';
update public.acces_profils set niveau = 'modification' where profil = 'directrice' and page in ('/', '/bulletins');
update public.acces_profils set niveau = 'modification' where profil = 'directeur-spirituel' and page in ('/', '/bulletins');
update public.acces_profils set niveau = 'lecture' where profil = 'directeur-spirituel' and page in ('/carnet', '/dons', '/mecenat/pipeline');
update public.acces_profils set niveau = 'modification' where profil = 'recherche-fonds'
  and page in ('/', '/recherche/axes', '/recherche/suivi', '/mecenat/pipeline');

insert into public.webmestre (profil) values ('tresorier');
insert into public.acces_historique (auteur, action, profil, detail)
values ('système', 'création', 'tresorier', 'Droits initiaux = accès existants ; Webmestre : Trésorier');