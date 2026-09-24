alter table public.dons
  add column if not exists operation_id uuid references public.operations(id) on delete set null;

create index if not exists dons_operation_id_idx on public.dons(operation_id) where operation_id is not null;
