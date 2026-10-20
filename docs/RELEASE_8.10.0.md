# GO Enterprise 8.10.0

Data: 20/10/2026.

Esta versão incorpora os commits publicados até a 8.9.1, preservando o módulo de OS de Desenvolvimento e seus indicadores no Dashboard TV.

## Novidades em Jornada/HE

- Visão Geral com todos os colaboradores ativos do RH, incluindo quem ainda não tem dados importados.
- Edição dos totais e exclusão dos dados do colaborador somente no período selecionado.
- Importação do cartão de ponto pelo perfil atualiza automaticamente Jornada/HE, com validação de período e matrícula.
- Gráfico interativo com seleção de indicador, filtro de competências, comparação com período anterior e navegação por teclado.
- Inclusão da imagem da bandeja no pacote do aplicativo.

## Validação

Os 12 testes automatizados passaram após incorporar a versão 8.9.1. O teste de integração em Electron cobriu importação pelo perfil, reimportação, edição, persistência local, exclusão, listagem dos ativos e interação com o gráfico.

O conteúdo `app.asar` extraído do instalador corresponde ao pacote verificado. O teste de integração também passou usando esse conteúdo extraído. Conferidas versão, correspondência dos arquivos de código, imagem da bandeja e presença do arquivo local de bootstrap.

Os testes usam dados sintéticos; PDFs reais, sincronização entre duas máquinas e instalação interativa devem ser homologados na operação. Os problemas de sincronização descritos no relatório de verificação de 20/10/2026 não foram corrigidos nesta release.

## Publicação

Artefatos: `GO-Enterprise-Setup-8.10.0.exe` e respectivo `.blockmap`.

SHA-256 do instalador: `0CF02EB788CC02946A902AD0C612F8DDCCBCDD4EF5A1C811B67FF27400EE6D84`.

Destino configurado nesta máquina: `Z:\atualizacoes`. O `version.json` deve ser atualizado somente depois de copiar e verificar os artefatos. A versão 8.9.1 pode permanecer na pasta para recuperação.
