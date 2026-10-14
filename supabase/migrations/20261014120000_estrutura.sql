/* ==========================================================================
   20261014120000_estrutura.sql
   Estrutura do banco do Controladoria, modelada a partir de js/core/schema.js
   (versão 1 do esquema). Cada coleção do localStorage vira uma tabela; as
   listas internas (itens, entregas, ficha técnica, consumo, perdas, testes)
   viram tabelas-filhas; os grupos de campos (garantia, liquidação,
   pagamento) viram colunas com prefixo.

   Convenções:
   - "id" das coleções é TEXTO gerado no navegador (store.novoId), o que
     permite cadastrar offline e sincronizar depois sem trocar o id;
   - criado_em / atualizado_em vêm do app; servidor_em é carimbado pelo
     banco a cada gravação (usado na sincronização incremental);
   - extras (jsonb) guarda campos que o app enviar e que ainda não têm
     coluna, para nada se perder numa ida e volta;
   - CHECKs seguem as mesmas regras do schema.js (sem ser mais restritivos,
     para um registro salvo offline nunca ser recusado na sincronização).
   ========================================================================== */

-- Esquema interno (não exposto pela API REST do Supabase).
create schema if not exists controle;

-- --------------------------------------------------------------------------
-- Tipos de apoio
-- --------------------------------------------------------------------------
create domain public.moeda as numeric(18, 2);          -- valores totais em R$
create domain public.preco as numeric(18, 4);          -- preços unitários (licitações usam 4 casas)
create domain public.quantidade as numeric(18, 4);     -- quantidades, kg, horas
create domain public.fracao as numeric(9, 6);          -- percentuais como fração 0–1 (igual ao app)
create domain public.competencia as text
  check (value ~ '^\d{4}-(0[1-9]|1[0-2])$');           -- mês no formato AAAA-MM

-- Carimbos de gravação, comum a todas as tabelas principais.
create function controle.carimbar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.servidor_em := now();
  new.criado_em := coalesce(new.criado_em, now());
  new.atualizado_em := coalesce(new.atualizado_em, now());
  new.extras := coalesce(new.extras, '{}'::jsonb);
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Registros únicos: empresa e configurações
-- --------------------------------------------------------------------------
create table public.empresa (
  id smallint primary key default 1 check (id = 1),
  nome text,
  competencia_atual public.competencia not null,
  aliquota_efetiva public.fracao check (aliquota_efetiva between 0 and 1),
  custo_capital_aa public.fracao check (custo_capital_aa between 0 and 2),
  dias_periodo integer not null check (dias_periodo between 1 and 366),
  numero_funcionarios integer check (numero_funcionarios >= 0),
  saldo_inicial_caixa public.moeda,
  data_saldo_inicial date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- O nome do usuário (configuracoes.usuario) continua só no navegador:
-- cada pessoa da equipe tem o seu.
create table public.configuracoes (
  id smallint primary key default 1 check (id = 1),
  criterio_rateio_cif text not null default 'horas' check (criterio_rateio_cif in ('horas', 'kg')),
  alertas jsonb not null default '{}',
  volume_orcado jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- --------------------------------------------------------------------------
-- Plano de contas (novo). Lançamentos e orçamento continuam com a categoria
-- e a conta em texto (o app casa pelo nome); a coluna conta_id é preenchida
-- automaticamente pelo nome, criando a conta se ela ainda não existir.
-- --------------------------------------------------------------------------
create table public.plano_contas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  nome text not null,
  natureza text not null check (natureza in ('receita', 'custo', 'patrimonial')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index plano_contas_nome_unico on public.plano_contas (lower(nome));

-- Contas usadas de forma fixa pelo código (calc/orcamento.js e modules/contratos.js).
insert into public.plano_contas (codigo, nome, natureza) values
  ('1.01', 'Receita de contratos', 'receita'),
  ('9.01', 'Recebimento de contratos', 'patrimonial'),
  ('9.02', 'Recebimento estimado de contratos', 'patrimonial'),
  ('9.03', 'Amortização de empréstimo', 'patrimonial'),
  ('9.04', 'Investimentos', 'patrimonial');

-- --------------------------------------------------------------------------
-- Cadastros
-- --------------------------------------------------------------------------
create table public.centros (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('custo', 'receita', 'resultado', 'investimento')),
  responsavel text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.insumos (
  id text primary key,
  nome text not null,
  unidade text not null,
  preco_padrao public.preco not null check (preco_padrao >= 0),
  validade_dias integer check (validade_dias >= 0),
  estoque_minimo public.quantidade check (estoque_minimo >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.produtos (
  id text primary key,
  nome text not null,
  unidade text not null,
  peso_kg public.quantidade check (peso_kg >= 0),
  validade_dias integer check (validade_dias >= 0),
  rendimento_padrao public.fracao not null check (rendimento_padrao between 0.01 and 1),
  mod_padrao public.preco not null check (mod_padrao >= 0),
  cif_padrao public.preco not null check (cif_padrao >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- produtos.fichaTecnica[]
create table public.produto_ficha_tecnica (
  id bigint generated always as identity primary key,
  produto_id text not null references public.produtos (id) on delete cascade,
  ordem integer not null,
  insumo_id text not null references public.insumos (id),
  qtd_padrao public.quantidade not null check (qtd_padrao >= 0),
  extras jsonb not null default '{}'
);

create table public.orgaos (
  id text primary key,
  nome text not null,
  esfera text not null check (esfera in ('municipal', 'estadual', 'federal')),
  uf text not null check (char_length(uf) <= 2),
  prazo_pagamento_contratual integer not null check (prazo_pagamento_contratual >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.documentos (
  id text primary key,
  nome text not null,
  vencimento date not null,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.alcadas (
  id text primary key,
  operacao text not null,
  limite public.moeda not null check (limite >= 0),
  aprovador text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- --------------------------------------------------------------------------
-- Contratos públicos (B2G)
-- --------------------------------------------------------------------------
create table public.contratos (
  id text primary key,
  numero text not null,
  tipo text not null check (tipo in ('ata', 'contrato')),
  orgao_id text not null references public.orgaos (id),
  processo text,
  modalidade text,
  assinatura date,
  vigencia_inicio date not null,
  vigencia_fim date not null,
  data_base_proposta date not null,
  indice_reajuste text,
  garantia_valor public.moeda check (garantia_valor >= 0),
  garantia_vencimento date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- contratos.itens[]
create table public.contrato_itens (
  id bigint generated always as identity primary key,
  contrato_id text not null references public.contratos (id) on delete cascade,
  ordem integer not null,
  produto_id text not null references public.produtos (id),
  qtd_registrada public.quantidade not null check (qtd_registrada >= 0),
  preco_contratado public.preco not null check (preco_contratado >= 0),
  custo_proposta public.preco not null check (custo_proposta >= 0),
  extras jsonb not null default '{}'
);

-- contratos.penalidades[]
create table public.contrato_penalidades (
  id bigint generated always as identity primary key,
  contrato_id text not null references public.contratos (id) on delete cascade,
  ordem integer not null,
  data date not null,
  motivo text not null,
  valor public.moeda not null check (valor >= 0),
  extras jsonb not null default '{}'
);

create table public.empenhos (
  id text primary key,
  contrato_id text not null references public.contratos (id),
  numero text not null,
  data date not null,
  liquidacao_data date,
  liquidacao_valor public.moeda check (liquidacao_valor >= 0),
  liquidacao_glosa public.moeda check (liquidacao_glosa >= 0),
  pagamento_data date,
  pagamento_valor public.moeda check (pagamento_valor >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- empenhos.itens[]
create table public.empenho_itens (
  id bigint generated always as identity primary key,
  empenho_id text not null references public.empenhos (id) on delete cascade,
  ordem integer not null,
  produto_id text not null references public.produtos (id),
  qtd public.quantidade not null check (qtd >= 0),
  extras jsonb not null default '{}'
);

-- empenhos.entregas[] (com nota fiscal)
create table public.empenho_entregas (
  id bigint generated always as identity primary key,
  empenho_id text not null references public.empenhos (id) on delete cascade,
  ordem integer not null,
  produto_id text not null references public.produtos (id),
  prevista date not null,
  "real" date,
  nf text,
  qtd public.quantidade not null check (qtd >= 0),
  valor public.moeda not null check (valor >= 0),
  frete public.moeda check (frete >= 0),
  extras jsonb not null default '{}'
);

-- --------------------------------------------------------------------------
-- Produção e estoque
-- --------------------------------------------------------------------------
create table public.lotes (
  id text primary key,
  produto_id text not null references public.produtos (id),
  lote text not null,
  data date not null,
  qtd_planejada public.quantidade check (qtd_planejada >= 0),
  qtd_produzida public.quantidade not null check (qtd_produzida >= 0),
  horas_producao public.quantidade check (horas_producao >= 0),
  mod_real public.moeda check (mod_real >= 0),
  horas_paradas public.quantidade check (horas_paradas >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- lotes.consumo[]
create table public.lote_consumos (
  id bigint generated always as identity primary key,
  lote_id text not null references public.lotes (id) on delete cascade,
  ordem integer not null,
  insumo_id text not null references public.insumos (id),
  qtd public.quantidade not null check (qtd >= 0),
  preco_real public.preco not null check (preco_real >= 0),
  extras jsonb not null default '{}'
);

-- lotes.perdas[]
create table public.lote_perdas (
  id bigint generated always as identity primary key,
  lote_id text not null references public.lotes (id) on delete cascade,
  ordem integer not null,
  motivo text not null check (motivo in ('processo', 'validade', 'avaria', 'qualidade')),
  qtd public.quantidade check (qtd >= 0),
  valor public.moeda not null check (valor >= 0),
  extras jsonb not null default '{}'
);

-- Movimentos de estoque: item_id aponta para insumos OU produtos conforme
-- item_tipo. As colunas geradas insumo_id/produto_id dão a chave estrangeira.
create table public.movimentos_estoque (
  id text primary key,
  data date not null,
  item_tipo text not null check (item_tipo in ('insumo', 'produto')),
  item_id text not null,
  insumo_id text generated always as (case when item_tipo = 'insumo' then item_id end) stored
    references public.insumos (id),
  produto_id text generated always as (case when item_tipo = 'produto' then item_id end) stored
    references public.produtos (id),
  tipo text not null check (tipo in ('entrada', 'saida', 'perda', 'ajuste')),
  qtd public.quantidade not null,              -- ajuste aceita negativo
  valor public.moeda,
  lote text,
  validade date,
  documento text,
  motivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- --------------------------------------------------------------------------
-- Financeiro
-- --------------------------------------------------------------------------
create table public.lancamentos (
  id text primary key,
  data date not null,
  competencia public.competencia not null,
  tipo text not null check (tipo in ('entrada', 'saida')),
  categoria text not null,
  conta_id uuid references public.plano_contas (id),
  centro_id text references public.centros (id),
  contrato_id text references public.contratos (id),
  valor public.moeda not null check (valor >= 0),
  situacao text not null check (situacao in ('previsto', 'realizado')),
  descricao text,
  origem_id text,                              -- empenho que gerou o lançamento (pagamento)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.orcamento (
  id text primary key,
  competencia public.competencia not null,
  centro_id text not null references public.centros (id),
  conta text not null,
  conta_id uuid references public.plano_contas (id),
  natureza text not null check (natureza in ('receita', 'custo')),
  valor public.moeda not null check (valor >= 0),
  parte_variavel public.fracao not null check (parte_variavel between 0 and 1),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}',
  unique (competencia, centro_id, conta)
);

-- Demonstração mensal: DRE (11), balanço (14) e apoio (3). Só o PL aceita negativo.
create table public.demonstracoes (
  id text primary key,
  competencia public.competencia not null unique,
  receita_bruta public.moeda not null check (receita_bruta >= 0),
  deducoes public.moeda not null check (deducoes >= 0),
  cpv public.moeda not null check (cpv >= 0),
  custos_variaveis public.moeda not null check (custos_variaveis >= 0),
  despesas_variaveis public.moeda not null check (despesas_variaveis >= 0),
  custos_fixos public.moeda not null check (custos_fixos >= 0),
  despesas_fixas public.moeda not null check (despesas_fixas >= 0),
  depreciacao public.moeda not null check (depreciacao >= 0),
  despesas_financeiras public.moeda not null check (despesas_financeiras >= 0),
  receitas_financeiras public.moeda not null check (receitas_financeiras >= 0),
  ir_csll public.moeda not null check (ir_csll >= 0),
  disponivel public.moeda not null check (disponivel >= 0),
  contas_receber public.moeda not null check (contas_receber >= 0),
  estoques public.moeda not null check (estoques >= 0),
  outros_ac public.moeda not null check (outros_ac >= 0),
  rlp public.moeda not null check (rlp >= 0),
  imobilizado public.moeda not null check (imobilizado >= 0),
  intangivel public.moeda not null check (intangivel >= 0),
  fornecedores public.moeda not null check (fornecedores >= 0),
  emprestimos_cp public.moeda not null check (emprestimos_cp >= 0),
  obrigacoes_operacionais public.moeda not null check (obrigacoes_operacionais >= 0),
  outros_pc public.moeda not null check (outros_pc >= 0),
  emprestimos_lp public.moeda not null check (emprestimos_lp >= 0),
  outros_pnc public.moeda not null check (outros_pnc >= 0),
  pl public.moeda not null,
  compras public.moeda not null check (compras >= 0),
  cif_fixos_estoque_inicial public.moeda not null check (cif_fixos_estoque_inicial >= 0),
  cif_fixos_estoque_final public.moeda not null check (cif_fixos_estoque_final >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- --------------------------------------------------------------------------
-- Gestão e governança
-- --------------------------------------------------------------------------
create table public.indicadores (
  id text primary key,                         -- ex.: 'mc_pct' (calc/indicadores.js)
  nome text not null,
  perspectiva text not null check (perspectiva in ('financeira', 'clientes', 'processos', 'aprendizado')),
  unidade text not null check (unidade in ('pct', 'moeda', 'dias', 'vezes', 'numero', 'quantidade', 'kg')),
  formula text not null,
  funcao_calculo text not null,
  sentido text not null check (sentido in ('maior-melhor', 'menor-melhor')),
  meta numeric,
  tolerancia_atencao numeric check (tolerancia_atencao >= 0),
  tolerancia_fora numeric check (tolerancia_fora >= 0),
  responsavel text,
  periodicidade text,
  controlavel text not null check (controlavel in ('sim', 'parcial', 'nao')),
  acao_sugerida text,
  fonte text not null,
  colecoes_fonte text[],
  historico boolean,
  pareado_com text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.planos_acao (
  id text primary key,
  origem text not null check (origem in ('alerta', 'indicador', 'manual')),
  referencia_id text,
  desvio text not null,
  causa text,
  acao text not null,
  responsavel text not null,
  prazo date not null,
  status text not null check (status in ('aberto', 'andamento', 'concluido', 'cancelado')),
  efeito text,
  data_conclusao date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.controles (
  id text primary key,
  area text not null check (area in ('compras', 'estoque', 'faturamento', 'tesouraria', 'contratos')),
  controle text not null,
  frequencia text not null check (frequencia in ('semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual')),
  ultimo_teste date,
  resultado text check (resultado in ('efetivo', 'ressalva', 'falha')),
  responsavel text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- controles.testes[]
create table public.controle_testes (
  id bigint generated always as identity primary key,
  controle_id text not null references public.controles (id) on delete cascade,
  ordem integer not null,
  data date not null,
  resultado text not null check (resultado in ('efetivo', 'ressalva', 'falha')),
  observacao text,
  extras jsonb not null default '{}'
);

create table public.aprovacoes (
  id text primary key,
  data date not null,
  operacao text not null,
  valor public.moeda not null check (valor >= 0),
  aprovador text not null,
  referencia text,
  justificativa text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

create table public.excecoes (
  id text primary key,
  alerta_chave text not null,
  titulo text,
  justificativa text not null,
  autor text not null,
  data date not null,
  valido_ate date not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- Coleção "log" do app (trilha de auditoria).
create table public.log_auditoria (
  id text primary key,
  data timestamptz not null,
  autor text not null,
  entidade text,
  entidade_id text,
  tipo text not null check (tipo in ('alteracao', 'excecao', 'aprovacao', 'sistema', 'exclusao')),
  descricao text not null,
  justificativa text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  servidor_em timestamptz not null default now(),
  extras jsonb not null default '{}'
);

-- Registros apagados (para a exclusão chegar aos outros navegadores na sincronização).
create table public.exclusoes (
  colecao text not null,
  registro_id text not null,
  excluido_em timestamptz not null default now(),
  excluido_por uuid default auth.uid(),
  primary key (colecao, registro_id)
);

-- --------------------------------------------------------------------------
-- Carimbos de gravação em todas as tabelas principais
-- --------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'empresa', 'configuracoes', 'centros', 'insumos', 'produtos', 'orgaos', 'documentos', 'alcadas',
    'contratos', 'empenhos', 'lotes', 'movimentos_estoque', 'lancamentos', 'orcamento', 'demonstracoes',
    'indicadores', 'planos_acao', 'controles', 'aprovacoes', 'excecoes', 'log_auditoria'
  ] loop
    -- Ordem de inserção: o app depende da ordem dos arrays (ex.: indicadores).
    execute format('alter table public.%I add column sequencia bigint generated always as identity', t);
    execute format('create trigger carimbar before insert or update on public.%I
                    for each row execute function controle.carimbar()', t);
    execute format('create index %I on public.%I (servidor_em)', t || '_servidor_em_idx', t);
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- Vínculo automático com o plano de contas (pelo nome da categoria/conta)
-- --------------------------------------------------------------------------
create function controle.vincular_conta() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_nome text;
  v_natureza text;
begin
  if tg_table_name = 'lancamentos' then
    v_nome := new.categoria;
    v_natureza := case when new.tipo = 'entrada' then 'receita' else 'custo' end;
  else
    v_nome := new.conta;
    v_natureza := new.natureza;
  end if;
  v_nome := btrim(v_nome);
  if v_nome is null or v_nome = '' then
    new.conta_id := null;
    return new;
  end if;
  insert into public.plano_contas (nome, natureza) values (v_nome, v_natureza)
    on conflict ((lower(nome))) do nothing;
  select id into new.conta_id from public.plano_contas where lower(nome) = lower(v_nome);
  return new;
end;
$$;

create trigger vincular_conta before insert or update of categoria, tipo on public.lancamentos
  for each row execute function controle.vincular_conta();
create trigger vincular_conta before insert or update of conta, natureza on public.orcamento
  for each row execute function controle.vincular_conta();

-- --------------------------------------------------------------------------
-- Índices nas colunas mais consultadas (chaves estrangeiras, datas, competências)
-- --------------------------------------------------------------------------
create index produto_ficha_tecnica_produto_idx on public.produto_ficha_tecnica (produto_id, ordem);
create index produto_ficha_tecnica_insumo_idx on public.produto_ficha_tecnica (insumo_id);
create index contratos_orgao_idx on public.contratos (orgao_id);
create index contratos_vigencia_fim_idx on public.contratos (vigencia_fim);
create index contrato_itens_contrato_idx on public.contrato_itens (contrato_id, ordem);
create index contrato_itens_produto_idx on public.contrato_itens (produto_id);
create index contrato_penalidades_contrato_idx on public.contrato_penalidades (contrato_id, ordem);
create index empenhos_contrato_idx on public.empenhos (contrato_id);
create index empenhos_data_idx on public.empenhos (data);
create index empenho_itens_empenho_idx on public.empenho_itens (empenho_id, ordem);
create index empenho_itens_produto_idx on public.empenho_itens (produto_id);
create index empenho_entregas_empenho_idx on public.empenho_entregas (empenho_id, ordem);
create index empenho_entregas_produto_idx on public.empenho_entregas (produto_id);
create index empenho_entregas_prevista_idx on public.empenho_entregas (prevista);
create index lotes_produto_idx on public.lotes (produto_id);
create index lotes_data_idx on public.lotes (data);
create index lote_consumos_lote_idx on public.lote_consumos (lote_id, ordem);
create index lote_consumos_insumo_idx on public.lote_consumos (insumo_id);
create index lote_perdas_lote_idx on public.lote_perdas (lote_id, ordem);
create index movimentos_estoque_item_idx on public.movimentos_estoque (item_tipo, item_id, data);
create index movimentos_estoque_insumo_idx on public.movimentos_estoque (insumo_id);
create index movimentos_estoque_produto_idx on public.movimentos_estoque (produto_id);
create index movimentos_estoque_data_idx on public.movimentos_estoque (data);
create index lancamentos_competencia_idx on public.lancamentos (competencia);
create index lancamentos_data_idx on public.lancamentos (data);
create index lancamentos_centro_idx on public.lancamentos (centro_id);
create index lancamentos_contrato_idx on public.lancamentos (contrato_id);
create index lancamentos_conta_idx on public.lancamentos (conta_id);
create index lancamentos_origem_idx on public.lancamentos (origem_id);
create index orcamento_centro_idx on public.orcamento (centro_id);
create index orcamento_conta_idx on public.orcamento (conta_id);
create index documentos_vencimento_idx on public.documentos (vencimento);
create index planos_acao_status_prazo_idx on public.planos_acao (status, prazo);
create index controle_testes_controle_idx on public.controle_testes (controle_id, ordem);
create index excecoes_alerta_idx on public.excecoes (alerta_chave);
create index log_auditoria_data_idx on public.log_auditoria (data);
create index log_auditoria_entidade_idx on public.log_auditoria (entidade, entidade_id);
create index exclusoes_excluido_em_idx on public.exclusoes (excluido_em);
