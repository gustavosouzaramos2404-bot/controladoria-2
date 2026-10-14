# Controladoria

Sistema web de controladoria para indústria de alimentos que vende ao setor público (B2G).
Responde à pergunta **"estamos indo bem?"** com indicadores (Balanced Scorecard), central de
desvios, planos de ação, custos e produção, estoque, contratos públicos (atas, empenhos,
entregas, glosas), orçamento e controles internos.

- **Front-end sem dependências:** HTML, CSS e JavaScript clássico (sem ES modules, sem build).
- **Funciona offline:** os dados ficam em cache no navegador (localStorage) e são sincronizados
  com o banco quando há conexão.
- **Banco de dados:** Supabase (PostgreSQL) com RLS. Só membros da equipe leem e gravam.

---

## Como rodar

Requisito: [Node.js](https://nodejs.org) 18 ou superior (só para o servidor local; o app em si
não usa Node).

```bash
node ferramentas/servidor.js
```

Abra **http://localhost:5173**. Para usar outra porta: `node ferramentas/servidor.js 8080`.

> Por que não abrir o `index.html` direto (file://)? O login e a sincronização com o banco
> precisam de uma origem http estável. Sem banco configurado, o app ainda funciona só com os
> dados do navegador.

### Testes

```bash
node tests/calc.test.js
```

Ou abra `http://localhost:5173/tests/tests.html` no navegador.

---

## Estrutura

```
index.html              Página única; carrega os scripts em ordem
css/                    tokens, base, layout, componentes, impressão
js/core/                núcleo: eventos, formatação, validação, esquema,
                        store (cache local), config, supabase (cliente),
                        sincronizacao (fila offline), log, rotas
js/calc/                cálculos puros (custos, estoque, contratos, capital
                        de giro, financeiros, orçamento, indicadores, alertas)
js/ui/                  componentes de interface (tabelas, formulários, modais…)
js/modules/             telas (painel, cadastros, custos, estoque, contratos,
                        orçamento, configurações, conexão com o banco)
supabase/migrations/    SQL versionado do banco
ferramentas/servidor.js servidor estático local
tests/                  testes dos cálculos
```

O esquema de dados do app está em `js/core/schema.js`. O banco foi modelado a partir dele
(`supabase/migrations/20261014120000_estrutura.sql`).

---

## Configurar o Supabase

### 1. Projeto e migrations

O projeto em uso é o **controladoria 2** (`hfbvkzoyvqfbzpghnzte`), e as migrations já estão
aplicadas nele. Para recriar o banco em outro projeto, aplique os arquivos de
`supabase/migrations/` em ordem, por um destes caminhos:

- **Painel do Supabase:** SQL Editor → cole e execute cada arquivo, na ordem do nome;
- **Supabase CLI:**
  ```bash
  npx supabase login
  npx supabase link --project-ref SEU_PROJECT_REF
  npx supabase db push
  ```

As migrations criam:

| Arquivo | Conteúdo |
|---|---|
| `…_estrutura.sql` | 31 tabelas (cadastros, contratos B2G, empenhos, lotes, estoque, lançamentos, orçamento, demonstrações, indicadores, governança), plano de contas, chaves estrangeiras, índices |
| `…_seguranca_rls.sql` | tabela `membros` e RLS em todas as tabelas (só membros acessam; log só aceita inclusão) |
| `…_sincronizacao.sql` | funções `salvar_registro`, `remover_registro`, `exportar_dados` e `importar_dados` usadas pelo app |

### 2. Apontar o app para o projeto

Edite `js/core/config.js` com a URL do projeto e a **chave publicável** (Project Settings →
API Keys → *Publishable key*, formato `sb_publishable_...`).

Essa chave pode ficar no navegador: sozinha ela não lê nem grava nada, porque todas as tabelas
exigem login de um membro. **Nunca** coloque no front-end a *secret key* / *service_role* nem a
chave da Anthropic.

Para usar o app sem banco, deixe `url` em branco.

### 3. Usuários e equipe

1. **Desative o cadastro aberto:** Authentication → Sign In / Providers → desligue
   *Allow new users to sign up*. Os usuários passam a ser criados só pelo administrador.
2. **Crie os usuários:** Authentication → Users → *Add user*, com *Auto Confirm User* marcado.
3. **Inclua cada usuário na equipe** pelo SQL Editor (o primeiro como `admin`):
   ```sql
   insert into public.membros (user_id, nome, papel)
   select id, 'Nome da pessoa', 'admin'   -- ou 'membro'
   from auth.users where email = 'pessoa@empresa.com.br';
   ```
   Quem não está em `membros` consegue entrar, mas não vê nenhum dado.

| Papel | Pode |
|---|---|
| `membro` | ler e gravar todos os dados da empresa |
| `admin` | o mesmo + gerenciar a equipe, importar backup e apagar todos os dados no banco |

### 4. Migrar os dados que já estão no navegador

1. Abra o app e clique em **Conectar ao banco** (rodapé do menu ou Configurações → Banco de dados).
2. Entre com seu usuário.
3. Se o navegador já tiver dados, o app pergunta o que fazer. Escolha
   **Enviar dados para o banco**.

O botão **Enviar dados deste navegador para o banco** (Configurações → Banco de dados) pode ser
usado a qualquer momento: ele grava tudo o que está no navegador e, em cada registro, mantém a
versão editada por último.

---

## Como funciona a sincronização

- As telas leem e gravam no cache local (localStorage), como antes.
- Cada alteração entra numa **fila** salva no navegador. Com conexão e login, a fila é enviada ao
  banco e as alterações da equipe são recebidas (a cada minuto, ao voltar a conexão e ao voltar
  para a aba).
- **Offline**, o app continua funcionando normalmente. O rodapé do menu mostra quantas
  alterações aguardam envio.
- **Conflito:** vale a versão editada por último (`atualizadoEm`). Um registro com alteração local
  pendente nunca é sobrescrito pelo servidor antes de ser enviado.
- **Registro recusado** pelo banco (regra violada) fica marcado em Configurações → Banco de dados e
  não trava os demais.
- **Sair** mantém as alterações pendentes no navegador. Elas são enviadas no próximo login.

---

## Variáveis de ambiente e segredos

O front-end não usa segredos. As chaves sensíveis ficam **somente** no Supabase:

| Nome | Onde fica | Usada por |
|---|---|---|
| URL e chave publicável | `js/core/config.js` (versionado) | navegador |
| `ANTHROPIC_API_KEY` | secret das Edge Functions do Supabase | IA do sistema (fases 4 e 5) |
| service_role / secret key | painel do Supabase (nunca no código) | — |

Para configurar a chave da Anthropic (quando as Edge Functions forem criadas):

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sua-chave --project-ref hfbvkzoyvqfbzpghnzte
```

Ou pelo painel: Edge Functions → Secrets → *Add new secret*.

Arquivos `.env` estão no `.gitignore`. Não versione backups JSON exportados pelo app: eles contêm
dados da empresa.
