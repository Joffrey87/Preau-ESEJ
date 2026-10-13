-- Webmestre : cocher « Événement » pour une personne sans compte Événement crée son compte (même convention que les
-- membres existants : identifiant = prénom, « Prénom N. » si le prénom est pris, mot de passe = prénom sans accents).
-- Décocher ne supprime rien : le compte est désactivé (connexion bloquée, retiré de la liste), réactivable en recochant.
-- Non cassant : une colonne nouvelle (actif, vrai par défaut) ; les fonctions existantes gardent leur comportement.

alter table public.evenement_membres add column if not exists actif boolean not null default true;

-- Liste de connexion : membres actifs seulement (tous le sont aujourd'hui).
create or replace function public.evenement_connexion() returns table (libelle text, email text)
language sql stable security definer set search_path = public as $$
  select libelle, identifiant || '@evenement.esej' from evenement_membres where user_id is not null and actif order by libelle;
$$;

/** Active (crée au besoin) ou désactive le compte Événement d'une personne du Webmestre. */
create or replace function public.acces_compte_evenement(p_personne uuid, p_actif boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  p acces_personnes%rowtype;
  m evenement_membres%rowtype;
  v_prenom text; v_nom text; v_lib text; v_cree boolean := false;
  v_ens enseignants%rowtype;
  v_mid uuid;
begin
  perform public.acces_verifier_webmestre();
  select * into p from acces_personnes where id = p_personne for update;
  if p.id is null then raise exception 'Personne inconnue.'; end if;

  select * into m from evenement_membres where id = p.evenement_membre_id;
  if p_actif then
    if m.id is null then
      if p.enseignant_id is not null then select * into v_ens from enseignants where id = p.enseignant_id; end if;
      v_prenom := initcap(btrim(coalesce(v_ens.prenom, p.prenom, split_part(p.nom, ' ', 1))));
      v_nom := nullif(btrim(coalesce(v_ens.nom, p.nom_famille, '')), '');
      if coalesce(v_prenom, '') = '' then raise exception 'Prénom manquant pour créer le compte Événement.'; end if;
      -- Même personne déjà membre (même prénom et nom) : on la relie au lieu d'en créer une seconde.
      select * into m from evenement_membres
        where lower(prenom) = lower(v_prenom) and lower(coalesce(nom, '')) = lower(coalesce(v_nom, '')) limit 1;
      if m.id is null then
        v_lib := v_prenom;
        if exists (select 1 from evenement_membres where identifiant = public.identifiant_evenement(v_lib)) then
          v_lib := v_prenom || ' ' || upper(left(coalesce(v_nom, 'x'), 1)) || '.';
        end if;
        while exists (select 1 from evenement_membres where identifiant = public.identifiant_evenement(v_lib)) loop
          v_lib := v_lib || '2';
        end loop;
        v_mid := public._creer_membre_evenement(v_lib, v_prenom, v_nom, null);
        select * into m from evenement_membres where id = v_mid;
        update evenement_membres set famille_id = p.famille_id where id = m.id and p.famille_id is not null;
        v_cree := true;
      end if;
      update acces_personnes set evenement_membre_id = m.id where id = p.id;
    end if;
    update evenement_membres set actif = true where id = m.id;
    update profils set actif = true where id = m.user_id;
    update auth.users set banned_until = null where id = m.user_id;
    perform public.acces_journal(case when v_cree then 'compte Événement créé' else 'compte Événement activé' end,
      'evenement', null, null, m.identifiant, p.nom);
  elsif m.id is not null then
    update evenement_membres set actif = false where id = m.id;
    update profils set actif = false where id = m.user_id;
    update auth.users set banned_until = 'infinity' where id = m.user_id;
    perform public.acces_journal('compte Événement désactivé', 'evenement', null, m.identifiant, null, p.nom);
  end if;
  return jsonb_build_object('identifiant', m.identifiant, 'libelle', m.libelle, 'cree', v_cree,
    'mot_de_passe', case when v_cree then public.identifiant_evenement(m.prenom) end);
end $$;

-- Cocher / décocher « Événement » pilote aussi le compte.
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
  if p_profil = 'evenement' and p_source <> 'evenement' then
    perform public.acces_compte_evenement(v_id, p_lie);
  end if;
  return v_id;
end $$;

-- Bascule : un compte Événement désactivé n'est plus proposé.
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

  if 'evenement' = any(v_profils) or v_role = 'evenement' then
    select jsonb_build_object('libelle', m.libelle, 'email', m.identifiant || '@evenement.esej') into v_ev
      from evenement_membres m
     where m.user_id is not null and m.actif and (m.id = p.evenement_membre_id
        or (p.evenement_membre_id is null and lower(m.prenom) = lower(coalesce(p.prenom, '')) and lower(coalesce(m.nom, '')) = lower(coalesce(p.nom_famille, ''))))
     limit 1;
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

-- Annuaire : l'état actif des membres Événement.
create or replace function public.acces_annuaire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.acces_verifier_webmestre();
  return jsonb_build_object(
    'evenement', coalesce((select jsonb_agg(jsonb_build_object('ref', m.id, 'prenom', m.prenom, 'nom', m.nom, 'libelle', m.libelle,
        'famille', f.nom, 'compte', m.user_id is not null, 'actif', m.actif, 'identifiant', m.identifiant) order by m.libelle)
      from evenement_membres m left join familles f on f.id = m.famille_id), '[]'::jsonb),
    'recherche', coalesce((select jsonb_agg(jsonb_build_object('ref', f.membre_recherche, 'prenom', f.membre_recherche, 'nom', f.nom, 'famille', f.nom) order by f.membre_recherche)
      from familles f where f.membre_recherche is not null), '[]'::jsonb),
    'professeur', coalesce((select jsonb_agg(jsonb_build_object('ref', e.id, 'prenom', e.prenom, 'nom', e.nom, 'compte', e.identifiant is not null) order by e.nom, e.prenom)
      from enseignants e where e.actif), '[]'::jsonb)
  );
end $$;

revoke all on function public.acces_compte_evenement(uuid, boolean) from public, anon;
grant execute on function public.acces_compte_evenement(uuid, boolean) to authenticated;
