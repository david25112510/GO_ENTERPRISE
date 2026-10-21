# Verificação do GO Enterprise — 20/10/2026

Nota de acompanhamento (21/10/2026): este relatório registra a avaliação da base 8.8.0 antes
da integração das mudanças remotas. Na release 8.10.0, a ausência de `build/tray.png` no pacote
foi corrigida e foram adicionados 12 testes de Jornada/HE. Os demais achados não devem ser
interpretados como corrigidos. Consulte o [estado atual](ESTADO_ATUAL_8.10.0.md).

Versão declarada: 8.8.0. A aplicação abre, mas a persistência apresenta falhas reproduzíveis que podem causar perda de dados. Recomenda-se corrigir os itens P1 antes de ampliar o uso simultâneo em vários computadores.

Esta revisão não alterou código de produção nem acessou a base operacional. Foram utilizados arquivos temporários, dados sintéticos e um perfil Electron isolado.

## Escopo e resultados

- Leitura de `main.js`, `preload.js`, quatro módulos de `src`, persistência e inicialização do renderer, configurações de distribuição e documentação.
- Compilação de sintaxe dos seis arquivos JavaScript e do script inline de `renderer/app.html`: aprovada.
- Electron instalado: 30.5.1, com Node embarcado 20.16.0. `node` e `npm` não estão disponíveis no PATH desta sessão; os testes utilizaram o executável Electron existente.
- Testes de interface em janela oculta, usando o preload real e respostas IPC simuladas: primeiro acesso, tela de login, navegação pelas 11 telas do gestor, inicialização kiosk e alternância Dashboard/SELBNEWS aprovados com base sintética.
- Gravação, resolução e exclusão de imagem temporária: aprovadas. Rejeição de caminho fora da pasta de mídia e conteúdo não suportado: aprovada.
- Inspeção do `dist/win-unpacked/resources/app.asar` existente: imagem da bandeja ausente.
- Foram executados 16 cenários principais: sete passaram e nove detectaram falhas. Algumas falhas correspondem à mesma causa, como ignorar a resposta da mesclagem.
- Quatro entradas adicionais foram exercitadas no atualizador: manifesto `null` e instalador numérico geraram exceções não tratadas; array vazio e instalador inexistente retornaram resultados sem exceção.

Os testes de interface verificam inicialização e execução da renderização. Não equivalem a homologação visual nem à validação de todos os cálculos e importadores.

## Achados prioritários

### 1. P1 — O renderer ignora os dados resultantes da mesclagem

Referências: `renderer/app.html:2462`, `src/dataStore.js:151`.

`writeData()` retorna `data: finalDb`, mas `save()` só examina `conflicts`. A tela e o cache local permanecem com o objeto anterior, enquanto a referência de versão do processo principal avança.

Reprodução: disco contém um novo registro remoto; um salvamento local mescla e preserva esse registro; o segundo salvamento com o mesmo objeto local o remove. Um teste no renderer real também confirmou que um registro adicional retornado por `writeData()` não é adotado.

Correção sugerida: adotar a resposta canônica e atualizar o cache, preservando edições que possam ter ocorrido durante o salvamento assíncrono. Serializar salvamentos e vincular cada escrita à versão efetivamente lida pelo cliente.

### 2. P1 — Mesclagem sobrescreve alterações independentes

Referência: `src/dataStore.js:65`.

A mesclagem compara apenas disco e entrada. Sem a versão-base por registro, não distingue um registro local intocado de uma edição local.

Reprodução: disco contém A editado e B original; entrada contém A original e B editado. Para registros sem `updatedAt`, A volta ao valor original. A versão anterior aparece no log de conflito, mas a alteração deixa de valer nos dados ativos.

Correção sugerida: implementar comparação entre base, disco e edição local, ou salvar operações por registro com controle de versão.

### 3. P1 — Exclusões são desfeitas durante a mesclagem

Referência: `src/dataStore.js:65`.

O mapa começa com todos os registros do disco e só recebe inclusões/substituições da entrada. Ausência de um registro na entrada não representa exclusão.

Reprodução: disco tem IDs 1 e 2; entrada excluiu ID 1. O resultado volta a conter ambos.

Correção sugerida: representar exclusões explicitamente, com versão ou tombstones, e reconciliá-las com a versão-base.

### 4. P1 — Leitura da TV altera a referência de versão do editor

Referências: `src/dataStore.js:54`, `main.js:235`, `renderer/app.html:4707`.

`baseSavedAt` é global no processo principal. Qualquer `readData()`, inclusive a atualização periódica da TV, avança essa referência.

Reprodução: editor possui versão antiga; disco recebe novo registro; leitura pela outra janela avança a base; editor salva seu objeto antigo. A escrita deixa de detectar divergência e elimina o novo registro.

Correção sugerida: manter revisão por cliente/snapshot e exigir a revisão esperada em cada escrita. Uma leitura de outra janela não deve confirmar que o editor incorporou aquela versão.

### 5. P1 — JSON inválido é sobrescrito como se não existisse

Referências: `src/dataStore.js:40`, `src/dataStore.js:127`.

`readEnvelope()` converte erro de leitura/parse em `null`, também usado para arquivo ausente. `writeData()` continua e substitui o arquivo.

Reprodução: um arquivo temporário com JSON inválido foi substituído por uma base nova sem recusa da operação.

Correção sugerida: distinguir arquivo inexistente de erro de leitura/corrupção; bloquear a escrita em caso de erro e preservar uma cópia recuperável.

### 6. P1 — Mudança externa rápida é descartada pelo processo principal

Referências: `src/dataStore.js:172`, `main.js:34`.

Depois de verificar que `savedAt` mudou, o watcher ainda classifica como local qualquer evento ocorrido até três segundos após uma escrita própria. O processo principal descarta eventos com `external === false`.

Reprodução: mudança externa 250 ms após salvamento local foi recebida com outra revisão, mas `external: false`. O watcher também avançou sua referência, impedindo que a mesma revisão fosse anunciada depois.

Correção sugerida: identificar origem/revisão da escrita, sem descartar alterações distintas apenas pela proximidade temporal.

### 7. P2 — Pacote distribuído não contém imagem da bandeja

Referências: `package.json:30`, `main.js:148`.

O código procura `build/tray.png` dentro da aplicação. O padrão `build.files` não inclui essa pasta e o arquivo não está no ASAR existente. `createTray()` deixa `tray` nulo.

Impacto: funcionalidades de reabertura pela bandeja não ficam disponíveis na distribuição, embora possam funcionar no desenvolvimento.

Correção sugerida: incluir o recurso no pacote e alinhar o caminho em execução. Verificar o conteúdo do artefato gerado.

### 8. P2 — Conflitos com timestamp não preservam o conteúdo descartado

Referência: `src/dataStore.js:82`.

O ramo com dois `updatedAt` registra coleção, ID e vencedor, mas omite `discarded`. Isso contradiz a promessa de preservar a versão perdedora para recuperação.

Reprodução: duas notícias com o mesmo ID e timestamps diferentes geraram conflito sem conteúdo descartado.

Correção sugerida: guardar a versão perdedora em ambos os ramos e definir retenção/exportação adequada.

### 9. P2 — Falha ao gravar na pasta compartilhada fica apenas no console

Referências: `renderer/app.html:2464`, `renderer/app.html:2541`.

Constatação por leitura de código: a exceção da escrita compartilhada não atualiza `lastLocalSaveError` nem outro estado de falha remota. A interface pode continuar mostrando “Pasta compartilhada conectada” enquanto apenas o cache local foi salvo.

Correção sugerida: manter estado separado para gravação remota, exibir falha e oferecer nova tentativa, com proteção contra sobrescrita de revisões mais recentes.

### 10. P2 — Manifesto de atualização não valida estrutura e tipos

Referências: `src/updater.js:44`, `main.js:178`.

O `try/catch` protege somente leitura/parse. JSON válido contendo `null` gera erro ao acessar `version`; `installer: 123` gera erro em `path.join()`. A checagem automática não envolve a chamada em tratamento de exceções.

Correção sugerida: validar objeto, versão e nome do instalador antes de usá-los; transformar falhas em resultado controlado. Validar também o destino permitido antes de iniciar uma instalação.

## Outros pontos identificados

- **Atualização entre janelas:** `data:write` não transmite o resultado para a outra janela. Eventos da própria escrita são ignorados pelo watcher; a TV depende da releitura periódica de 60 segundos para perceber essas alterações.
- **Cache criptografado:** em `boot()`, o ramo `GO-DB-ENC` retorna antes de consultar a pasta compartilhada. Após desbloquear, o código usa o cache decifrado. O fluxo merece um teste específico com cache antigo e base compartilhada mais recente.
- **Aviso de CSP:** o Electron emitiu aviso de Content Security Policy ausente/insegura durante o teste. Não foi realizada exploração de segurança.
- **Limites de acesso documentados:** papéis são controlados na interface, o banco inteiro chega ao renderer e o JSON compartilhado permanece em texto simples mesmo com criptografia local ativada. Esses comportamentos já constam em `docs/SEGURANCA_E_ACESSO.md`.
- **Automação ausente:** `package.json` não oferece scripts de teste ou lint. Recomenda-se incorporar regressões para os cenários de perda de dados acima.
- **Documentação desatualizada:** há exemplos de versões anteriores, afirmação de ausência de ambiente Windows e descrição de rodízio da TV diferente dos intervalos atuais de dois minutos e 40 segundos.

## Limites da verificação

- Não foi gerado nem instalado um novo instalador; foi inspecionado o pacote existente.
- Não foram usados dois computadores, clientes reais de sincronização, segundo monitor ou dados da operação.
- Importação de PDFs/XLSX e cálculos financeiros/Jornada/HE não foram homologados com documentos representativos e resultados esperados.
- A consulta de avisos de vulnerabilidade das dependências não foi concluída: a revisão automática de aprovação bloqueou a tentativa, informando apenas “blocked by policy”. Nenhuma conclusão sobre ausência de vulnerabilidades é feita.
- Não foi realizada uma auditoria exaustiva de segurança.

## Ordem de correção sugerida

1. Resolver conjuntamente versionamento, mesclagem, exclusões, resposta de salvamento e eventos entre janelas.
2. Bloquear sobrescrita em caso de erro de leitura e informar falhas de gravação.
3. Preservar versões descartadas e adicionar testes de regressão.
4. Corrigir recurso da bandeja e validação do atualizador.
5. Homologar importadores, cálculos e sincronização em duas máquinas, depois gerar e testar o instalador.
