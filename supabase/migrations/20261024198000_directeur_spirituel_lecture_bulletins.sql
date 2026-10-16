-- Directeur spirituel : lecture de toutes les classes de Notes & Bulletins (élèves, matières, notes, relevés, bulletins) ;
-- l'écriture reste celle de peut_apprecier : seule l'appréciation du Catéchisme.
create or replace function public.enseigne_dans(p_classe uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.est_directrice() or public.mon_role() = 'directeur-spirituel' or public.est_titulaire(p_classe)
      or exists (select 1 from matieres where classe_id = p_classe and public.mon_enseignant() = any (enseignants));
$$;

create or replace function public.acces_bulletins()
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.est_directrice() or public.mon_role() = 'directeur-spirituel' or public.mon_enseignant() is not null;
$$;
