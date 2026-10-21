# Estado atual — GO Enterprise 8.10.0

Registro atualizado em 21/10/2026. Publicação e conferência realizadas em 20/10/2026.

## Código e distribuição

- Repositório: https://github.com/david25112510/GO_ENTERPRISE, branch `main`.
- Funcionalidades: commit `6ee8e94` — integração do ponto, edição e evolução de Jornada/HE.
- Release: commit `986c5e6d3a33a9d0442ac55b7ada11d7ebfcc08a` — versão 8.10.0 e recurso da bandeja.
- A publicação preserva os quatro commits anteriores da 8.9.1, incluindo OS de Desenvolvimento e seus indicadores no Dashboard TV.
- Instalador: `dist/GO-Enterprise-Setup-8.10.0.exe`, 77.826.434 bytes.
- Rede configurada na máquina de publicação: `Z:\atualizacoes`, com instalador, `.blockmap` e `version.json` apontando para 8.10.0. A letra da unidade pode variar em outros computadores.
- SHA-256: `0CF02EB788CC02946A902AD0C612F8DDCCBCDD4EF5A1C811B67FF27400EE6D84`.
- A versão 8.9.1 e uma cópia do manifesto anterior foram preservadas na rede.

No encerramento da publicação, o commit local e `origin/main` coincidiam, sem alterações locais pendentes. Esse é um registro da publicação, não uma afirmação sobre o estado futuro do repositório.

## Jornada/HE

A Visão Geral usa os colaboradores ativos do RH, inclusive sem importação. Quem não tem registro aparece como “Sem dados no período”, sem criar saldos fictícios. Registros existentes podem ser editados ou excluídos da competência; o cadastro do colaborador e outros períodos são preservados.

A folha importada pelo perfil atualiza a competência do mês de término do ponto. A integração valida matrícula e datas, usa HE autorizadas e preserva informações ausentes. O gráfico permite escolher indicador e intervalo, selecionar pontos e comparar com a competência anterior disponível. Reimportar a mesma competência atualiza seu ponto no gráfico.

Detalhes: [JORNADA_HE_EDICAO.md](JORNADA_HE_EDICAO.md).

## Evidências e limites

- 12 testes automatizados passaram após incorporar os commits da 8.9.1.
- Testes em Electron com dados sintéticos cobriram importação, reimportação, edição, persistência local, exclusão, listagem e gráfico.
- O `app.asar` extraído do instalador correspondeu ao pacote validado; o teste de integração passou também sobre esse conteúdo.
- Hash do instalador copiado para a rede conferido com o local. Imagem da bandeja e arquivo local de bootstrap presentes no pacote; segredo não versionado.
- Não houve homologação de instalação interativa, PDFs reais nem sincronização em dois computadores nesta release.
- Persistem problemas de sincronização encontrados na verificação: perda de alterações concorrentes, exclusões recriadas, JSON inválido sobrescrito e eventos externos descartados. Ver [relatório](VERIFICACAO_2026-10-20.md); a imagem da bandeja foi corrigida no empacotamento 8.10.0.

## Próxima manutenção

Antes de modificar o código, verificar o estado do Git e atualizar a branch sem descartar trabalho local. Executar `npm test`, validar os fluxos afetados, atualizar ambas as versões em `package.json` e `package-lock.json`, e seguir [BUILD_E_RELEASE.md](BUILD_E_RELEASE.md). Não sobrescrever uma publicação mais recente na rede.
