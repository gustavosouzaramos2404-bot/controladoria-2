# Roteiro da videoaula: Controladoria

Gerado de `roteiro/cenas.json` (a fonte de verdade). Para mudar a fala, edite o campo
`narracao` lá e rode `node src/roteiro.js`. Os marcadores **⟨N⟩** mostram o momento em que
a ação N acontece na tela.

- **Cenas:** 39 · **palavras:** 3706
- **Duração estimada:** 23:57 (duração real dos áudios)
- **Dados:** 100% fictícios (`dados/demo.json`, gerado por `dados/gerar-demo.js`); relógio fixo em 2026-10-26

## Tempo por capítulo

| Capítulo | Duração |
|---|---|
| Abertura | 00:49 |
| Primeiros passos | 01:33 |
| Painel | 05:25 |
| Cadastros | 02:32 |
| Custos e produção | 02:49 |
| Estoque e perdas | 02:07 |
| Contratos públicos | 04:22 |
| Orçamento | 02:02 |
| Configurações | 01:23 |
| Encerramento | 00:56 |
| **Total** | **23:57** |

## Fora do roteiro (não existe no sistema)

- **Caixa e capital de giro, Demonstrações, Controles internos, Planos de ação e Relatórios** estão
  no menu, mas não têm tela (abrem "Página não encontrada"). A aula só menciona isso, na cena
  `visao-geral`.
- O botão **"Relatório do mês"** do Painel leva a `#/relatorios`, que também não existe. Não é
  clicado na aula.
- Não há lançamentos, contas a pagar/receber, DRE ou conciliação bancária como telas próprias:
  esses dados entram pelos empenhos, lotes, movimentos e backup.

## Abertura

### abertura · 00:49

> Olá! Nesta aula, você vai aprender a usar o Controladoria, o sistema de controladoria feito para uma indústria de alimentos que vende ao setor público. Ele responde a uma pergunta simples: estamos indo bem? Para isso, reúne num só lugar os indicadores, os custos de produção, o estoque, os contratos com órgãos públicos e o orçamento. A aula segue a ordem do menu. Primeiro, a visão geral e o carregamento dos dados. Depois, o Painel, que é onde você começa todos os dias. Em seguida: Cadastros, Custos e produção, Estoque e perdas, Contratos públicos, Orçamento e Configurações. No final, deixo uma rotina de uso para o dia a dia. Todos os dados que você vai ver são fictícios, criados só para esta aula.


## Primeiros passos

### visao-geral · 00:52 · tela inicial `#/painel` · sistema vazio

> Este é o sistema logo depois da instalação. **⟨1⟩** À esquerda fica o menu, com uma seção para cada área da controladoria. **⟨2⟩** No rodapé do menu aparecem o usuário, a versão e a situação dos dados. Aqui, ele avisa que os dados ficam só neste navegador, porque nesta demonstração não conectamos o banco da empresa. **⟨3⟩** Repare no bloco Primeiros passos. O Controladoria começa vazio de propósito: ele nunca inventa números. Este bloco lista o que falta preencher para o painel funcionar. **⟨4⟩** Um aviso importante: nesta versão, cinco itens do menu ainda não têm tela. São eles: Caixa e capital de giro, Demonstrações, Controles internos, Planos de ação e Relatórios. Se você clicar neles, o sistema mostra a mensagem Página não encontrada. Por isso, nesta aula, vamos trabalhar com as sete telas disponíveis.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `destacar` .navegacao-lista
2. **⟨2⟩** `destacar` .navegacao-rodape
3. **⟨3⟩** `destacar` #tela section:has-text('Primeiros passos')
4. **⟨4⟩** `destacar` .navegacao-link[data-secao=caixa]
5. (segue) `destacar` .navegacao-link[data-secao=demonstracoes]
6. (segue) `destacar` .navegacao-link[data-secao=controles]
7. (segue) `destacar` .navegacao-link[data-secao=planos]
8. (segue) `destacar` .navegacao-link[data-secao=relatorios]

</details>

### carregar-dados · 00:41 · tela inicial `#/painel` · sistema vazio

> Para não começar do zero, vamos carregar um backup com dados de demonstração. **⟨1⟩** Abra Configurações **⟨2⟩** e desça até o bloco Backup e dados. **⟨3⟩** Clique em Importar backup JSON e escolha o arquivo. **⟨4⟩** Antes de trocar qualquer coisa, o sistema valida o arquivo e mostra quantos registros ele tem. Ele também avisa que a importação substitui todos os dados atuais. **⟨5⟩** Confirme em Importar backup. **⟨6⟩** Pronto: a mensagem Backup importado confirma a operação. Esse mesmo caminho serve para restaurar uma cópia de segurança no dia a dia. **⟨7⟩** Agora, a empresa fictícia Serra Verde Alimentos aparece no topo do menu. **⟨8⟩** Vamos ao Painel.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` .navegacao-link[data-secao=configuracoes]
2. (segue) `rolar` #tela section:has(h2:has-text('Backup e dados'))
3. **⟨3⟩** `enviarArquivo` label:has-text('Importar backup JSON')
4. **⟨4⟩** `destacar` .modal
5. **⟨5⟩** `clicar` .modal button:has-text('Importar backup')
6. **⟨6⟩** `destacar` .toast, .aviso, [role=status]
7. **⟨7⟩** `destacar` .navegacao-marca
8. **⟨8⟩** `clicar` .navegacao-link[data-secao=painel]

</details>


## Painel

### painel-cabecalho · 00:42 · tela inicial `#/painel`

> O Painel se chama Estamos indo bem? e é a primeira tela do dia. **⟨1⟩** No topo, você escolhe a competência, ou seja, o mês analisado. Por padrão, é o último mês fechado: setembro de 2026. **⟨2⟩** Ao lado, escolha a comparação: com o mês anterior, **⟨3⟩** ou com o mesmo mês do ano anterior. A comparação anual ajuda a separar o que é sazonal do que é tendência. **⟨4⟩** Vamos voltar para o mês anterior. **⟨5⟩** Repare no subtítulo: os alertas sempre consideram a situação de hoje, mesmo quando você olha um mês passado. Dica: troque a competência para um mês anterior quando quiser rever uma reunião de resultado. Todos os números do Painel acompanham.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `destacar` .acoes-tela select
2. **⟨2⟩** `destacar` button[data-acao=comparar] >> nth=0
3. **⟨3⟩** `clicar` button[data-acao=comparar]:has-text('Ano anterior')
4. **⟨4⟩** `clicar` button[data-acao=comparar]:has-text('Mês anterior')
5. **⟨5⟩** `destacar` .cabecalho-tela .subtitulo

</details>

### painel-resumo · 00:40 · tela inicial `#/painel`

> Logo abaixo está o resumo do mês. **⟨1⟩** Repare que o faturamento nunca aparece sozinho. **⟨2⟩** Ao lado dele estão a margem de contribuição, **⟨3⟩** o custo real comparado ao padrão, **⟨4⟩** as entregas no prazo **⟨5⟩** e as glosas. Vender mais não adianta se a margem cai, ou se o órgão glosa a nota. **⟨6⟩** O último cartão mostra o menor saldo de caixa projetado para as próximas treze semanas. Ele avisa com antecedência se algum período vai apertar. **⟨7⟩** Em setembro, a empresa faturou cerca de novecentos e quarenta mil reais. Mas o custo ficou quase nove por cento acima do padrão, e as entregas no prazo ficaram abaixo da meta. Vamos entender por quê.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `destacar` .resumo-item:has-text('Faturamento')
2. **⟨2⟩** `destacar` .resumo-item:has-text('Margem de contribuição')
3. **⟨3⟩** `destacar` .resumo-item:has-text('Custo real × padrão')
4. **⟨4⟩** `destacar` .resumo-item:has-text('Entregas no prazo')
5. **⟨5⟩** `destacar` .resumo-item:has-text('Glosas')
6. **⟨6⟩** `destacar` .resumo-item:has-text('Menor caixa')
7. **⟨7⟩** `zoom` section.resumo

</details>

### painel-central · 00:56 · tela inicial `#/painel`

> **⟨1⟩** Este é o coração do Painel: a Central de desvios. Cada desvio mostra a evidência e quem pode agir. **⟨2⟩** No canto, a contagem separa os críticos, os de atenção e os que ainda não têm ação registrada. **⟨3⟩** Use os filtros para focar. Vou mostrar só os críticos. **⟨4⟩** O primeiro é um recebível vencido: a Prefeitura de Bom Retiro do Norte tem dois empenhos liquidados sem pagamento, somando mais de duzentos mil reais. No setor público, atraso de pagamento vira falta de caixa, por isso este alerta vem antes dos outros. **⟨5⟩** O segundo pede para avaliar o reequilíbrio ou o reajuste da Ata 012/2025: o custo do achocolatado está bem acima do custo considerado na proposta. **⟨6⟩** Veja o aviso: é uma indicação gerencial. Quem valida o pedido é o jurídico, conforme o contrato e a Lei 14.133/2021. O sistema recomenda; quem decide é o gestor.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.central
2. **⟨2⟩** `destacar` .central-contagem
3. **⟨3⟩** `clicar` button.central-filtro:has-text('Críticos')
4. **⟨4⟩** `destacar` .central-lista > li >> nth=0
5. **⟨5⟩** `destacar` .central-lista > li >> nth=1
6. **⟨6⟩** `destacar` .central-lista > li >> nth=1 >> text=Indicação gerencial

</details>

### painel-registrar-acao · 00:40 · tela inicial `#/painel`

> Todo desvio pede uma resposta. **⟨1⟩** Clique em Registrar ação, no recebível vencido. **⟨2⟩** O formulário já vem preenchido com o desvio, uma ação sugerida e um prazo de quinze dias. **⟨3⟩** Escreva a causa provável: aqui, o órgão aguarda um repasse para quitar os empenhos. **⟨4⟩** Depois, ajuste a ação sugerida, de forma verificável: quem faz o quê, e até quando. **⟨5⟩** Indique o responsável pelo nome, e não pela área. **⟨6⟩** Salve em Registrar ação. **⟨7⟩** O plano fica ligado ao desvio e aparece aqui, na Central. Assim, na próxima reunião, ninguém precisa perguntar o que foi feito: está registrado. **⟨8⟩** Se um alerta não fizer sentido, existe também o botão Dispensar com justificativa. A justificativa fica no log, com autor e data.

<details><summary>Ações na tela</summary>

1. (segue) `rolar` section.central
2. **⟨1⟩** `clicar` .central-lista > li >> nth=0 >> button:has-text('Registrar ação')
3. **⟨2⟩** `destacar` .modal [data-campo=desvio]
4. **⟨3⟩** `digitar` .modal [data-campo=causa] → "Órgão aguarda repasse para quitar os empenhos."
5. **⟨4⟩** `digitar` .modal [data-campo=acao] → "Enviar ofício de cobrança e agendar reunião com o financeiro."
6. **⟨5⟩** `digitar` .modal [data-campo=responsavel] → "Rafael Duarte"
7. **⟨6⟩** `clicar` .modal button[type=submit]
8. **⟨7⟩** `destacar` .central-lista > li >> nth=0
9. **⟨8⟩** `hover` .central-lista > li >> nth=1 >> button:has-text('Dispensar com justificativa')

</details>

### painel-dispensar · 00:40 · tela inicial `#/painel`

> Agora, um caso de exceção. **⟨1⟩** Vou filtrar os alertas de atenção. **⟨2⟩** Este avisa que a certidão negativa de débitos estaduais vence em poucos dias. Mas a renovação já foi pedida, então não há o que fazer agora. **⟨3⟩** Clique em Dispensar com justificativa. **⟨4⟩** Escreva o motivo: a renovação já foi protocolada, e a nova certidão chega em poucos dias. **⟨5⟩** O campo Dispensado até define a validade da exceção: depois dessa data, o alerta volta a aparecer sozinho. **⟨6⟩** Confirme em Dispensar alerta. **⟨7⟩** O alerta sai da lista principal e vai para o filtro Dispensados, sempre com a justificativa à vista. Dica: use a dispensa com moderação. Exceção sem prazo vira ponto cego.

<details><summary>Ações na tela</summary>

1. (segue) `rolar` section.central
2. **⟨1⟩** `clicar` button.central-filtro:has-text('Atenção')
3. **⟨2⟩** `destacar` .central-lista > li:has-text('Documento de habilitação vencendo')
4. **⟨3⟩** `clicar` .central-lista > li:has-text('Documento de habilitação vencendo') button:has-text('Dispensar com justificativa')
5. **⟨4⟩** `digitar` .modal [data-campo=justificativa] → "Renovação protocolada; nova certidão em 30/10."
6. **⟨5⟩** `destacar` .modal [data-campo=validoAte]
7. **⟨6⟩** `clicar` .modal button[type=submit]
8. **⟨7⟩** `clicar` button.central-filtro:has-text('Dispensados')

</details>

### painel-bsc · 00:43 · tela inicial `#/painel`

> Descendo, estão os indicadores do Balanced Scorecard, em quatro perspectivas. **⟨1⟩** Financeira, **⟨2⟩** Clientes, que aqui são os órgãos públicos, **⟨3⟩** Processos internos **⟨4⟩** e Aprendizado e crescimento. **⟨5⟩** Em cada linha, você vê o realizado, a meta, o status, a variação em relação à comparação escolhida e a tendência de doze meses. **⟨6⟩** Alguns indicadores vêm pareados com outro, para evitar decisões de um lado só. A margem de contribuição, por exemplo, aparece ao lado das entregas no prazo: margem boa com entrega atrasada não é sucesso. **⟨7⟩** Em Processos internos, a variação de custo real contra o padrão está fora da meta. Guarde essa informação: vamos encontrar a causa em Custos e produção.

<details><summary>Ações na tela</summary>

1. (segue) `rolar` .bsc
2. **⟨1⟩** `destacar` .bsc section.bloco:has-text('Financeira') >> nth=0
3. **⟨2⟩** `destacar` .bsc section.bloco:has-text('Clientes (órgãos públicos)')
4. **⟨3⟩** `destacar` .bsc section.bloco:has-text('Processos internos')
5. **⟨4⟩** `destacar` .bsc section.bloco:has-text('Aprendizado e crescimento')
6. **⟨5⟩** `zoom` .bsc section.bloco >> nth=0
7. **⟨6⟩** `destacar` .bsc .pareado >> nth=0
8. **⟨7⟩** `destacar` .bsc tr:has-text('Variação de custo real')

</details>

### painel-como-calculado · 00:24 · tela inicial `#/painel`

> Para confiar num número, é preciso saber de onde ele vem. **⟨1⟩** Clique no nome de qualquer indicador. **⟨2⟩** A janela Como é calculado mostra a fórmula, a fonte dos dados, a data de atualização, o responsável, se o indicador é controlável por ele e a tendência dos últimos doze meses. Use esta janela nas reuniões, quando alguém questionar um resultado. **⟨3⟩** Para sair, feche a janela.

<details><summary>Ações na tela</summary>

1. (segue) `rolar` .bsc
2. **⟨1⟩** `clicar` button[data-acao=como-calculado]:has-text('Margem de contribuição %')
3. **⟨2⟩** `destacar` .modal
4. **⟨3⟩** `clicar` .modal-fechar

</details>

### painel-ponte · 00:39 · tela inicial `#/painel`

> **⟨1⟩** No fim do Painel está a ponte de margem. Ela explica, em cascata, como a margem de contribuição foi do mês anterior para o atual. **⟨2⟩** Cada barra é um efeito: preço de venda, volume, custo de insumos e eficiência. **⟨3⟩** O texto abaixo resume o resultado e diz de quem é cada efeito. Preço e volume são da área comercial. Custo de insumos é de Compras, que controla só em parte. Eficiência é da Produção. Assim, a conversa sobre margem sai do achismo e vai direto ao responsável. Recapitulando o Painel: resumo do mês, desvios com ação, indicadores e ponte de margem.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has-text('Ponte de margem')
2. **⟨2⟩** `destacar` section.bloco:has-text('Ponte de margem') .grafico
3. **⟨3⟩** `destacar` section.bloco:has-text('Ponte de margem') .texto-leitura

</details>


## Cadastros

### cadastros-empresa · 00:43 · tela inicial `#/painel`

> Agora, vamos aos Cadastros, a base de todos os cálculos. **⟨1⟩** A tela é dividida em abas. **⟨2⟩** A primeira, Empresa, guarda os parâmetros gerais. **⟨3⟩** A competência atual é o último mês fechado, e define o padrão do painel e dos alertas. **⟨4⟩** A alíquota efetiva e o custo de capital alimentam o NOPAT e o EVA. Se ficarem em branco, esses indicadores aparecem sem dados, em vez de um número inventado. **⟨5⟩** O saldo inicial de caixa e a data dele são o ponto de partida da projeção de caixa. **⟨6⟩** Sempre que mudar algo aqui, clique em Salvar dados da empresa. Erro comum: esquecer de avançar a competência atual depois do fechamento. Aí o painel continua mostrando o mês velho.

<details><summary>Ações na tela</summary>

1. (segue) `clicar` .navegacao-link[data-secao=cadastros]
2. **⟨1⟩** `destacar` nav.abas
3. **⟨2⟩** `destacar` #tela form
4. **⟨3⟩** `destacar` [data-campo=competenciaAtual]
5. **⟨4⟩** `destacar` [data-campo=aliquotaEfetiva]
6. (segue) `destacar` [data-campo=custoCapitalAA]
7. **⟨5⟩** `destacar` [data-campo=saldoInicialCaixa]
8. (segue) `destacar` [data-campo=dataSaldoInicial]
9. **⟨6⟩** `hover` #tela button:has-text('Salvar dados da empresa')

</details>

### cadastros-centros · 00:28 · tela inicial `#/cadastros/empresa`

> **⟨1⟩** Em Centros de responsabilidade, cada área responde pelo que controla: custo, receita, resultado ou investimento. São esses responsáveis que aparecem sugeridos nos alertas. **⟨2⟩** Todas as listas do sistema funcionam do mesmo jeito. Clique no título de uma coluna para ordenar. **⟨3⟩** Use Exportar CSV para levar a lista para a planilha. **⟨4⟩** E use Editar ou Excluir, em cada linha. A exclusão sempre pede confirmação.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('Centros de responsabilidade')
2. **⟨2⟩** `clicar` #tela th button:has-text('Responsável')
3. **⟨3⟩** `hover` #tela button:has-text('Exportar CSV')
4. **⟨4⟩** `destacar` #tela tbody tr >> nth=0

</details>

### cadastros-insumos-produtos · 00:37 · tela inicial `#/cadastros/centros`

> **⟨1⟩** Em Insumos, ficam a unidade, o preço padrão, a validade e o estoque mínimo. O preço padrão é a régua da variação de preço, que é responsabilidade de Compras. **⟨2⟩** Veja a variação em relação ao padrão: o leite em pó já está bem mais caro. **⟨3⟩** Em Produtos e fichas técnicas, o sistema calcula o custo padrão de cada produto. **⟨4⟩** A fórmula está no topo: os materiais da ficha, divididos pelo rendimento padrão, mais a mão de obra direta e o CIF padrão. **⟨5⟩** Abrindo um produto, você vê a ficha técnica: cada insumo e a quantidade padrão por unidade. **⟨6⟩** Vou fechar sem alterar nada.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('Insumos')
2. **⟨2⟩** `destacar` #tela tbody tr:has-text('Leite em pó')
3. **⟨3⟩** `clicar` nav.abas a:has-text('Produtos e fichas técnicas')
4. **⟨4⟩** `destacar` .bloco-cabecalho p >> nth=0
5. **⟨5⟩** `clicar` #tela tbody tr:has-text('Achocolatado') button:has-text('Editar')
6. (segue) `rolar` .modal fieldset.lista
7. (segue) `destacar` .modal fieldset.lista
8. **⟨6⟩** `clicar` .modal-fechar

</details>

### cadastros-orgaos-documentos · 00:45 · tela inicial `#/cadastros/produtos`

> **⟨1⟩** Em Órgãos públicos, compare o prazo de pagamento do contrato com o prazo médio real, calculado a partir dos pagamentos registrados. **⟨2⟩** A Prefeitura de Bom Retiro do Norte paga, em média, em sessenta dias: o dobro do contratado. É esse prazo real que entra na projeção de caixa. **⟨3⟩** Em Documentos de habilitação, ficam as certidões e os alvarás, com a situação de cada um. **⟨4⟩** O sistema avisa quinze dias antes do vencimento, porque documento vencido pode inabilitar a empresa ou reter pagamentos. **⟨5⟩** Por fim, em Alçadas de aprovação, você define limites por tipo de operação. Acima do limite, o sistema exige registrar quem aprovou e por quê. Resumindo: cadastro bem feito é cálculo confiável.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('Órgãos públicos')
2. **⟨2⟩** `destacar` #tela tbody tr:has-text('Bom Retiro')
3. **⟨3⟩** `clicar` nav.abas a:has-text('Documentos de habilitação')
4. **⟨4⟩** `destacar` #tela tbody tr:has-text('estaduais')
5. **⟨5⟩** `clicar` nav.abas a:has-text('Alçadas de aprovação')
6. (segue) `destacar` #tela table

</details>


## Custos e produção

### custos-resumo · 00:32 · tela inicial `#/cadastros/alcadas`

> Vamos a Custos e produção, onde está a causa daquele custo acima do padrão. **⟨1⟩** A tela também trabalha por competência. **⟨2⟩** No resumo, a produção do mês em quilos, **⟨3⟩** o custo real contra o padrão, **⟨4⟩** e a variação separada em duas partes. A variação de preço é de Compras, e só é parcialmente controlável. **⟨5⟩** A variação de quantidade, ou de eficiência, é da Produção, que controla o consumo. **⟨6⟩** Aqui, fica claro: a maior parte do desvio de setembro veio do preço dos insumos, e não do chão de fábrica.

<details><summary>Ações na tela</summary>

1. (segue) `clicar` .navegacao-link[data-secao=custos]
2. **⟨1⟩** `destacar` .acoes-tela select
3. **⟨2⟩** `destacar` .resumo-item:has-text('Produção do mês')
4. **⟨3⟩** `destacar` .resumo-item:has-text('Custo real × padrão')
5. **⟨4⟩** `destacar` .resumo-item:has-text('Variação de preço')
6. **⟨5⟩** `destacar` .resumo-item:has-text('Variação de quantidade')
7. **⟨6⟩** `zoom` section.resumo

</details>

### custos-produto-insumo · 00:36 · tela inicial `#/custos`

> **⟨1⟩** A tabela Custo padrão contra real por produto mostra, para cada produto, o custo padrão e o real por unidade, a variação, e quanto dela é preço ou quantidade. **⟨2⟩** O achocolatado e a mistura para mingau são os que mais se afastaram do padrão. **⟨3⟩** Na análise de variações por insumo, a resposta aparece: **⟨4⟩** o leite em pó foi comprado cerca de vinte e quatro por cento acima do preço padrão, e ele está nos dois produtos. **⟨5⟩** As fórmulas ficam sempre visíveis. A diferença de preço, vezes a quantidade real, vai para Compras. O excesso de quantidade, vezes o preço padrão, vai para a Produção.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has-text('Custo padrão × real por produto')
2. **⟨2⟩** `destacar` section.bloco:has-text('Custo padrão × real por produto') tbody tr:has-text('Mistura para mingau')
3. **⟨3⟩** `rolar` section.bloco:has-text('Análise de variações por insumo')
4. **⟨4⟩** `destacar` section.bloco:has-text('Análise de variações por insumo') tbody tr:has-text('Leite em pó')
5. **⟨5⟩** `destacar` section.bloco:has-text('Análise de variações por insumo') .bloco-cabecalho p

</details>

### custos-lotes · 00:35 · tela inicial `#/custos`

> **⟨1⟩** Em Perdas por motivo, o índice compara o valor perdido com o valor consumido. Em setembro, as perdas de processo passaram da meta. **⟨2⟩** Mais abaixo, estão os lotes da competência. **⟨3⟩** Cada lote mostra o produzido, o percentual do planejado, o custo real, o rendimento, as perdas e o CIF rateado. **⟨4⟩** O CIF do mês é distribuído pelo critério escolhido em Configurações; aqui, por horas de produção. **⟨5⟩** Veja este lote de mistura para mingau: o rendimento ficou bem abaixo da meta. Foi ele que gerou o alerta de rendimento na Central de desvios.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has-text('Perdas por motivo')
2. (segue) `destacar` section.bloco:has-text('Perdas por motivo')
3. **⟨2⟩** `rolar` section.bloco:has-text('Lotes de 09/2026')
4. **⟨3⟩** `destacar` section.bloco:has-text('Lotes de 09/2026') thead
5. **⟨4⟩** `destacar` section.bloco:has-text('Lotes de 09/2026') .bloco-cabecalho p
6. **⟨5⟩** `destacar` section.bloco:has-text('Lotes de 09/2026') tbody tr:has-text('MIN-2609-2')

</details>

### custos-evolucao · 00:29 · tela inicial `#/custos`

> **⟨1⟩** O gráfico Evolução em 12 meses junta o rendimento, o índice de perdas e a variação do custo real contra o padrão. **⟨2⟩** Ele responde a uma pergunta importante: o desvio é pontual, ou vem crescendo? Aqui, a variação de custo sobe mês a mês desde outubro do ano passado, acompanhando a alta do leite em pó. Dica: quando o desvio é persistente, não basta cobrar a fábrica. É hora de rever o preço padrão, e de olhar os contratos que usam esse insumo.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has(h2:has-text('Evolução em 12 meses'))
2. **⟨2⟩** `zoom` section.bloco:has(h2:has-text('Evolução em 12 meses'))

</details>

### custos-registrar-lote · 00:36 · tela inicial `#/custos`

> **⟨1⟩** Para lançar a produção, use Registrar lote. Informe o produto, o código do lote, a data, as quantidades e as horas. **⟨2⟩** Ao escolher o produto, os insumos da ficha técnica entram automaticamente, com o preço padrão. **⟨3⟩** Você só ajusta a quantidade e o preço reais. Depois, vêm as perdas por motivo. **⟨4⟩** E esta opção baixa os insumos do estoque pela regra FEFO, e já dá entrada no produto acabado. **⟨5⟩** Como é só uma demonstração, vou fechar sem salvar. Resumindo Custos e produção: o sistema mostra quem causou cada real de desvio.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` button[data-acao=novo-lote]
2. **⟨2⟩** `selecionar` .modal [data-campo=produtoId]
3. **⟨3⟩** `destacar` .modal fieldset.lista >> nth=0
4. **⟨4⟩** `destacar` .modal label:has-text('Baixar os insumos do estoque')
5. **⟨5⟩** `clicar` .modal-fechar

</details>


## Estoque e perdas

### estoque-saldos · 00:31 · tela inicial `#/custos`

> Próxima parada: Estoque e perdas. Lembre: estoque parado é capital de giro parado. **⟨1⟩** O resumo mostra o valor em insumos e em produtos acabados, **⟨2⟩** os itens abaixo do mínimo, **⟨3⟩** os lotes vencendo **⟨4⟩** e o giro de estoque. **⟨5⟩** Na tabela Saldos por item, a cobertura em dias divide o saldo pelo consumo médio diário das saídas dos últimos noventa dias. **⟨6⟩** O cacau em pó está abaixo do mínimo, com cerca de doze dias de cobertura. É hora de comprar, antes que falte para o achocolatado.

<details><summary>Ações na tela</summary>

1. (segue) `clicar` .navegacao-link[data-secao=estoque]
2. **⟨2⟩** `destacar` .resumo-item:has-text('Abaixo do mínimo')
3. **⟨3⟩** `destacar` .resumo-item:has-text('Lotes vencendo')
4. **⟨4⟩** `destacar` .resumo-item:has-text('Giro de estoque')
5. **⟨5⟩** `destacar` #tela thead
6. **⟨6⟩** `destacar` #tela tbody tr:has-text('Cacau em pó')

</details>

### estoque-fefo · 00:25 · tela inicial `#/estoque`

> **⟨1⟩** Na aba FEFO e vencimentos, os lotes aparecem na ordem em que devem ser consumidos e expedidos: primeiro o que vence primeiro. **⟨2⟩** O primeiro da lista é um lote de leite em pó que vence em quatro dias. Use-o já na próxima produção. **⟨3⟩** Você pode filtrar para ver só insumos, ou só produtos acabados. Dica: exporte esta lista em CSV para a equipe do almoxarifado, no começo de cada semana.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('FEFO e vencimentos')
2. **⟨2⟩** `destacar` #tela tbody tr >> nth=0
3. **⟨3⟩** `selecionar` #tela select >> nth=0

</details>

### estoque-movimentos-perdas · 00:31 · tela inicial `#/estoque/fefo`

> **⟨1⟩** Em Movimentos, ficam todas as entradas, saídas, perdas e ajustes, com lote, validade e documento. **⟨2⟩** Você pode filtrar por item **⟨3⟩** ou por tipo. **⟨4⟩** Para lançar, use Registrar movimento. Ajustes e perdas acima da alçada exigem a aprovação registrada. **⟨5⟩** Na aba Perdas, o gráfico mostra as perdas dos últimos doze meses por motivo: processo, validade, avaria e qualidade. Resumindo Estoque: cobertura, validade e perdas, sempre em reais.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('Movimentos')
2. **⟨2⟩** `selecionar` #tela select >> nth=0
3. **⟨3⟩** `selecionar` #tela select >> nth=1
4. **⟨4⟩** `hover` button[data-acao=novo-movimento]
5. **⟨5⟩** `clicar` nav.abas a:has-text('Perdas')
6. (segue) `destacar` #tela .grafico >> nth=0

</details>

### estoque-alcada · 00:39 · tela inicial `#/estoque/movimentos`

> Veja como funciona a alçada na prática. **⟨1⟩** Clique em Registrar movimento. **⟨2⟩** Vou lançar um ajuste de inventário no açúcar. **⟨3⟩** No ajuste, a quantidade negativa reduz o saldo. **⟨4⟩** O valor também vai negativo: seis mil reais. **⟨5⟩** O motivo é obrigatório em perdas e ajustes, para que a auditoria entenda o lançamento depois. **⟨6⟩** Ao salvar, **⟨7⟩** o sistema confere a alçada. Seis mil reais passa do limite de cinco mil definido para ajuste de estoque, então ele pede o registro da aprovação. **⟨8⟩** Informe quem aprovou **⟨9⟩** e a justificativa. **⟨10⟩** Só então o movimento é gravado. Esse é um controle interno simples, que evita ajustes grandes sem dono.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` button[data-acao=novo-movimento]
2. **⟨2⟩** `selecionar` .modal [data-campo=item]
3. (segue) `selecionar` .modal [data-campo=tipo]
4. **⟨3⟩** `digitar` .modal [data-campo=qtd] → "-1500"
5. **⟨4⟩** `digitar` .modal [data-campo=valor] → "-6000"
6. **⟨5⟩** `digitar` .modal [data-campo=motivo] → "Inventário de outubro"
7. **⟨6⟩** `clicar` .modal button[type=submit]
8. **⟨7⟩** `destacar` .modal >> nth=-1
9. **⟨8⟩** `digitar` .modal [data-campo=aprovador] → "Lúcia Prado"
10. **⟨9⟩** `digitar` .modal [data-campo=justificativa] → "Diferença confirmada na contagem física."
11. **⟨10⟩** `clicar` .modal button[type=submit]:has-text('Registrar aprovação')

</details>


## Contratos públicos

### contratos-lista · 00:35 · tela inicial `#/estoque/perdas`

> Agora, o diferencial do sistema: Contratos públicos. **⟨1⟩** O resumo traz os contratos e atas vigentes e o valor ainda a faturar, **⟨2⟩** a margem prevista contra a atual, **⟨3⟩** quantos contratos têm defasagem de custo de pelo menos cinco por cento, **⟨4⟩** os recebíveis vencidos e as entregas no prazo. **⟨5⟩** Na tabela, cada contrato mostra quanto do valor registrado já foi consumido, a margem prevista, a margem atual e a erosão, em pontos percentuais. **⟨6⟩** A Ata 012/2025 consumiu quase todo o valor registrado e perdeu mais de treze pontos de margem. **⟨7⟩** Vamos abri-la.

<details><summary>Ações na tela</summary>

1. (segue) `clicar` .navegacao-link[data-secao=contratos]
2. **⟨2⟩** `destacar` .resumo-item:has-text('Margem prevista')
3. **⟨3⟩** `destacar` .resumo-item:has-text('Defasagem')
4. **⟨4⟩** `destacar` .resumo-item:has-text('Recebíveis vencidos')
5. **⟨5⟩** `destacar` #tela thead
6. **⟨6⟩** `destacar` #tela tbody tr:has-text('Ata 012/2025')
7. **⟨7⟩** `clicar` #tela tbody tr:has-text('Ata 012/2025') a >> nth=0

</details>

### contrato-detalhe · 00:36 · tela inicial `#/contratos/con-se`

> **⟨1⟩** O detalhe do contrato começa pelo resumo: vigência, margem, saldo da ata, resultado de contribuição, entregas no prazo, e glosas e multas. **⟨2⟩** A vigência termina em cinquenta dias, e o saldo está no fim. É hora de preparar a renovação, ou uma nova licitação. **⟨3⟩** Em Desvios deste contrato, aparecem só os alertas desta ata, cada um com o botão Registrar ação. **⟨4⟩** Em Dados do contrato, ficam o tipo, a assinatura, a data-base da proposta, o índice de reajuste e a garantia. A data-base já completou doze meses: o reajuste pode ser avaliado.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `destacar` section.resumo
2. **⟨2⟩** `destacar` .resumo-item:has-text('Saldo da ata')
3. **⟨3⟩** `rolar` section.bloco:has-text('Desvios deste contrato')
4. (segue) `destacar` section.bloco:has-text('Desvios deste contrato')
5. **⟨4⟩** `rolar` section.bloco:has-text('Dados do contrato')
6. (segue) `destacar` section.bloco:has-text('Dados do contrato') dl

</details>

### contrato-itens · 00:37 · tela inicial `#/contratos/con-se`

> **⟨1⟩** Na tabela de itens, para cada produto, aparecem o registrado, o empenhado, o saldo, o preço, o custo da proposta, o custo atual e a margem. **⟨2⟩** A coluna Esgota em estima quando o saldo acaba, pelo ritmo de empenho dos últimos noventa dias. **⟨3⟩** O bloco Avaliar pedido de reequilíbrio ou reajuste reúne a evidência: o custo considerado na proposta, o custo atual, com os lotes usados no cálculo, e a defasagem. **⟨4⟩** O sistema também separa a parte da defasagem que vem de ineficiência interna, porque essa parte não justifica um pedido ao órgão. E, de novo: a validação é do jurídico.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has-text('Itens: margem, defasagem e saldo')
2. **⟨2⟩** `destacar` section.bloco:has-text('Itens: margem, defasagem e saldo') th:has-text('Esgota em')
3. **⟨3⟩** `rolar` section.bloco:has-text('Avaliar pedido de reequilíbrio')
4. (segue) `destacar` section.bloco:has-text('Avaliar pedido de reequilíbrio') .bloco-plano >> nth=0
5. **⟨4⟩** `destacar` section.bloco:has-text('Avaliar pedido de reequilíbrio') .bloco-plano >> nth=0 >> text=/inefici/i

</details>

### contrato-empenhos · 00:35 · tela inicial `#/contratos/con-se`

> **⟨1⟩** Em Empenhos, entregas, liquidação e pagamento, você acompanha o ciclo completo de cada empenho. **⟨2⟩** Este empenho de setembro foi liquidado, mas o pagamento ainda não chegou. **⟨3⟩** Quando o órgão pagar, abra o empenho em Editar. **⟨4⟩** Desça até Pagamento **⟨5⟩** e informe a data. Se o valor ficar em branco, o sistema usa o valor liquidado. **⟨6⟩** Ao salvar, o sistema registra automaticamente o recebimento no caixa. **⟨7⟩** A situação do empenho muda na hora. Se houver glosa na liquidação, informe o valor glosado: ele entra no indicador de glosas e no resultado do contrato.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has-text('Empenhos, entregas, liquidação e pagamento')
2. **⟨2⟩** `destacar` section.bloco:has-text('Empenhos, entregas, liquidação e pagamento') tbody tr:has-text('2026NE12SE')
3. **⟨3⟩** `clicar` section.bloco:has-text('Empenhos, entregas, liquidação e pagamento') tbody tr:has-text('2026NE12SE') button[data-acao=editar-empenho]
4. **⟨4⟩** `rolar` .modal [data-campo='pagamento.data']
5. (segue) `preencher` .modal [data-campo='pagamento.data'] → "2026-10-26"
6. **⟨6⟩** `clicar` .modal button[type=submit]
7. **⟨7⟩** `destacar` section.bloco:has-text('Empenhos, entregas, liquidação e pagamento') tbody tr:has-text('2026NE12SE')

</details>

### contrato-resultado · 00:35 · tela inicial `#/contratos/con-br`

> Vamos olhar outro contrato: a Ata 003/2025, da Prefeitura de Bom Retiro do Norte. **⟨1⟩** O bloco Resultado de contribuição do contrato parte da receita entregue, e desconta o custo variável, o frete, as multas e as glosas. **⟨2⟩** Aqui, uma multa por atraso na entrega de junho reduziu o resultado. **⟨3⟩** As penalidades ficam registradas com data, motivo e valor. Dica: multas e glosas são custo real do contrato. Use este resultado, e não só o preço, para decidir se vale participar da próxima licitação deste órgão.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has(h2:has-text('Resultado de contribuição do contrato'))
2. **⟨2⟩** `destacar` section.bloco:has(h2:has-text('Resultado de contribuição do contrato'))
3. **⟨3⟩** `destacar` section.bloco:has(h2:has-text('Penalidades'))

</details>

### contratos-orgaos · 00:41 · tela inicial `#/contratos`

> **⟨1⟩** Agora, na lista de contratos, abra a aba Órgãos e recebíveis. **⟨2⟩** Para cada órgão, você vê o prazo contratual, o prazo real desde a liquidação e desde a entrega, e o atraso médio. A Secretaria Estadual de Educação paga, em média, onze dias depois do prazo. **⟨3⟩** O gráfico de concentração mostra quanto da receita depende de cada órgão. Concentração alta é risco: um atraso grande afeta o caixa inteiro. **⟨4⟩** E a lista Recebíveis em aberto mostra, empenho a empenho, o que foi faturado e ainda não foi pago, com os dias de atraso. É a sua lista de cobrança. Resumindo Contratos públicos: margem, saldo, prazo e recebimento, contrato a contrato.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('Órgãos e recebíveis')
2. **⟨2⟩** `destacar` #tela tbody tr:has-text('Secretaria Estadual')
3. **⟨3⟩** `destacar` #tela .grafico >> nth=0
4. **⟨4⟩** `rolar` section.bloco:has-text('Recebíveis em aberto')
5. (segue) `destacar` section.bloco:has-text('Recebíveis em aberto') table

</details>

### contrato-cadastrar · 00:43 · tela inicial `#/contratos/orgaos`

> **⟨1⟩** Para cadastrar um contrato ou uma ata, volte à aba Contratos e atas **⟨2⟩** e clique em Cadastrar contrato. **⟨3⟩** Preencha a identificação: número, tipo, órgão, processo e modalidade. **⟨4⟩** Depois, as datas: assinatura, vigência e data-base da proposta. Doze meses depois da data-base, o sistema avisa para avaliar o reajuste. **⟨5⟩** Nos itens, informe a quantidade registrada, o preço contratado e o custo da proposta. Atenção: o custo da proposta é o custo unitário que você considerou ao formar o preço. Ele é a base de toda a análise de defasagem e de erosão de margem. Por isso, guarde a planilha de formação de preço de cada licitação. **⟨6⟩** Vou fechar sem salvar.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` nav.abas a:has-text('Contratos e atas')
2. **⟨2⟩** `clicar` button[data-acao=novo-contrato]
3. **⟨3⟩** `destacar` .modal [data-campo=numero]
4. **⟨4⟩** `destacar` .modal [data-campo=dataBaseProposta]
5. **⟨5⟩** `destacar` .modal fieldset.lista >> nth=0
6. **⟨6⟩** `clicar` .modal-fechar

</details>


## Orçamento

### orcamento-fixo · 00:31 · tela inicial `#/contratos/orgaos`

> Agora, o Orçamento. **⟨1⟩** O resumo compara o resultado orçado com o realizado, **⟨2⟩** e conta as linhas desfavoráveis acima de dez por cento. **⟨3⟩** Na tabela Orçado contra realizado, cada linha é um centro e uma conta. O realizado segue o regime de competência: lançamentos pagos e a pagar do mês. A receita de contratos vem do faturamento das entregas. **⟨4⟩** A Manutenção da Produção gastou quase sessenta por cento acima do orçado. Por isso, ela aparece como crítica na Central de desvios.

<details><summary>Ações na tela</summary>

1. (segue) `clicar` .navegacao-link[data-secao=orcamento]
2. **⟨1⟩** `destacar` .resumo-item:has-text('Resultado realizado')
3. **⟨2⟩** `destacar` .resumo-item:has-text('Linhas desfavoráveis')
4. **⟨3⟩** `rolar` section.bloco:has-text('Orçado × realizado')
5. **⟨4⟩** `destacar` #tela tbody tr:has-text('Manutenção')

</details>

### orcamento-flexivel · 00:28 · tela inicial `#/orcamento`

> **⟨1⟩** Clique em Orçamento flexível. **⟨2⟩** Nele, a parte variável de cada linha é ajustada ao volume real produzido. **⟨3⟩** O cartão Volume real contra orçado mostra essa relação, e o volume orçado é alterado em Editar volume. **⟨4⟩** Assim, um custo de insumos maior, só porque se produziu mais, não é tratado como desvio. Sobra apenas o que é preço ou eficiência. **⟨5⟩** Volte ao orçamento fixo quando quiser comparar com o número aprovado.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` button[data-acao=modo]:has-text('Orçamento flexível')
2. **⟨2⟩** `destacar` #tela tbody
3. **⟨3⟩** `destacar` .resumo-item:has-text('Volume real')
4. **⟨4⟩** `destacar` #tela tbody tr:has-text('Fornecedores de insumos')
5. **⟨5⟩** `clicar` button[data-acao=modo]:has-text('Orçamento fixo')

</details>

### orcamento-lancar · 00:34 · tela inicial `#/orcamento`

> **⟨1⟩** Para incluir uma linha, clique em Lançar orçamento. **⟨2⟩** Escolha a competência, o centro de responsabilidade e a natureza: receita, ou custo e despesa. **⟨3⟩** Informe a conta e o valor. **⟨4⟩** E a parte variável, em percentual. É ela que o orçamento flexível ajusta pelo volume. Um custo de insumos, por exemplo, é quase todo variável; um aluguel é fixo. **⟨5⟩** Dica: use na conta o mesmo nome da categoria dos lançamentos. É assim que o sistema encontra o realizado de cada linha. **⟨6⟩** Vou fechar sem salvar.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` button[data-acao=nova-linha]
2. **⟨2⟩** `destacar` .modal [data-campo=centroId]
3. **⟨3⟩** `destacar` .modal [data-campo=conta]
4. **⟨4⟩** `destacar` .modal [data-campo=parteVariavel]
5. **⟨5⟩** `esperar` 
6. **⟨6⟩** `clicar` .modal-fechar

</details>

### orcamento-forecast · 00:29 · tela inicial `#/orcamento`

> **⟨1⟩** Mais abaixo, está o Forecast do ano: o realizado acumulado, mais o orçado dos meses restantes. **⟨2⟩** As últimas colunas mostram a alternativa pela tendência dos últimos três meses. Se as duas projeções divergem muito, revise o orçamento restante. **⟨3⟩** E, para não digitar o ano inteiro, use Copiar para outros meses, que replica uma competência nos meses seguintes. Resumindo: orçado, flexível e forecast, na mesma tela.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has-text('Forecast de 2026')
2. **⟨2⟩** `destacar` section.bloco:has-text('Forecast de 2026') th:has-text('Pela tendência')
3. **⟨3⟩** `hover` button[data-acao=copiar]

</details>


## Configurações

### configuracoes-metas · 00:38 · tela inicial `#/orcamento`

> Por último, as Configurações. **⟨1⟩** Em Preferências, informe o seu nome, que aparece como autor no log, e o critério de rateio do CIF: horas de produção ou quilos produzidos. **⟨2⟩** Em Metas e tolerâncias, cada indicador tem meta, faixa de atenção, faixa de fora da meta e responsável. Sem meta, o Painel mostra Sem meta, e nada é preenchido pelo sistema. **⟨3⟩** Para mudar, clique em Editar meta. **⟨4⟩** Repare no campo Justificativa da alteração. Ele é obrigatório, e fica no log com autor e data. Ninguém muda uma meta sem deixar rastro. **⟨5⟩** Vou fechar sem salvar.

<details><summary>Ações na tela</summary>

1. (segue) `clicar` .navegacao-link[data-secao=configuracoes]
2. **⟨1⟩** `rolar` section.bloco:has(h2:has-text('Preferências'))
3. **⟨2⟩** `rolar` section.bloco:has(h2:has-text('Metas e tolerâncias'))
4. **⟨3⟩** `clicar` button[data-acao=editar-meta] >> nth=0
5. **⟨4⟩** `destacar` .modal [data-campo=justificativa]
6. **⟨5⟩** `clicar` .modal-fechar

</details>

### configuracoes-backup · 00:45 · tela inicial `#/configuracoes`

> **⟨1⟩** Em Limites dos alertas, você ajusta a sensibilidade da Central de desvios: defasagem de custo, margem mínima do contrato, prazos de vigência, garantia, documentos, validade e outros. **⟨2⟩** Em Backup e dados, use Exportar backup JSON com frequência. O arquivo contém todos os dados, e pode ser importado em outro computador. **⟨3⟩** Apagar todos os dados volta ao modelo em branco, e pede uma confirmação digitada. **⟨4⟩** E, no topo da tela, o bloco Banco de dados mostra a conexão com o banco da empresa. Com login, os dados são sincronizados para toda a equipe. Dica: guarde os backups num local seguro da empresa. Eles contêm todos os dados, então trate o arquivo como confidencial.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `rolar` section.bloco:has(h2:has-text('Limites dos alertas'))
2. **⟨2⟩** `rolar` section.bloco:has(h2:has-text('Backup e dados'))
3. (segue) `clicar` button[data-acao=exportar]
4. **⟨3⟩** `hover` button[data-acao=apagar-tudo]
5. **⟨4⟩** `rolar` #banco
6. (segue) `destacar` #banco

</details>


## Encerramento

### rotina · 00:32 · tela inicial `#/configuracoes`

> Para fechar, uma rotina sugerida. **⟨1⟩** Todo dia, abra o Painel e trate a Central de desvios: registre a ação, ou dispense com justificativa. **⟨2⟩** Toda semana, revise os recebíveis em aberto, **⟨3⟩** a lista FEFO e os estoques abaixo do mínimo. **⟨4⟩** Todo mês, depois do fechamento, atualize a competência em Cadastros, analise custos e orçamento, revise a margem dos contratos, e exporte um backup. Assim, a pergunta estamos indo bem? passa a ter resposta, com número, fonte e responsável.

<details><summary>Ações na tela</summary>

1. **⟨1⟩** `clicar` .navegacao-link[data-secao=painel]
2. **⟨2⟩** `clicar` .navegacao-link[data-secao=contratos]
3. **⟨3⟩** `clicar` .navegacao-link[data-secao=estoque]
4. **⟨4⟩** `clicar` .navegacao-link[data-secao=cadastros]

</details>

### encerramento · 00:24

> Recapitulando: o Painel mostra onde agir. Os Cadastros sustentam os cálculos. Custos e Estoque explicam o desvio. Contratos públicos protegem a margem e o caixa. O Orçamento mostra o rumo do ano. E as Configurações guardam metas, limites e backups. Obrigado por assistir, e bom trabalho com o Controladoria.


## Resumo por cena

| Cena | Capítulo | Palavras | Duração |
|---|---|---|---|
| abertura | Abertura | 123 | 00:49 |
| visao-geral | Primeiros passos | 131 | 00:52 |
| carregar-dados | Primeiros passos | 100 | 00:41 |
| painel-cabecalho | Painel | 111 | 00:42 |
| painel-resumo | Painel | 110 | 00:40 |
| painel-central | Painel | 144 | 00:56 |
| painel-registrar-acao | Painel | 117 | 00:40 |
| painel-dispensar | Painel | 110 | 00:40 |
| painel-bsc | Painel | 108 | 00:43 |
| painel-como-calculado | Painel | 64 | 00:24 |
| painel-ponte | Painel | 101 | 00:39 |
| cadastros-empresa | Cadastros | 117 | 00:43 |
| cadastros-centros | Cadastros | 63 | 00:28 |
| cadastros-insumos-produtos | Cadastros | 103 | 00:37 |
| cadastros-orgaos-documentos | Cadastros | 114 | 00:45 |
| custos-resumo | Custos e produção | 88 | 00:32 |
| custos-produto-insumo | Custos e produção | 104 | 00:36 |
| custos-lotes | Custos e produção | 92 | 00:35 |
| custos-evolucao | Custos e produção | 83 | 00:29 |
| custos-registrar-lote | Custos e produção | 91 | 00:36 |
| estoque-saldos | Estoque e perdas | 84 | 00:31 |
| estoque-fefo | Estoque e perdas | 70 | 00:25 |
| estoque-movimentos-perdas | Estoque e perdas | 66 | 00:31 |
| estoque-alcada | Estoque e perdas | 103 | 00:39 |
| contratos-lista | Contratos públicos | 90 | 00:35 |
| contrato-detalhe | Contratos públicos | 92 | 00:36 |
| contrato-itens | Contratos públicos | 101 | 00:37 |
| contrato-empenhos | Contratos públicos | 91 | 00:35 |
| contrato-resultado | Contratos públicos | 85 | 00:35 |
| contratos-orgaos | Contratos públicos | 110 | 00:41 |
| contrato-cadastrar | Contratos públicos | 109 | 00:43 |
| orcamento-fixo | Orçamento | 80 | 00:31 |
| orcamento-flexivel | Orçamento | 70 | 00:28 |
| orcamento-lancar | Orçamento | 84 | 00:34 |
| orcamento-forecast | Orçamento | 65 | 00:29 |
| configuracoes-metas | Configurações | 94 | 00:38 |
| configuracoes-backup | Configurações | 112 | 00:45 |
| rotina | Encerramento | 77 | 00:32 |
| encerramento | Encerramento | 49 | 00:24 |
