/* ==========================================================================
   20261014120100_seguranca_rls.sql
   Acesso por equipe: só usuários logados E cadastrados em public.membros
   leem e gravam os dados da empresa. Visitantes anônimos (anon key) não
   enxergam nada. A tabela membros só é alterada por administradores (ou
   pelo SQL Editor do Supabase, que não passa pela RLS).

   Primeiro acesso: depois que você criar seu usuário no Supabase Auth,
   rode no SQL Editor (trocando o e-mail):
     insert into public.membros (user_id, nome, papel)
     select id, 'Seu nome', 'admin' from auth.users where email = 'voce@empresa.com.br';
   ========================================================================== */

create table public.membros (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  criado_em timestamptz not null default now()
);

-- SECURITY DEFINER para consultar membros sem cair na própria RLS da tabela.
create function controle.eh_membro() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros where user_id = (select auth.uid()));
$$;

create function controle.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros where user_id = (select auth.uid()) and papel = 'admin');
$$;

grant usage on schema controle to authenticated;
revoke all on all functions in schema controle from public, anon;
grant execute on function controle.eh_membro(), controle.eh_admin() to authenticated;

-- Membros: cada um vê a própria linha; membros veem a equipe; só admin altera.
alter table public.membros enable row level security;
create policy membros_leitura on public.membros for select to authenticated
  using (user_id = (select auth.uid()) or (select controle.eh_membro()));
create policy membros_inclusao on public.membros for insert to authenticated
  with check ((select controle.eh_admin()));
create policy membros_alteracao on public.membros for update to authenticated
  using ((select controle.eh_admin())) with check ((select controle.eh_admin()));
create policy membros_exclusao on public.membros for delete to authenticated
  using ((select controle.eh_admin()));

-- Dados da empresa: membros leem e gravam tudo; anônimos não têm política (nada passa).
do $$
declare
  t text;
begin
  foreach t in array array[
    'empresa', 'configuracoes', 'plano_contas',
    'centros', 'insumos', 'produtos', 'produto_ficha_tecnica', 'orgaos', 'documentos', 'alcadas',
    'contratos', 'contrato_itens', 'contrato_penalidades', 'empenhos', 'empenho_itens', 'empenho_entregas',
    'lotes', 'lote_consumos', 'lote_perdas', 'movimentos_estoque',
    'lancamentos', 'orcamento', 'demonstracoes',
    'indicadores', 'planos_acao', 'controles', 'controle_testes', 'aprovacoes', 'excecoes', 'log_auditoria',
    'exclusoes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy equipe_acesso on public.%I for all to authenticated
                    using ((select controle.eh_membro())) with check ((select controle.eh_membro()))', t);
  end loop;
end;
$$;

-- A trilha de auditoria não deve ser apagada nem reescrita pelo app.
drop policy equipe_acesso on public.log_auditoria;
create policy equipe_leitura on public.log_auditoria for select to authenticated
  using ((select controle.eh_membro()));
create policy equipe_inclusao on public.log_auditoria for insert to authenticated
  with check ((select controle.eh_membro()));
