-- Caisses : tout profil ayant accès aux ventes/caisses lit les soldes et le détail des deux caisses
-- (sélecteur Caisse école / Caisse Événement / Caisse totale). L'écriture reste limitée aux domaines accordés.
drop policy if exists caisse_mouv_lecture on public.caisse_mouvements;
create policy caisse_mouv_lecture on public.caisse_mouvements for select to authenticated
  using (public.voit_ventes_diverses());

drop policy if exists caisses_lecture on public.caisses;
create policy caisses_lecture on public.caisses for select to authenticated
  using (public.voit_ventes_diverses());
