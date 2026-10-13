-- Règle : chaque profil administrateur ne voit que ses propres onglets, plus ceux ouverts à la main via la page Webmestre.
-- Les droits Événement de la Directrice et du Président avaient été posés par défaut (aucune trace dans acces_historique) :
-- on les remet à « masque ». Ils accèdent à l'espace Événement par le logo s'ils y sont reliés. RLS de lecture inchangée.
update public.acces_profils set niveau = 'masque'
where profil in ('directrice','president') and page like '/evenement%'
  and not exists (select 1 from public.acces_historique h where h.profil = acces_profils.profil and h.page = acces_profils.page);
