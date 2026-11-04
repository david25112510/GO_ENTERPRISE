# Edição e importação pelo perfil — Jornada/HE

Na aba **Visão Geral**, aparecem todos os colaboradores ativos do cadastro de RH, mesmo antes da primeira importação. Cadastros antigos sem status explícito seguem a regra do RH e são considerados ativos. Colaboradores inativos não aparecem.

Quem não possui registro na competência aparece com **Sem dados no período**, horas não informadas (`—`) e acesso ao perfil para importar a folha. Esses cartões não criam registros nem entram nos totais de horas importadas. Ao excluir os dados do período, o cartão permanece enquanto o cadastro estiver ativo.

Nos cartões com dados do período, o gestor encontra:

- **Editar:** abre os dados do período exibido. Horas usam `HH:MM`; os três saldos aceitam sinal negativo. Campo vazio significa informação não disponível. Saldo anterior, movimento e saldo total são editáveis separadamente.
- **Excluir do período:** pede confirmação e remove somente o registro daquela competência em Jornada/HE. Mantém cadastro no RH, folhas de ponto, outros períodos e janelas de 180 dias. Uma nova importação pode incluir o colaborador novamente.

Ao importar uma folha de ponto no perfil, a aplicação também cria ou atualiza o colaborador em Jornada/HE, na competência definida pelo mês de término do ponto.

| Informação do ponto | Destino em Jornada/HE |
| --- | --- |
| Saldo anterior, do período e atual | Saldos do banco de horas, respeitando crédito/débito |
| Coluna de horas trabalhadas | Horas trabalhadas |
| Coluna de HE autorizadas | Horas extras; não soma novamente HE executadas |
| Atrasos, faltas e adicional noturno | Totais das respectivas colunas diárias |
| Horário | Horário do colaborador no período |
| Rubricas explicitamente identificadas como abono, intra/interjornada | Totais correspondentes |

Reimportar atualiza os valores reconhecidos, sem duplicar o colaborador no período. Dados ausentes ou ilegíveis são preservados; células vazias em uma coluna diária presente contam como zero. Pendências e eventos detalhados já importados são mantidos. Uma importação pode substituir ajustes manuais nos campos que fornecer.

Períodos inválidos e matrículas divergentes são recusados antes de alterar os dados. A comparação de matrícula tolera zeros à esquerda.

## Planilha de saldo e competência

A importação pede o início e o fim do **Período Ativo do Ponto**, além do arquivo XLSX. A data de geração do relatório não define a competência. Por exemplo, um arquivo gerado em 04/11/2026 com período de 26/09 a 25/10 pertence a outubro/2026. Datas inválidas, invertidas ou conflitantes com um intervalo já cadastrado no mês são recusadas.

## Sinais no cartão de ponto

No cartão do Portal Meu RH, **A PAGAR** representa débito do colaborador (negativo) e **A COMPENSAR** representa crédito (positivo). **A DESCONTAR** continua negativo. Quando há sinal explícito, ele prevalece. Importação e exibição usam a mesma interpretação. Valores ilegíveis não substituem saldos existentes.

Exemplo validado: −32h11 de saldo anterior + 3h13 de movimento = −28h58 de saldo atual. O período deste cartão é 26/10 a 25/11/2026, competência novembro; não confundir com o período da planilha anterior.

Após atualizar, reimporte as folhas afetadas para corrigir os valores persistidos. Não há migração automática. Registros criados anteriormente em competência errada pela planilha precisam ser revisados no Histórico; reimportar no mês correto não remove o registro do mês errado.

## Resumo por competência e ofensores

O quadro grande de evolução foi substituído por três gráficos compactos com as últimas três competências: saldo do banco, horas extras e colaboradores fora da meta. Os valores ficam sempre visíveis ao lado das barras, com horas em HH:MM. As barras representam a magnitude proporcional dentro de cada indicador; o sinal aparece no valor e os saldos negativos ficam vermelhos.

Ofensores ocupa a largura disponível, reorganiza os grupos conforme o espaço e permite quebra de linha nos nomes completos. Os valores ficam alinhados à direita.

Validação da 8.10.1: 16 testes automatizados; extração do PDF fornecido pelo usuário com o importador real; inspeção visual e verificação de overflow dos dois layouts em larguras de 375, 768, 1024 e 1440 pixels. Os exemplos visuais usam dados sintéticos. Isso não equivale a homologação de sincronização entre computadores.
