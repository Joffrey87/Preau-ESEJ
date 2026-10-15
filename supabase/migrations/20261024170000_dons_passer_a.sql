-- Reçu « À passer » : la personne à qui le remettre (Secrétaire par défaut, Président, Chanoine ou un autre nom).
alter table public.dons add column if not exists passer_a text;
comment on column public.dons.passer_a is 'Reçu à passer à : null = Secrétaire ; sinon « Président », « Chanoine » ou un nom libre.';
