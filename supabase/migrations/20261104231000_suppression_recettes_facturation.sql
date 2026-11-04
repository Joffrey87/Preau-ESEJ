-- Recettes : demande de suppression (recette validée en banque) ; factures hors Événement : demande selon le domaine géré.
-- Migration additive : élargit la contrainte de cible et remplace les deux fonctions.
alter table public.demandes_suppression drop constraint if exists demandes_suppression_cible_check;
alter table public.demandes_suppression add constraint demandes_suppression_cible_check check (cible in ('facture', 'evenement', 'recette'));

-- Recette liée à la banque : seule la Trésorerie la supprime (déjà garanti par evenement_recettes_garde).

create or replace function public.demander_suppression(p_cible text, p_id uuid, p_motif text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_lib text; v_ops uuid[]; v_fil uuid; v_id uuid; v_evt uuid; v_tres uuid; v_qui text := public.qui_evenement(); v_texte text;
begin
  if not (public.est_evenement() or public.est_tresorier() or (p_cible = 'facture' and exists (select 1 from factures_fournisseurs f where f.id = p_id and public.facture_domaine_gerable(f.domaine)))) then
    raise exception 'Action non autorisée.';
  end if;
  if p_cible = 'facture' then
    select coalesce(f.libelle, f.numero, 'Dépense') || coalesce(' · ' || to_char(f.montant, 'FM999990D00') || ' €', '') || coalesce(' · ' || to_char(f.date, 'DD/MM/YYYY'), ''),
           case when f.operation_id is null then '{}'::uuid[] else array[f.operation_id] end
      into v_lib, v_ops from factures_fournisseurs f where f.id = p_id and public.facture_domaine_gerable(f.domaine);
  elsif p_cible = 'recette' then
    select 'Recette ' || coalesce(r.libelle, r.mode) || coalesce(' · ' || to_char(r.montant, 'FM999990D00') || ' €', '')
             || coalesce(' · ' || e.nom, ''),
           case when r.operation_id is null then '{}'::uuid[] else array[r.operation_id] end
      into v_lib, v_ops from evenement_recettes r left join evenements_caisse e on e.id = r.evenement_id where r.id = p_id;
  elsif p_cible = 'evenement' then
    select coalesce(e.nom, 'Événement') || coalesce(' · ' || to_char(e.date, 'DD/MM/YYYY'), ''), public.evenement_liens_bancaires(e.id)
      into v_lib, v_ops from evenements_caisse e where e.id = p_id;
  else
    raise exception 'Demande inconnue.';
  end if;
  if v_lib is null then raise exception 'Élément introuvable.'; end if;
  if exists (select 1 from demandes_suppression where cible = p_cible and cible_id = p_id and statut = 'en_attente') then
    raise exception 'Une demande de suppression est déjà en attente pour cet élément.';
  end if;

  select id into v_evt from com_boites where service = 'evenementiel' and public.est_evenement();
  if v_evt is null then
    select b.id into v_evt from com_boites b join public.com_mes_boites() x on x = b.id where b.service is not null and b.service <> 'tresorerie' order by b.ordre limit 1;
  end if;
  select id into v_tres from com_boites where service = 'tresorerie';
  v_texte := v_qui || ' demande la suppression ' || case p_cible when 'facture' then 'de la dépense' when 'recette' then 'de la recette' else 'de l''événement' end
             || ' « ' || v_lib || ' ».'
             || case when cardinality(v_ops) > 0 then E'\nElle est liée à une opération bancaire : la ligne est signalée en ambre dans la Comptabilité.' else '' end
             || case when coalesce(btrim(p_motif), '') <> '' then E'\nMotif : ' || btrim(p_motif) else '' end
             || E'\nVous pouvez accepter ou refuser la demande depuis la Comptabilité.';
  if v_evt is not null and v_tres is not null then
    insert into com_fils (sujet, cree_par) values ('Demande de suppression : ' || left(v_lib, 120), v_evt) returning id into v_fil;
    insert into com_participants (fil_id, boite_id, lu_le) values (v_fil, v_tres, null), (v_fil, v_evt, now());
    insert into com_messages (fil_id, boite_id, texte, pj) values (v_fil, v_evt, v_texte, '[]'::jsonb);
  end if;

  insert into demandes_suppression (cible, cible_id, libelle, operations, motif, fil_id, demande_par_libelle)
  values (p_cible, p_id, v_lib, v_ops, nullif(btrim(p_motif), ''), v_fil, v_qui) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.demander_suppression(text, uuid, text) to authenticated;

create or replace function public.traiter_demande_suppression(p_id uuid, p_accepter boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d demandes_suppression; v_fichiers text[] := '{}'; v_qui text := public.qui_evenement(); v_boite uuid; v_f text;
begin
  select * into d from demandes_suppression where id = p_id for update;
  if d.id is null then raise exception 'Demande introuvable.'; end if;
  if d.statut <> 'en_attente' then raise exception 'Demande déjà traitée.'; end if;
  if not (public.est_tresorier()
          or (d.cible = 'evenement' and cardinality(d.operations) = 0 and public.est_responsable_evenement())) then
    raise exception 'Seul le Trésorier peut traiter cette demande.';
  end if;
  if p_accepter then
    if d.cible = 'facture' then
      select fichier into v_f from factures_fournisseurs where id = d.cible_id;
      perform set_config('preau.lot', gen_random_uuid()::text, true);
      delete from factures_fournisseurs where id = d.cible_id;
      if v_f is not null then v_fichiers := array[v_f]; end if;
    elsif d.cible = 'recette' then
      perform set_config('preau.lot', gen_random_uuid()::text, true);
      delete from evenement_recettes where id = d.cible_id;
    else
      v_fichiers := public.evenement_supprimer_interne(d.cible_id);
    end if;
  end if;
  update demandes_suppression set statut = case when p_accepter then 'acceptee' else 'refusee' end,
         traite_par = v_qui, traite_le = now() where id = p_id;
  if d.fil_id is not null then
    select id into v_boite from com_boites where service = case when public.est_tresorier() then 'tresorerie' else 'evenementiel' end;
    if v_boite is not null and exists (select 1 from com_participants where fil_id = d.fil_id and boite_id = v_boite) then
      insert into com_messages (fil_id, boite_id, texte, pj)
      values (d.fil_id, v_boite, case when p_accepter then 'Demande acceptée : « ' || d.libelle || ' » a été supprimé(e).'
                                      else 'Demande refusée : « ' || d.libelle || ' » est conservé(e).' end, '[]'::jsonb);
      update com_fils set dernier_le = now() where id = d.fil_id;
      update com_participants set lu_le = now() where fil_id = d.fil_id and boite_id = v_boite;
    end if;
  end if;
  return jsonb_build_object('fichiers', to_jsonb(v_fichiers));
end;
$$;
grant execute on function public.traiter_demande_suppression(uuid, boolean) to authenticated;

