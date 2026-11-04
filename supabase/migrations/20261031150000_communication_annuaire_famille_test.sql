-- Annuaire de la messagerie : une boîte peut être marquée « toujours joignable » (famille de test sans élève inscrit).
-- Les autres familles restent limitées à celles qui ont un élève dans une classe de l'année en cours ou à venir.

alter table public.com_boites add column if not exists toujours_joignable boolean not null default false;

update public.com_boites set toujours_joignable = true
 where famille_id = (select id from public.familles where nom = 'Lenoble');

create or replace function public.com_annuaire()
returns table (id uuid, libelle text, service text)
language sql stable security definer set search_path = public as $$
  select b.id, b.libelle, b.service from com_boites b
   where exists (select 1 from public.com_mes_boites())
     and b.id not in (select public.com_mes_boites())
     and (b.service is not null
          or b.toujours_joignable
          or exists (select 1 from eleves e join classe_eleves ce on ce.eleve_id = e.id join classes c on c.id = ce.classe_id
                      where e.famille_id = b.famille_id and c.annee_scolaire >= public.com_annee_courante()))
   order by b.service is null, b.ordre, b.libelle;
$$;
