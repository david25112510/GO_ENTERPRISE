# Módulo Jornada/HE — Design (Fase 2: dados de aging, intra/interjornada detalhado e assinaturas pendentes)

## Contexto

A Fase 1 do módulo Jornada/HE (ver `docs/superpowers/specs/2026-08-19-jornada-he-design.md`, implementada e em produção desde a v8.6.0) centralizou banco de horas e horas extras a partir de 2 dos 6 documentos que a ferramenta Python externa (`F:\Projetos DEV\Modulo RH`) originalmente processava, deixando explicitamente de fora: aging de 180 dias, tela de intrajornada/interjornada e assinaturas pendentes de ponto.

Esta Fase 2 traz os 4 documentos restantes:

1. **`Bco_Horas_Selbetti_Analitico_Portal_MEU_RH.pdf`** — evento a evento de cada janela de 180 dias do banco de horas por colaborador (regra CLT de compensação).
2. **`Bco_Horas_Selbetti_Sintetico_Portal_MEU_RH.pdf`** — projeção de quanto do saldo atual vai "vencer" (precisar ser pago/descontado) em cada competência futura.
3. **`Espelho_de_Ponto_PENDENTE_Assinatura_Portal_MEU_RH.pdf`** — lista de espelhos de ponto ainda não assinados pelo colaborador.
4. **`Listagem_de_INTERJORNADA_e_INTRAJORNADA_Portal_MEU_RH.pdf`** — detalhe evento a evento (data/código/descrição/minutos) das ocorrências de intra/interjornada do período ativo.

Esta fase é só sobre **dados**: importar, guardar, e exibir em forma de tabela simples. O redesenho visual da Visão Geral (gráficos, indicador de meta ±10h, lista dinâmica com foto e drill-down por colaborador) fica para uma **Fase 3**, especificada separadamente depois que esta Fase 2 estiver validada — o dado detalhado de intra/interjornada (item 4) já é capturado aqui justamente para alimentar aquele drill-down futuro, mas não ganha tela própria nesta fase.

## Modelo de dados

**No registro existente `db.jornadaPeriods[].employees[]`** (Fase 1) — três campos novos, porque são sobre o período ativo atual:

```js
{
  // ...campos da Fase 1 inalterados...
  pendingSignatureDocs: [{ id, arquivo, status }],   // Espelho de Ponto Pendente Assinatura
  interIntraEvents: [{ data, codigo, descricao, minutos, tipo }],  // tipo: 'intra' | 'inter' — só detalhe, não recalcula intrajornadaMin/interjornadaMin
  vencimentos180d: [{ competenciaId, valorMin }]     // projeção do Sintético — quanto vence em cada competência futura
}
```

`interIntraEvents` é armazenado mas **não tem tela própria nesta fase** — só populado para a Fase 3 usar depois. Os totais que já alimentam banco de horas/pagamento continuam vindo da Listagem de HE (Fase 1), não recalculados a partir desses eventos.

**Coleção nova `db.jornada180Windows[]`** — porque é sobre uma janela de 180 dias diferente do período ativo (no exemplo real: janela `26/01/26 a 25/02/26`, período ativo `26/07/26 a 25/08/26`):

```js
{
  id,                          // "YYYY-MM" da janelaFim, mesmo padrão de jornadaPeriodId
  janelaIni, janelaFim,        // "YYYY-MM-DD"
  importedAt, updatedAt,
  employees: [{
    employeeId, chapa, nome,
    valorPagarDescontarMin,    // total da janela, minutos com sinal (mesmo parser de duração assinada
                               // já usado pra banco de horas — "Horas a PAGAR/DESCONTAR" é HH:MM no PDF,
                               // não R$ apesar do nome "Valor"; positivo/negativo indica pagar vs. descontar)
    eventos: [{ data, dataLimite, evento, tipo, valorMin }]
  }]
}
```

Um import pode gerar/atualizar mais de um registro em `db.jornada180Windows` se colaboradores diferentes tiverem janelas diferentes no mesmo arquivo (o layout do PDF permite isso, mesmo que no exemplo real todo mundo compartilhe a mesma janela).

`src/dataStore.js`: adicionar `'jornada180Windows'` a `ARRAY_COLLECTIONS` (mesma mecânica de merge por `id`/`updatedAt`).

**Confirmado com o usuário**: os valores de 180 dias (tanto o total da janela quanto a projeção `vencimentos180d`) são **só informativos** nesta fase — não entram no cálculo de pagamento estimado (`computeTimesheetPayroll`). Se um dia isso mudar, é uma decisão de negócio explícita, não algo que a Fase 2 assume.

## Componentes e reaproveitamento

Todos os 4 parsers reaproveitam a mesma camada de baixo nível já validada na Fase 1 (`extractPdfFragments` e as funções de que ela depende) — nenhuma mudança nessas funções, só parsers novos por cima, seguindo o padrão de `parseListagemHeFragments`/`listagemHeClassifyCol` (classificação de coluna por posição X, agrupamento de linha por posição Y).

- **`parseAnalitico180Fragments(frags)`** → `{ windows: [{ janelaIni, janelaFim, employees: [...] }] }` — blocos repetidos por colaborador; a maioria sem eventos (só o total "00:00"), tratado como caso normal, não erro.
- **`parseSintetico180Fragments(frags)`** → `{ periodoIni, periodoFim, employees: [{ chapa, nome, vencimentos: [{ competenciaId, valorMin }] }] }` — o número de colunas "REF COMP M/YYYY" é detectado dinamicamente pelo cabeçalho, não fixado (no exemplo real são 3, mas pode variar).
- **`parseEspelhoPendenteFragments(frags)`** → `{ employees: [{ chapa, nome, docs: [{ id, arquivo, status }] }] }`.
- **`parseInterIntraFragments(frags)`** → `{ periodoIni, periodoFim, employees: [{ chapa, nome, eventos: [...] }] }`.

Cada parser ganha um importador próprio (`importJornadaAnalitico180`, `importJornadaSintetico180`, `importJornadaEspelhoPendente`, `importJornadaInterIntraDetalhado`), seguindo o mesmo padrão de casamento por chapa→nome (`norm`/`normName`), log em `db.imports`, `save(true)` e `alert()` de resumo (atualizados/não encontrados) já usado pelos importadores da Fase 1.

**UI**: 4 botões novos de importação na aba Visão Geral do Jornada/HE (mesmo padrão "um botão por tipo de relatório" da Fase 1). Uma aba nova **"180 dias / Pendências"**:
- Tabela por colaborador: janela de 180 dias mais recente, valor a pagar/descontar, e as próximas competências com vencimento projetado.
- Lista de assinaturas pendentes: colaborador, quantidade de documentos, quais.

**Alerta**: `pendingSignatureAlerts()` — função pura no mesmo padrão de `vacationDeadlineAlerts()`/`financeDueAlerts()` (já existentes, ambas alimentando a lista de alertas do Home), retornando um item por colaborador com pelo menos 1 documento pendente. Entra na mesma lista de alertas do Home (`[...vacationDeadlineAlerts(),...financeDueAlerts(),...lossAlerts(),...pendingSignatureAlerts()]`).

**O que NÃO muda nesta fase**: nenhum campo da Fase 1 é alterado; `computeTimesheetPayroll` não é tocado; a Visão Geral do Jornada/HE ganha só os 4 botões novos — o redesenho com gráficos/meta/foto/drill-down é a Fase 3.

## Fluxo de importação e tratamento de erro

Mesmo fluxo da Fase 1: nunca grava dado incorreto (aborta com mensagem clara se o layout não bater); casamento por chapa com fallback por nome; colaborador não encontrado aparece no resumo sem quebrar o resto do import; reimportação é idempotente (atualiza o registro existente, não duplica); as 4 importações são independentes entre si e das duas da Fase 1.

## Testes

- Rodar os 4 importadores contra os arquivos reais em `Modulo RH` e cruzar os números com `Modulo RH\Relatorios\Ultimo_Painel.html` (saída já calculada pela ferramenta Python para o mesmo período — serve de gabarito, igual ao `historico.json` foi usado na Fase 1).
- **Risco conhecido**: o arquivo Analítico de exemplo não tem nenhum colaborador com evento real na janela de 180 dias (todos "00:00", tabela vazia) — o caminho "com eventos" é escrito a partir da estrutura visível do cabeçalho da tabela, mas sem um exemplo populado real para cravar 100%. Documentado como risco residual, a ser revalidado assim que houver um arquivo real com eventos.
- Reimportar o mesmo arquivo duas vezes: atualiza, não duplica.
- Importar só um dos 4 arquivos: campos dos outros ficam vazios/ausentes, sem erro.
- Sintético com número de colunas "REF COMP" diferente do exemplo (2, 4, 5...): detecta corretamente sem hardcode.
- Alerta de assinatura pendente aparece no Home quando há pendência, some quando não há.
- Build completo (`npx electron-builder --win`) sem erro antes de publicar.

## Fora de escopo (Fase 3, a especificar depois)

- Redesenho da Visão Geral: gráficos (distribuição de saldo, evolução por período), indicador de meta (±10h configurado pelo usuário), lista de colaboradores dinâmica com foto e drill-down ao clicar (mostrando HE, intra, inter, adicional noturno e status de meta).
- Qualquer uso de `interIntraEvents`/`vencimentos180d` além de guardar e mostrar em tabela simples.
- Itens já identificados na revisão final da Fase 1 e ainda pendentes (backlog separado, não fazem parte desta Fase 2): comparação por colaborador na aba Histórico existente, persistência de colaboradores não encontrados nos importadores da Fase 1, remoção de `importHourBank` morto.
