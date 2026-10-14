-- Comptabilité → Ventes diverses : le Trésorier affecte une opération « Ventes diverses » à un intitulé de vente.
-- Une ligne de vente (Payé) est créée pour la famille / personne, rattachée à l'opération. Additif.

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
  v_ex := coalesce(o.exercice_id,
    (select id from exercices where o.date_operation between date_debut and date_fin order by date_debut desc limit 1));
  if v_ex is null then raise exception 'Aucun exercice pour cette opération.'; end if;
  insert into ventes_dues (exercice_id, sous_categorie_id, domaine, famille_id, contact_id, libelle_payeur,
                           montant_attendu, mode_attendu, notes)
  values (v_ex, p_sous_categorie, 'ecole', p_famille, p_contact, nullif(trim(p_libelle_payeur), ''),
          p_montant, p_mode, 'Depuis la Comptabilité · ' || to_char(o.date_operation, 'DD/MM/YYYY'))
  returning id into v_due;
  perform public.ventes_rattacher_operation(v_due, p_operation, p_montant);
  return v_due;
end $$;
revoke execute on function public.ventes_creer_depuis_operation(uuid, uuid, uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.ventes_creer_depuis_operation(uuid, uuid, uuid, uuid, text, numeric, text) to authenticated;

-- Retirer une vente créée / rattachée depuis une opération : détache le paiement, réduit la ventilation,
-- et supprime la ligne de vente si elle n'a plus aucun paiement et venait de la Comptabilité.
create or replace function public.ventes_retirer_de_operation(p_due uuid, p_operation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d ventes_dues%rowtype; m numeric;
begin
  if not public.est_tresorier_strict() then raise exception 'Réservé au Trésorier.'; end if;
  select * into d from ventes_dues where id = p_due;
  if not found then raise exception 'Vente introuvable.'; end if;
  select coalesce(sum(montant), 0) into m from ventes_paiements where vente_due_id = p_due and operation_id = p_operation;
  delete from ventes_paiements where vente_due_id = p_due and operation_id = p_operation;
  delete from ventes_ventilations
   where operation_id = p_operation and sous_categorie_id = d.sous_categorie_id and montant - m <= 0.004;
  update ventes_ventilations set montant = montant - m
   where operation_id = p_operation and sous_categorie_id = d.sous_categorie_id;
  if d.notes like 'Depuis la Comptabilité%' and not exists (select 1 from ventes_paiements where vente_due_id = p_due) then
    delete from ventes_dues where id = p_due;
  end if;
end $$;
revoke execute on function public.ventes_retirer_de_operation(uuid, uuid) from public, anon;
grant execute on function public.ventes_retirer_de_operation(uuid, uuid) to authenticated;
