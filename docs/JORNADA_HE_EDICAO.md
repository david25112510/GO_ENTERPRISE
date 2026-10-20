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

## Evolução por período de importação

O gráfico permite alternar entre saldo do banco, horas extras e quantidade de colaboradores fora da meta. O filtro mostra as últimas 6, 12 ou todas as competências, com rolagem horizontal para históricos longos.

Passar o mouse, tocar ou focar um ponto exibe o valor e sua variação em relação à competência anterior disponível. As setas esquerda/direita navegam pelos pontos. Os totais históricos permanecem consolidados por competência; reimportar o mesmo período atualiza esse ponto, sem criar uma nova competência.

Validação: 12 testes automatizados (`npm test`) e teste de integração em Electron com dados sintéticos, cobrindo listagem de ativos com e sem importação, importação pelo perfil, edição, persistência local, reimportação, exclusão e controles do gráfico. O gráfico também foi inspecionado visualmente. A extração de um PDF real não foi revalidada nesta alteração.
