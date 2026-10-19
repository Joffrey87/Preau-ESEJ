-- Carnet : catégories multiples étendues (Ancienne famille, Acheteur, Rôles : Bénévole (Évènementiel), Administration).
-- « parent » reste le slug de la catégorie Famille, « enseignant » celui de Professeur. Additif : ajout de slugs seulement.
update public.contacts set categories = array_append(categories, 'ancienne_famille')
 where famille_statut = 'ancienne' and not ('ancienne_famille' = any(categories));

update public.contacts c set categories = array_append(c.categories, 'benevole_evenement')
 where c.supprime_le is null and not ('benevole_evenement' = any(c.categories))
   and exists (select 1 from public.evenement_membres m where m.actif and (
         (m.famille_id is not null and c.famille_id = m.famille_id and lower(c.prenom) = lower(m.prenom))
      or (lower(c.nom) = lower(m.nom) and lower(coalesce(c.prenom, '')) = lower(coalesce(m.prenom, '')))));

update public.contacts c set categories = array_append(c.categories, 'donateur')
 where c.supprime_le is null and not ('donateur' = any(c.categories))
   and exists (select 1 from public.dons d where d.supprime_le is null
                 and lower(d.donateur_nom) = lower(c.nom) and lower(coalesce(d.donateur_prenom, '')) = lower(coalesce(c.prenom, '')));
