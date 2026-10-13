-- Webmestre : titulaire unique de chaque rôle Administration, membres réels (familles, Carnet, professeurs, Événement,
-- Recherche de fonds) et accès de chaque personne aux autres espaces (bascule par le logo Préau).
-- Non cassant : colonnes et tables nouvelles seulement ; aucune connexion existante n'est modifiée.

alter table public.acces_personnes add column if not exists prenom text;
alter table public.acces_personnes add column if not exists nom_famille text;
alter table public.acces_personnes add column if not exists famille_id uuid references public.familles(id) on delete set null;
alter table public.acces_personnes add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.acces_personnes add column if not exists enseignant_id uuid references public.enseignants(id) on delete set null;
alter table public.acces_personnes add column if not exists evenement_membre_id uuid references public.evenement_membres(id) on delete set null;
alter table public.acces_personnes add column if not exists prenom_recherche text;

create unique index if not exists acces_personnes_contact_u on public.acces_personnes (contact_id) where contact_id is not null;
create unique index if not exists acces_personnes_enseignant_u on public.acces_personnes (enseignant_id) where enseignant_id is not null;
create unique index if not exists acces_personnes_evenement_u on public.acces_personnes (evenement_membre_id) where evenement_membre_id is not null;
create unique index if not exists acces_personnes_recherche_u on public.acces_personnes (lower(prenom_recherche)) where prenom_recherche is not null;
create unique index if not exists acces_personnes_famille_u on public.acces_personnes (famille_id, lower(coalesce(prenom, ''))) where famille_id is not null and contact_id is null;

-- Un seul titulaire par rôle Administration (clé primaire = rôle).
create table if not exists public.acces_titulaires (
  profil text primary key check (profil in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat')),
  personne uuid not null references public.acces_personnes(id) on delete restrict,
  depuis timestamptz not null default now()
);
alter table public.acces_titulaires enable row level security;
drop policy if exists acces_titulaires_lecture on public.acces_titulaires;
create policy acces_titulaires_lecture on public.acces_titulaires for select to authenticated using (public.est_webmestre());

-- Un titulaire ne peut être retiré par la suppression de sa personne : on remplace d'abord le titulaire.
create or replace function public.acces_personne_supprimer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_nom text;
begin
  perform public.acces_verifier_webmestre();
  if exists (select 1 from acces_titulaires where personne = p_id) then
    raise exception 'Cette personne est titulaire d''un rôle Administration : attribuez d''abord le rôle à quelqu''un d''autre.';
  end if;
  delete from acces_personnes where id = p_id returning nom into v_nom;
  perform public.acces_journal('personne retirée', null, null, v_nom, null, null);
end $$;

/** Annuaire des membres réels de chaque espace (Webmestre). */
create or replace function public.acces_annuaire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.acces_verifier_webmestre();
  return jsonb_build_object(
    'evenement', coalesce((select jsonb_agg(jsonb_build_object('ref', m.id, 'prenom', m.prenom, 'nom', m.nom, 'libelle', m.libelle,
        'famille', f.nom, 'compte', m.user_id is not null) order by m.libelle)
      from evenement_membres m left join familles f on f.id = m.famille_id), '[]'::jsonb),
    'recherche', coalesce((select jsonb_agg(jsonb_build_object('ref', f.membre_recherche, 'prenom', f.membre_recherche, 'nom', f.nom, 'famille', f.nom) order by f.membre_recherche)
      from familles f where f.membre_recherche is not null), '[]'::jsonb),
    'professeur', coalesce((select jsonb_agg(jsonb_build_object('ref', e.id, 'prenom', e.prenom, 'nom', e.nom, 'compte', e.identifiant is not null) order by e.nom, e.prenom)
      from enseignants e where e.actif), '[]'::jsonb)
  );
end $$;

/** Recherche d'une personne : familles d'abord (chaque parent), puis Carnet, professeurs, membres Événement. */
create or replace function public.acces_rechercher(p_q text)
returns table(source text, ref text, prenom text, nom text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare q text := '%' || lower(public.unaccent_simple(btrim(coalesce(p_q, '')))) || '%';
begin
  perform public.acces_verifier_webmestre();
  return query
  with r as (
    select 1 o, 'famille'::text s, f.id::text rf, nullif(btrim(f.parent1_prenom), '') pr, coalesce(nullif(btrim(f.parent1_nom), ''), f.nom) nm, 'Famille ' || f.nom dt
      from familles f where nullif(btrim(f.parent1_prenom), '') is not null
    union all
    select 1, 'famille', f.id::text, nullif(btrim(f.parent2_prenom), ''), coalesce(nullif(btrim(f.parent2_nom), ''), f.nom), 'Famille ' || f.nom
      from familles f where nullif(btrim(f.parent2_prenom), '') is not null
    union all
    select 1, 'famille', f.id::text, null, f.nom, 'Famille ' || f.nom
      from familles f where nullif(btrim(f.parent1_prenom), '') is null and nullif(btrim(f.parent2_prenom), '') is null
    union all
    select 2, 'contact', c.id::text, c.prenom, c.nom, 'Carnet d''adresses'
      from contacts c where c.supprime_le is null and not c.est_personne_morale and c.famille_id is null
    union all
    select 3, 'enseignant', e.id::text, e.prenom, e.nom, 'Professeur' from enseignants e where e.actif
    union all
    select 4, 'evenement', m.id::text, m.prenom, m.nom, 'Événement (' || m.libelle || ')' from evenement_membres m
    union all
    select 5, 'recherche', f.membre_recherche, f.membre_recherche, f.nom, 'Recherche de fonds' from familles f where f.membre_recherche is not null
  )
  select r.s, r.rf, r.pr, r.nm, r.dt from r
   where lower(public.unaccent_simple(concat_ws(' ', r.pr, r.nm, r.dt))) like q
   order by r.o, r.nm, r.pr
   limit 40;
end $$;

/** Personne Webmestre correspondant à une source (créée au besoin). Source « nouveau » : crée aussi la fiche du Carnet. */
create or replace function public.acces_personne_reelle(p_source text, p_ref text, p_prenom text, p_nom text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_prenom text := nullif(btrim(coalesce(p_prenom, '')), '');
  v_nom text := nullif(btrim(coalesce(p_nom, '')), '');
  v_contact uuid;
  v_aff text;
begin
  perform public.acces_verifier_webmestre();
  if p_source = 'famille' then
    select id into v_id from acces_personnes where famille_id = p_ref::uuid and contact_id is null and lower(coalesce(prenom, '')) = lower(coalesce(v_prenom, ''));
  elsif p_source = 'contact' then
    select id into v_id from acces_personnes where contact_id = p_ref::uuid;
  elsif p_source = 'enseignant' then
    select id into v_id from acces_personnes where enseignant_id = p_ref::uuid;
  elsif p_source = 'evenement' then
    select id into v_id from acces_personnes where evenement_membre_id = p_ref::uuid;
  elsif p_source = 'recherche' then
    select id into v_id from acces_personnes where lower(prenom_recherche) = lower(p_ref);
  elsif p_source = 'personne' then
    return p_ref::uuid;
  elsif p_source <> 'nouveau' then
    raise exception 'Source inconnue : %', p_source;
  end if;
  if v_id is not null then return v_id; end if;

  if p_source = 'nouveau' then
    if v_nom is null and v_prenom is null then raise exception 'Indiquez au moins un nom ou un prénom.'; end if;
    insert into contacts (est_personne_morale, nom, prenom, categories) values (false, coalesce(v_nom, ''), v_prenom, '{}') returning id into v_contact;
  end if;
  v_aff := coalesce(nullif(concat_ws(' ', v_prenom, v_nom), ''), p_ref);
  insert into acces_personnes (nom, prenom, nom_famille, famille_id, contact_id, enseignant_id, evenement_membre_id, prenom_recherche)
  values (v_aff, v_prenom, v_nom,
          case when p_source = 'famille' then p_ref::uuid
               when p_source = 'recherche' then (select id from familles where lower(membre_recherche) = lower(p_ref) limit 1)
               when p_source = 'evenement' then (select famille_id from evenement_membres where id = p_ref::uuid) end,
          case when p_source = 'contact' then p_ref::uuid when p_source = 'nouveau' then v_contact end,
          case when p_source = 'enseignant' then p_ref::uuid end,
          case when p_source = 'evenement' then p_ref::uuid end,
          case when p_source = 'recherche' then p_ref end)
  returning id into v_id;
  perform public.acces_journal('personne ajoutée', null, null, null, v_aff,
    case p_source when 'nouveau' then 'Nouvelle personne (fiche créée dans le Carnet d''adresses)' when 'famille' then 'Depuis les familles'
      when 'contact' then 'Depuis le Carnet d''adresses' when 'enseignant' then 'Professeur' when 'evenement' then 'Membre Événement'
      else 'Recherche de fonds' end);
  return v_id;
end $$;

/** Attribue un rôle Administration à une personne : remplace le titulaire précédent (une seule personne par rôle). */
create or replace function public.acces_titulaire_attribuer(p_profil text, p_source text, p_ref text, p_prenom text, p_nom text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ancien uuid; v_ancien_nom text; v_nom text;
begin
  perform public.acces_verifier_webmestre();
  if p_profil not in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat') then
    raise exception 'Rôle Administration inconnu : %', p_profil;
  end if;
  v_id := public.acces_personne_reelle(p_source, p_ref, p_prenom, p_nom);
  select personne into v_ancien from acces_titulaires where profil = p_profil for update;
  if v_ancien = v_id then return v_id; end if;
  select nom into v_ancien_nom from acces_personnes where id = v_ancien;
  select nom into v_nom from acces_personnes where id = v_id;
  insert into acces_titulaires (profil, personne, depuis) values (p_profil, v_id, now())
    on conflict (profil) do update set personne = excluded.personne, depuis = excluded.depuis;
  if v_ancien is not null then
    delete from acces_personne_profils where personne = v_ancien and profil = p_profil;
    delete from acces_personne_pages where personne = v_ancien and profil = p_profil;
  end if;
  insert into acces_personne_profils (personne, profil) values (v_id, p_profil) on conflict do nothing;
  perform public.acces_journal('titulaire attribué', p_profil, null, v_ancien_nom, v_nom, null);
  return v_id;
end $$;

/** Coche ou décoche l'accès d'une personne réelle à un espace (crée la personne au besoin). */
create or replace function public.acces_membre_profil(p_source text, p_ref text, p_prenom text, p_nom text, p_profil text, p_lie boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.acces_verifier_webmestre();
  if p_profil in ('president','tresorier','secretaire','administrateur','directrice','directeur-spirituel','resp-mecenat') then
    raise exception 'Un rôle Administration s''attribue par sa tuile (une seule personne par rôle).';
  end if;
  v_id := public.acces_personne_reelle(p_source, p_ref, p_prenom, p_nom);
  perform public.acces_personne_profil(v_id, p_profil, p_lie, null);
  return v_id;
end $$;

/**
 * Espaces reliés de la personne connectée, d'après les liens du Webmestre (bascule par le logo).
 * Personne reconnue : prénom de visite (Recherche de fonds), compte Événement ou Professeur, titulaire du rôle.
 */
create or replace function public.mes_acces_lies(p_prenom text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.mon_role();
  p acces_personnes%rowtype;
  v_profils text[];
  v_ev jsonb; v_prof jsonb;
begin
  if v_role = 'recherche-fonds' then
    select * into p from acces_personnes where lower(prenom_recherche) = lower(coalesce(p_prenom, ''));
  elsif v_role = 'evenement' then
    select a.* into p from acces_personnes a join evenement_membres m on m.id = a.evenement_membre_id where m.user_id = auth.uid();
  elsif v_role = 'professeur' then
    select a.* into p from acces_personnes a join enseignants e on e.id = a.enseignant_id where e.user_id = auth.uid();
  else
    select a.* into p from acces_personnes a join acces_titulaires t on t.personne = a.id where t.profil = v_role;
  end if;
  if p.id is null then return null; end if;
  select coalesce(array_agg(profil), '{}') into v_profils from acces_personne_profils where personne = p.id;

  if 'evenement' = any(v_profils) or p.evenement_membre_id is not null then
    select jsonb_build_object('libelle', m.libelle, 'email', m.identifiant || '@evenement.esej') into v_ev
      from evenement_membres m
     where m.user_id is not null and (m.id = p.evenement_membre_id
        or (p.evenement_membre_id is null and lower(m.prenom) = lower(coalesce(p.prenom, '')) and lower(coalesce(m.nom, '')) = lower(coalesce(p.nom_famille, ''))))
     limit 1;
    if not ('evenement' = any(v_profils)) and v_role <> 'evenement' then v_ev := null; end if;
  end if;
  if 'professeur' = any(v_profils) or v_role = 'professeur' then
    select jsonb_build_object('libelle', concat_ws(' ', e.prenom, e.nom), 'email', e.identifiant || '@professeurs.esej') into v_prof
      from enseignants e
     where e.actif and e.identifiant is not null and (e.id = p.enseignant_id
        or (p.enseignant_id is null and lower(e.prenom) = lower(coalesce(p.prenom, '')) and lower(e.nom) = lower(coalesce(p.nom_famille, ''))))
     limit 1;
  end if;
  return jsonb_build_object(
    'famille', (select nom from familles where id = p.famille_id),
    'recherche', case when 'recherche-fonds' = any(v_profils) or v_role = 'recherche-fonds' then coalesce(p.prenom_recherche, p.prenom) end,
    'directrice', 'directrice' = any(v_profils),
    'president', 'president' = any(v_profils),
    'evenement', v_ev,
    'professeur', v_prof
  );
end $$;

revoke all on function public.acces_annuaire(), public.acces_rechercher(text), public.acces_personne_reelle(text, text, text, text),
  public.acces_titulaire_attribuer(text, text, text, text, text), public.acces_membre_profil(text, text, text, text, text, boolean),
  public.mes_acces_lies(text) from public, anon;
grant execute on function public.acces_annuaire(), public.acces_rechercher(text), public.acces_personne_reelle(text, text, text, text),
  public.acces_titulaire_attribuer(text, text, text, text, text), public.acces_membre_profil(text, text, text, text, text, boolean),
  public.mes_acces_lies(text) to authenticated;
