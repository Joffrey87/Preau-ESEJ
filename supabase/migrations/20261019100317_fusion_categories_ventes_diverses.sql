-- Fusion des catégories « Ventes diverses au profit de l'école » et « Ventes diverses » en une seule : « Ventes diverses ».
-- Tout ce qui pointait vers l'ancienne catégorie est repris par la nouvelle, puis l'ancienne est supprimée.

do $$
declare
  v_ancienne uuid;
  v_nouvelle uuid;
begin
  select id into v_ancienne from public.categories where nom = 'Ventes diverses au profit de l''école' and type = 'recette';
  select id into v_nouvelle from public.categories where nom = 'Ventes diverses' and type = 'recette';
  if v_ancienne is null then return; end if;
  if v_nouvelle is null then
    -- Seule l'ancienne existe : on la renomme simplement.
    update public.categories set nom = 'Ventes diverses' where id = v_ancienne;
    return;
  end if;
  update public.operations set categorie_id = v_nouvelle where categorie_id = v_ancienne;
  update public.budget_lignes set categorie_id = v_nouvelle where categorie_id = v_ancienne;
  update public.echeances set categorie_id = v_nouvelle where categorie_id = v_ancienne;
  update public.correspondances set categorie_id = v_nouvelle where categorie_id = v_ancienne;
  update public.cheques_remis set categorie_id = v_nouvelle where categorie_id = v_ancienne;
  update public.factures_fournisseurs set categorie_id = v_nouvelle where categorie_id = v_ancienne;
  delete from public.categories where id = v_ancienne;
end $$;

-- Le domaine d'une vente (École / Événement) vient désormais de l'objet de vente, plus de la catégorie.
create or replace function public.ventes_creer_depuis_operation(
  p_operation uuid, p_sous_categorie uuid, p_famille uuid, p_contact uuid, p_libelle_payeur text,
  p_montant numeric, p_mode text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o operations%rowtype;
  v_ex uuid;
  v_due uuid;
  v_deja numeric;
  v_domaine text;
begin
  if not public.est_tresorier_strict() then raise exception 'Réservé au Trésorier.'; end if;
  select * into o from operations where id = p_operation;
  if not found then raise exception 'Opération introuvable.'; end if;
  if o.type <> 'recette' then raise exception 'Seule une recette peut régler une vente.'; end if;
  if p_mode not in ('virement', 'cheque') then raise exception 'Mode invalide (virement ou chèque).'; end if;
  if p_famille is null and p_contact is null and coalesce(trim(p_libelle_payeur), '') = '' then
    raise exception 'Indiquez la famille ou la personne.'; end if;
  select coalesce(sum(montant), 0) into v_deja from ventes_paiements where operation_id = p_operation;
  if p_montant is null or p_montant <= 0 or p_montant > o.montant - v_deja + 0.005 then
    raise exception 'Montant invalide : il reste % € à affecter sur cette opération.', o.montant - v_deja; end if;
  select domaine into v_domaine from ventes_sous_categories where id = p_sous_categorie;
  if v_domaine is null then raise exception 'Objet de vente introuvable.'; end if;
  v_ex := coalesce(o.exercice_id,
    (select id from exercices where o.date_operation between date_debut and date_fin order by date_debut desc limit 1));
  if v_ex is null then raise exception 'Aucun exercice pour cette opération.'; end if;
  insert into ventes_dues (exercice_id, sous_categorie_id, domaine, famille_id, contact_id, libelle_payeur,
                           montant_attendu, mode_attendu, notes)
  values (v_ex, p_sous_categorie, v_domaine, p_famille, p_contact, nullif(trim(p_libelle_payeur), ''),
          p_montant, p_mode, 'Depuis la Comptabilité · ' || to_char(o.date_operation, 'DD/MM/YYYY'))
  returning id into v_due;
  perform public.ventes_rattacher_operation(v_due, p_operation, p_montant);
  return v_due;
end $$;
