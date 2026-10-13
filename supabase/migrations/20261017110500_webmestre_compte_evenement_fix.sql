-- Correctif appliqué en base (version 20261013120315, webmestre_compte_evenement_fix) : fichier recopié de l'historique.
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
