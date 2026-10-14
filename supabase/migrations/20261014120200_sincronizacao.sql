/* ==========================================================================
   20261014120200_sincronizacao.sql
   Ponte entre o formato do app (o mesmo JSON do localStorage e do backup:
   camelCase, listas e grupos aninhados) e as tabelas relacionais.
   Funções chamadas pelo app (RPC):
   - salvar_registro(colecao, registro): grava um registro com suas listas
     internas, numa transação. Vence a versão com atualizadoEm mais recente;
   - remover_registro(colecao, id): apaga e anota em "exclusoes";
   - exportar_dados(desde): devolve tudo (ou só o que mudou desde uma data)
     no formato do app;
   - importar_dados(dados, substituir): rotina de migração do localStorage /
     de um backup JSON para o banco, numa única transação.
   Todas rodam com as permissões de quem chama (a RLS continua valendo).
   ========================================================================== */

-- --------------------------------------------------------------------------
-- Mapa coleção do app → tabela
-- --------------------------------------------------------------------------
create table controle.colecoes (
  colecao text primary key,                    -- nome no app (schema.js)
  tabela text not null,                        -- tabela em public
  ordem integer not null,                      -- ordem de gravação (respeita as chaves estrangeiras)
  unico boolean not null default false,        -- objeto único (empresa, configuracoes)
  imutavel boolean not null default false,     -- só inclusão (trilha de auditoria)
  objetos text[] not null default '{}',        -- grupos de campos guardados com prefixo
  ignorar text[] not null default '{}'         -- campos que ficam só no navegador
);

create table controle.listas (
  colecao text not null references controle.colecoes (colecao),
  campo text not null,                         -- nome da lista no app
  tabela text not null,                        -- tabela-filha
  coluna_pai text not null,
  primary key (colecao, campo)
);

insert into controle.colecoes (colecao, tabela, ordem, unico, imutavel, objetos, ignorar) values
  ('empresa',           'empresa',            1, true,  false, '{}', '{}'),
  ('configuracoes',     'configuracoes',      2, true,  false, '{}', '{usuario}'),
  ('centros',           'centros',            3, false, false, '{}', '{}'),
  ('insumos',           'insumos',            4, false, false, '{}', '{}'),
  ('produtos',          'produtos',           5, false, false, '{}', '{}'),
  ('orgaos',            'orgaos',             6, false, false, '{}', '{}'),
  ('documentos',        'documentos',         7, false, false, '{}', '{}'),
  ('alcadas',           'alcadas',            8, false, false, '{}', '{}'),
  ('contratos',         'contratos',          9, false, false, '{garantia}', '{}'),
  ('empenhos',          'empenhos',          10, false, false, '{liquidacao,pagamento}', '{}'),
  ('lotes',             'lotes',             11, false, false, '{}', '{}'),
  ('movimentosEstoque', 'movimentos_estoque',12, false, false, '{}', '{}'),
  ('lancamentos',       'lancamentos',       13, false, false, '{}', '{}'),
  ('orcamento',         'orcamento',         14, false, false, '{}', '{}'),
  ('demonstracoes',     'demonstracoes',     15, false, false, '{}', '{}'),
  ('indicadores',       'indicadores',       16, false, false, '{}', '{}'),
  ('planosAcao',        'planos_acao',       17, false, false, '{}', '{}'),
  ('controles',         'controles',         18, false, false, '{}', '{}'),
  ('aprovacoes',        'aprovacoes',        19, false, false, '{}', '{}'),
  ('excecoes',          'excecoes',          20, false, false, '{}', '{}'),
  ('log',               'log_auditoria',     21, false, true,  '{}', '{}');

insert into controle.listas (colecao, campo, tabela, coluna_pai) values
  ('produtos',  'fichaTecnica', 'produto_ficha_tecnica', 'produto_id'),
  ('contratos', 'itens',        'contrato_itens',        'contrato_id'),
  ('contratos', 'penalidades',  'contrato_penalidades',  'contrato_id'),
  ('empenhos',  'itens',        'empenho_itens',         'empenho_id'),
  ('empenhos',  'entregas',     'empenho_entregas',      'empenho_id'),
  ('lotes',     'consumo',      'lote_consumos',         'lote_id'),
  ('lotes',     'perdas',       'lote_perdas',           'lote_id'),
  ('controles', 'testes',       'controle_testes',       'controle_id');

grant select on controle.colecoes, controle.listas to authenticated;

-- --------------------------------------------------------------------------
-- Conversão de nomes: camelCase (app) ↔ snake_case (banco)
-- Siglas em maiúsculas viram um bloco só: outrosAC → outros_ac,
-- criterioRateioCIF → criterio_rateio_cif. Na volta, as partes listadas
-- em SIGLAS voltam em maiúsculas. Ao criar um campo novo com sigla no
-- schema.js, inclua a sigla aqui.
-- --------------------------------------------------------------------------
create function controle.para_snake(p_nome text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(p_nome, '([a-z0-9])([A-Z]+)', '\1_\2', 'g'));
$$;

create function controle.para_camel(p_nome text) returns text
language sql immutable set search_path = '' as $$
  select string_agg(
           case
             when n = 1 then parte
             when parte = any (array['ac', 'cp', 'lp', 'pc', 'pnc', 'aa', 'cif']) then upper(parte)
             else initcap(parte)
           end, '' order by n)
  from unnest(string_to_array(p_nome, '_')) with ordinality as x (parte, n);
$$;

-- Categoria do tipo da coluna (pg_type.typcategory) ou null se a coluna não
-- existe ou não aceita valor (gerada / identidade).
create function controle.tipo_coluna(p_tabela text, p_coluna text) returns "char"
language sql stable set search_path = '' as $$
  select t.typcategory
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_type t on t.oid = a.atttypid
  where a.attrelid = pg_catalog.to_regclass('public.' || quote_ident(p_tabela))
    and a.attname = p_coluna and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = '' and a.attidentity = '';
$$;

-- A coluna faz parte de uma chave estrangeira? (o app grava '' para "sem vínculo")
create function controle.eh_chave_estrangeira(p_tabela text, p_coluna text) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from pg_catalog.pg_constraint k
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
    where k.conrelid = pg_catalog.to_regclass('public.' || quote_ident(p_tabela))
      and k.contype = 'f' and a.attname = p_coluna);
$$;

-- Colunas calculadas pelo banco (geradas / identidade), que não voltam para o app.
create function controle.colunas_internas(p_tabela text) returns text[]
language sql stable set search_path = '' as $$
  select coalesce(array_agg(a.attname::text), '{}')
  from pg_catalog.pg_attribute a
  where a.attrelid = pg_catalog.to_regclass('public.' || quote_ident(p_tabela))
    and a.attnum > 0 and not a.attisdropped
    and (a.attgenerated <> '' or a.attidentity <> '');
$$;

-- Lista de colunas graváveis de uma tabela, para montar o INSERT.
create function controle.colunas(p_tabela text, p_excluir text[] default '{}') returns text
language sql stable set search_path = '' as $$
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
  from pg_catalog.pg_attribute a
  where a.attrelid = pg_catalog.to_regclass('public.' || quote_ident(p_tabela))
    and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = '' and a.attidentity = ''
    and a.attname <> all (p_excluir);
$$;

/**
 * Registro do app (camelCase) → linha da tabela (snake_case).
 * Grupos (garantia, pagamento…) viram colunas com prefixo; texto vazio em
 * coluna que não é texto (ou que é chave estrangeira) vira null; campos sem coluna vão para "extras".
 */
create function controle.para_linha(p_tabela text, p_json jsonb, p_objetos text[] default '{}', p_ignorar text[] default '{}')
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_linha jsonb := '{}';
  v_extras jsonb := '{}';
  v_chave text;
  v_valor jsonb;
  v_sub text;
  v_subvalor jsonb;
  v_coluna text;
  v_tipo "char";
begin
  for v_chave, v_valor in select key, value from jsonb_each(coalesce(p_json, '{}')) loop
    continue when v_chave = any (p_ignorar) or v_chave in ('extras', 'servidorEm');
    if v_chave = any (p_objetos) then
      continue when jsonb_typeof(v_valor) <> 'object';
      for v_sub, v_subvalor in select key, value from jsonb_each(v_valor) loop
        v_coluna := controle.para_snake(v_chave) || '_' || controle.para_snake(v_sub);
        v_tipo := controle.tipo_coluna(p_tabela, v_coluna);
        if v_tipo is null then
          v_extras := v_extras || jsonb_build_object(v_chave,
            coalesce(v_extras -> v_chave, '{}') || jsonb_build_object(v_sub, v_subvalor));
        else
          if v_subvalor = '""'::jsonb and (v_tipo <> 'S' or controle.eh_chave_estrangeira(p_tabela, v_coluna)) then
            v_subvalor := 'null';
          end if;
          v_linha := v_linha || jsonb_build_object(v_coluna, v_subvalor);
        end if;
      end loop;
    else
      v_coluna := controle.para_snake(v_chave);
      v_tipo := controle.tipo_coluna(p_tabela, v_coluna);
      if v_tipo is null or v_coluna in ('conta_id', 'servidor_em') then
        v_extras := v_extras || jsonb_build_object(v_chave, v_valor);
      else
        if v_valor = '""'::jsonb and (v_tipo <> 'S' or controle.eh_chave_estrangeira(p_tabela, v_coluna)) then
          v_valor := 'null';
        end if;
        v_linha := v_linha || jsonb_build_object(v_coluna, v_valor);
      end if;
    end if;
  end loop;
  if controle.tipo_coluna(p_tabela, 'extras') is not null then
    v_linha := v_linha || jsonb_build_object('extras', v_extras);
  end if;
  return v_linha;
end;
$$;

/** Linha da tabela → registro do app (inverso de para_linha). */
create function controle.para_registro(p_linha jsonb, p_objetos text[] default '{}', p_omitir text[] default '{}')
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_json jsonb := '{}';
  v_chave text;
  v_valor jsonb;
  v_objeto text;
  v_prefixo text;
  v_achou text;
begin
  for v_chave, v_valor in
    select key, value from jsonb_each(p_linha - p_omitir - array['extras', 'servidor_em', 'conta_id'])
  loop
    v_achou := null;
    foreach v_objeto in array p_objetos loop
      v_prefixo := controle.para_snake(v_objeto) || '_';
      if left(v_chave, length(v_prefixo)) = v_prefixo then
        v_achou := v_objeto;
        exit;
      end if;
    end loop;
    if v_achou is not null then
      v_json := jsonb_set(v_json, array[v_achou],
        coalesce(v_json -> v_achou, '{}')
          || jsonb_build_object(controle.para_camel(substr(v_chave, length(v_prefixo) + 1)), v_valor));
    else
      v_json := v_json || jsonb_build_object(controle.para_camel(v_chave), v_valor);
    end if;
  end loop;
  return coalesce(p_linha -> 'extras', '{}') || v_json;
end;
$$;

grant execute on all functions in schema controle to authenticated;

-- --------------------------------------------------------------------------
-- Funções chamadas pelo app (RPC)
-- --------------------------------------------------------------------------

/**
 * Grava um registro (inclui ou atualiza) com suas listas internas.
 * Se o banco já tiver uma versão mais recente (atualizado_em maior), nada
 * muda e o retorno é {"status": "ignorado"}.
 */
create function public.salvar_registro(p_colecao text, p_registro jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  c controle.colecoes;
  l controle.listas;
  v_listas text[];
  v_linha jsonb;
  v_id text;
  v_cols text;
  v_set text;
  v_conflito text;
  v_n integer;
  v_item jsonb;
  v_ordem bigint;
begin
  select * into c from controle.colecoes where colecao = p_colecao;
  if not found then
    raise exception 'Coleção desconhecida: %', p_colecao using errcode = '22023';
  end if;
  if p_registro is null or jsonb_typeof(p_registro) <> 'object' then
    raise exception 'Registro vazio em %.', p_colecao using errcode = '22023';
  end if;

  select coalesce(array_agg(campo), '{}') into v_listas from controle.listas where colecao = p_colecao;
  v_linha := controle.para_linha(c.tabela, p_registro, c.objetos, c.ignorar || v_listas);

  if c.unico then
    v_linha := v_linha || '{"id": 1}';
  elsif coalesce(v_linha ->> 'id', '') = '' then
    raise exception 'Registro sem id em %.', p_colecao using errcode = '22023';
  end if;
  v_id := v_linha ->> 'id';

  v_cols := controle.colunas(c.tabela);
  select string_agg(format('%I = excluded.%I', a, a), ', ') into v_set
  from unnest(string_to_array(replace(controle.colunas(c.tabela, array['id', 'criado_em']), '"', ''), ', ')) as a;
  v_conflito := case when c.imutavel then 'do nothing'
                     else format('do update set %s where t.atualizado_em <= excluded.atualizado_em', v_set) end;

  execute format(
    'insert into public.%I as t (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (id) %s',
    c.tabela, v_cols, v_cols, c.tabela, v_conflito)
  using v_linha;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('status', 'ignorado', 'id', v_id);
  end if;

  -- Listas internas: substitui todas as linhas-filhas pelo conteúdo enviado.
  for l in select * from controle.listas where colecao = p_colecao loop
    execute format('delete from public.%I where %I = $1', l.tabela, l.coluna_pai) using v_id;
    v_cols := controle.colunas(l.tabela);
    for v_item, v_ordem in
      select value, ordinality from jsonb_array_elements(
        case when jsonb_typeof(p_registro -> l.campo) = 'array' then p_registro -> l.campo else '[]' end)
        with ordinality
    loop
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
        l.tabela, v_cols, v_cols, l.tabela)
      using controle.para_linha(l.tabela, v_item) || jsonb_build_object(l.coluna_pai, v_id, 'ordem', v_ordem);
    end loop;
  end loop;

  if not c.unico then
    delete from public.exclusoes where colecao = p_colecao and registro_id = v_id;
  end if;
  return jsonb_build_object('status', 'salvo', 'id', v_id);
end;
$$;

/** Apaga um registro (as listas internas vão junto) e anota a exclusão. */
create function public.remover_registro(p_colecao text, p_id text) returns void
language plpgsql set search_path = '' as $$
declare
  c controle.colecoes;
begin
  select * into c from controle.colecoes where colecao = p_colecao;
  if not found or c.unico then
    raise exception 'Não é possível remover registros de %.', p_colecao using errcode = '22023';
  end if;
  execute format('delete from public.%I where id = $1', c.tabela) using p_id;
  insert into public.exclusoes (colecao, registro_id) values (p_colecao, p_id)
    on conflict (colecao, registro_id) do update set excluido_em = now(), excluido_por = auth.uid();
end;
$$;

/**
 * Devolve os dados no formato do app. Com p_desde, só o que foi gravado
 * depois dessa data (e as exclusões do período). "meta.servidorEm" é o
 * relógio do banco, para usar como p_desde na próxima chamada.
 */
create function public.exportar_dados(p_desde timestamptz default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  c controle.colecoes;
  l controle.listas;
  v_saida jsonb;
  v_lista jsonb;
  v_linha jsonb;
  v_reg jsonb;
  v_filhos jsonb;
begin
  v_saida := jsonb_build_object('meta', jsonb_build_object('esquema', 1, 'servidorEm', now()));

  for c in select * from controle.colecoes order by ordem loop
    v_lista := '[]';
    for v_linha in execute format(
      'select to_jsonb(t) from public.%I t where $1 is null or t.servidor_em > $1 order by t.criado_em, t.sequencia',
      c.tabela) using p_desde
    loop
      v_reg := controle.para_registro(v_linha, c.objetos, controle.colunas_internas(c.tabela));
      for l in select * from controle.listas where colecao = c.colecao loop
        execute format(
          'select coalesce(jsonb_agg(controle.para_registro(to_jsonb(f), ''{}'', array[%L, ''ordem''] || controle.colunas_internas(%L)) order by f.ordem), ''[]'')
           from public.%I f where f.%I = $1', l.coluna_pai, l.tabela, l.tabela, l.coluna_pai)
        into v_filhos using v_linha ->> 'id';
        v_reg := v_reg || jsonb_build_object(l.campo, v_filhos);
      end loop;
      if c.unico then
        v_reg := v_reg - 'id';
      end if;
      v_lista := v_lista || jsonb_build_array(v_reg);
    end loop;

    if c.unico then
      if jsonb_array_length(v_lista) > 0 then
        v_saida := v_saida || jsonb_build_object(c.colecao, v_lista -> 0);
      end if;
    else
      v_saida := v_saida || jsonb_build_object(c.colecao, v_lista);
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('colecao', colecao, 'id', registro_id, 'excluidoEm', excluido_em)
                            order by excluido_em), '[]')
    into v_lista
  from public.exclusoes where p_desde is null or excluido_em > p_desde;
  return v_saida || jsonb_build_object('exclusoes', v_lista);
end;
$$;

/**
 * Rotina de migração: recebe o JSON completo do app (localStorage ou
 * backup exportado em Configurações) e grava tudo numa única transação.
 * Se qualquer registro falhar, nada é gravado e a mensagem diz qual foi.
 * p_substituir = true apaga os dados atuais antes (somente administrador).
 */
create function public.importar_dados(p_dados jsonb, p_substituir boolean default false) returns jsonb
language plpgsql set search_path = '' as $$
declare
  c controle.colecoes;
  v_reg jsonb;
  v_res jsonb;
  v_idx integer;
  v_salvos integer := 0;
  v_ignorados integer := 0;
  v_resumo jsonb := '{}';
  v_sql_direto boolean := current_user in ('postgres', 'service_role');
begin
  if not v_sql_direto and not controle.eh_membro() then
    raise exception 'Acesso negado: seu usuário não está cadastrado como membro da equipe.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados -> 'meta') <> 'object' or jsonb_typeof(p_dados -> 'meta' -> 'esquema') <> 'number' then
    raise exception 'O arquivo não tem a identificação de versão (meta.esquema). Use um arquivo exportado pelo próprio sistema.' using errcode = '22023';
  end if;
  if (p_dados -> 'meta' ->> 'esquema')::integer > 1 then
    raise exception 'Os dados foram gerados por uma versão mais nova do sistema (esquema %).', p_dados -> 'meta' ->> 'esquema' using errcode = '22023';
  end if;

  if p_substituir then
    if not v_sql_direto and not controle.eh_admin() then
      raise exception 'Somente um administrador pode substituir todos os dados.' using errcode = '42501';
    end if;
    for c in select * from controle.colecoes where not unico order by ordem desc loop
      execute format('delete from public.%I where true', c.tabela);
    end loop;
    delete from public.exclusoes where true;
  end if;

  for c in select * from controle.colecoes order by ordem loop
    v_salvos := 0;
    v_ignorados := 0;
    if c.unico then
      if jsonb_typeof(p_dados -> c.colecao) = 'object' then
        v_res := public.salvar_registro(c.colecao, p_dados -> c.colecao);
        if v_res ->> 'status' = 'salvo' then v_salvos := 1; else v_ignorados := 1; end if;
      end if;
    else
      v_idx := 0;
      for v_reg in select value from jsonb_array_elements(
        case when jsonb_typeof(p_dados -> c.colecao) = 'array' then p_dados -> c.colecao else '[]' end)
      loop
        v_idx := v_idx + 1;
        begin
          v_res := public.salvar_registro(c.colecao, v_reg);
        exception when others then
          raise exception '% #% (id %): %', c.colecao, v_idx, coalesce(v_reg ->> 'id', '?'), sqlerrm
            using errcode = sqlstate;
        end;
        if v_res ->> 'status' = 'salvo' then v_salvos := v_salvos + 1; else v_ignorados := v_ignorados + 1; end if;
      end loop;
    end if;
    v_resumo := v_resumo || jsonb_build_object(c.colecao, jsonb_build_object('salvos', v_salvos, 'ignorados', v_ignorados));
  end loop;
  return v_resumo;
end;
$$;

revoke all on function public.salvar_registro(text, jsonb) from public, anon;
revoke all on function public.remover_registro(text, text) from public, anon;
revoke all on function public.exportar_dados(timestamptz) from public, anon;
revoke all on function public.importar_dados(jsonb, boolean) from public, anon;
grant execute on function public.salvar_registro(text, jsonb) to authenticated;
grant execute on function public.remover_registro(text, text) to authenticated;
grant execute on function public.exportar_dados(timestamptz) to authenticated;
grant execute on function public.importar_dados(jsonb, boolean) to authenticated;
