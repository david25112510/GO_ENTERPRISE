# Módulo Jornada/HE — Design (Fase 1)

## Contexto

O GO Enterprise já lida com "banco de horas" de duas formas desconectadas: um painel na Visão Geral que importa uma planilha `.xlsx` da equipe inteira e sobrescreve o saldo de cada colaborador sem guardar histórico (`emp.hourBank`, via `importHourBank`), e uma importação de PDF "Cartão de Ponto" individual que guarda detalhe diário por competência (`db.timesheets[]`) e alimenta um resumo de pagamento estimado no perfil do colaborador.

Paralelamente, existe uma ferramenta separada em `F:\Projetos DEV\Modulo RH` — um conjunto de scripts Python, rodado manualmente todo mês — que lê 5 PDFs + 1 Excel exportados do **Portal Meu RH** e calcula banco de horas, banco de horas com aging de 180 dias (regra CLT de compensação), intrajornada, interjornada e pendências de assinatura de ponto, mantendo histórico mês a mês em JSON.

O objetivo deste módulo é centralizar essa informação dentro do GO Enterprise, portando a lógica de leitura/cálculo da ferramenta Python para JS (sem depender mais do script externo), com histórico desde o início. Dado o tamanho da ferramenta original (6 documentos de entrada, aging, comparação mês a mês), o trabalho foi dividido em duas fases — **este documento cobre só a Fase 1**: banco de horas + horas extras (HE), os dois conceitos que dão nome ao módulo. Aging de 180 dias, intra/interjornada como telas próprias e assinaturas pendentes ficam para uma Fase 2, a especificar depois que a Fase 1 estiver validada com dado real.

## Modelo de dados

Nova coleção `db.jornadaPeriods[]` — um registro por período/competência processado. Nunca é sobrescrito por um período diferente; reimportar o **mesmo** período atualiza aquele registro específico (mesma competência = mesmo `id`, calculado a partir de `periodoIni`+`periodoFim`).

```js
{
  id,                        // ex: `${periodoIni}_${periodoFim}`
  periodoIni, periodoFim,    // "YYYY-MM-DD"
  importedAt, updatedAt,     // ISO datetime — updatedAt necessário pro merge entre PCs (dataStore.js)
  employees: [{
    employeeId,               // casado com db.employees, null se não encontrado
    chapa, nome,               // preservados mesmo sem match, para auditoria/correção de cadastro
    // ---- da Planilha_Saldo_Horas.xlsx ----
    bhSaldoAnteriorMin, bhSaldoPeriodoMin, bhSaldoTotalMin,
    // ---- da Listagem de HE, FA, AT e AB (PDF) ----
    horario, horasBaseMin, horasTrabMin, horasAtrasoMin, horasFaltaMin,
    horasAbonoMin, horasExtraMin, horasAdNoturnoMin,
    intrajornadaMin, interjornadaMin   // capturados agora mesmo sem tela própria ainda (Fase 2)
  }]
}
```

Casamento de colaborador: por `db.employees[].reg` (matrícula/chapa) normalizado; quando a fonte não traz matrícula (a planilha `.xlsx` não tem coluna de chapa), cai para nome normalizado — mesmo padrão que `importHourBank` já usa hoje (`normName`, sem criar colaborador novo automaticamente).

`src/dataStore.js`: adicionar `'jornadaPeriods'` a `ARRAY_COLLECTIONS` (mesma mecânica de merge por `id`/`updatedAt` já usada pelas outras coleções — precisa de um campo `updatedAt` no registro do período para o merge funcionar corretamente entre PCs).

## Componentes e reaproveitamento

**Planilha (`Planilha_Saldo_Horas.xlsx`)**: reaproveita integralmente o parser XLSX já existente (`readFirstSheet`, `findHeaderRow`, `findCol`, `parseHourBankCell`, `parsePtBrReportDate`) usado hoje por `importHourBank` — o formato já é 100% compatível. A diferença é o destino: em vez de `emp.hourBank = {...}` (sobrescreve), grava num registro de `db.jornadaPeriods`.

**Listagem de HE, FA, AT e AB (PDF)**: reaproveita a camada de baixo nível de extração de texto de PDF já construída para o Cartão de Ponto (descompactação FlateDecode, mapeamento de fonte CID via `ToUnicode`, reconstrução de posição X/Y dos fragmentos de texto — `extractPdfFragments` e vizinhas). Em cima dela, uma função nova de interpretação de estrutura (análoga a `parsePontoStructure`, mas para o layout desta tabela específica: matrícula, horário contratual e as 9 colunas de minutos). **Este é o maior risco técnico da Fase 1** — a ferramenta Python usa uma biblioteca pronta (`pdfplumber`) para detecção de tabela; aqui a reconstrução das colunas a partir da posição do texto é feita à mão. Mitigação: já existe um PDF real de exemplo (`Listagem_de_HE_FA_AT_e_AB_Portal_MEU_RH.pdf`) para testar contra dado real, e o `historico.json` da ferramenta Python serve de gabarito para conferir os números.

**Módulo novo (UI)**: item de menu "🕒 Jornada/HE", visível só para `gestor` (adicionar a `NAV_VIEWS_BY_ROLE.gestor` e a uma nova `<section id="jornadaHe">`). Abas internas (reaproveitando o componente `.role-tabs` já usado pelo SELBNEWS):
- **Visão Geral**: cards de KPI (saldo líquido da equipe, nº de colaboradores com saldo negativo, HE total do período).
- **Banco de Horas**: tabela por colaborador (saldo anterior/período/total do período mais recente).
- **HE do período**: tabela por colaborador (extras, atraso, falta, abono, adicional noturno).
- **Histórico**: lista de períodos importados, com comparação simples contra o período anterior por colaborador (delta de saldo total e de HE; marca colaboradores novos — sem registro no período anterior — e colaboradores que somem de um período para o outro).

Botões: "Importar planilha de saldo" e "Importar Listagem de HE" (um botão por tipo de arquivo, sem detecção automática — confirmado com o usuário).

**Meu Painel (operador)**: a seção de banco de horas passa a ler o registro do colaborador logado no período mais recente de `db.jornadaPeriods`, em vez de `emp.hourBank`.

**Resumo de pagamento estimado (perfil individual, `computeTimesheetPayroll`)**: passa a buscar banco de horas do período mais recente de `db.jornadaPeriods` (`bhSaldoPeriodoMin`, não o total acumulado — evita contar de novo saldo de meses anteriores) em vez de `ts.saldoAtual` de `db.timesheets`. **Decisão confirmada com o usuário**: `horasExtraMin` (HE) NÃO entra nessa conta de R$ — ela só alimenta o saldo do banco de horas (que só vira pagamento quando fechado pela regra dos 180 dias, fora do escopo da Fase 1). O restante do cálculo (intra/interjornada a 65%, desconto de falta) continua igual, só a fonte dos minutos muda: intra/interjornada passam a vir de `db.jornadaPeriods` (`intrajornadaMin`/`interjornadaMin`) em vez das rubricas de `db.timesheets`; falta continua saindo de `horasFaltaMin`.

**O que é removido**: o painel "Banco de horas da equipe" na Visão Geral (fica redundante) e a função `importHourBank`/campo `emp.hourBank` deixam de ser usados para exibição — substituídos pelo novo módulo.

**O que NÃO muda**: a importação de Cartão de Ponto individual (`importTimesheet`/`db.timesheets`) continua existindo exatamente como está — é uma fonte complementar (detalhe diário, um colaborador de cada vez), não uma das duas coisas que o usuário pediu para substituir.

## Fluxo de importação e tratamento de erro

1. Gestor clica em um dos dois botões de importação e escolhe o arquivo.
2. O arquivo é lido e interpretado; se o layout não bater com o esperado (mesma fragilidade que a ferramenta Python já documenta para os PDFs do Portal Meu RH), o import é abortado com uma mensagem clara — nunca grava dado incorreto.
3. O período é identificado a partir do próprio arquivo (data de geração no título da planilha; período no cabeçalho da Listagem — a confirmar o padrão exato durante a implementação, usando o PDF de exemplo).
4. Cada linha é casada com `db.employees` por matrícula, com fallback por nome.
5. Os campos daquele arquivo são gravados no registro do período (criando o período se for novo, atualizando se já existir).
6. A tela mostra um resumo: quantos colaboradores foram atualizados e quantos não foram encontrados (com nome), para o gestor corrigir cadastro se necessário.
7. As duas importações são independentes — pode importar só uma, só a outra, ou as duas, em qualquer ordem, exatamente como a ferramenta Python permite hoje.

## Testes

- Rodar os dois importadores contra os arquivos reais já existentes em `Modulo RH` (a planilha e o PDF de exemplo) e conferir os números contra `historico.json` da ferramenta Python para o mesmo período.
- Colaborador não encontrado (nome/matrícula divergente): aparece no resumo de "não encontrados", sem quebrar o resto do import.
- Reimportar o mesmo período duas vezes: atualiza, não duplica.
- Importar só um dos dois arquivos: campos do outro ficam vazios, sem erro.
- Conferir Meu Painel (operador) e o resumo de pagamento no perfil individual lendo corretamente do novo período.
- Build completo (`npm run dist`) sem erro antes de publicar.

## Fora de escopo (Fase 2, não especificado ainda)

- Sintético/Analítico (PDF) — aging de 180 dias, régua de vencimento por competência.
- Tela própria de Intrajornada/Interjornada (os minutos já são capturados na Fase 1, mas sem UI dedicada de violação/alerta).
- Espelho de Ponto Pendente de Assinatura (PDF) — lista de pendências de assinatura.
- Qualquer refinamento do algoritmo de comparação mês a mês além do delta simples descrito acima.
