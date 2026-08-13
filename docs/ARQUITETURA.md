# Arquitetura

## Visão geral dos processos

O GO Enterprise é um app Electron clássico de dois processos:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Processo principal (Node.js) — main.js                                  │
│                                                                           │
│  • Cria a janela principal (mainWindow) e, sob demanda, a janela da TV  │
│    (tvWindow) — independente, pode ficar aberta mesmo com a principal   │
│    fechada (o app some pra bandeja em vez de encerrar, se a TV segue    │
│    aberta — ver app.on('close') em main.js)                             │
│  • Lê/escreve o banco de dados via src/dataStore.js                     │
│  • Observa mudanças externas no arquivo compartilhado (chokidar)        │
│  • Checa atualizações via src/updater.js                                │
│  • Expõe tudo isso ao renderer só através de IPC (ipcMain.handle)       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │ IPC (contextBridge, ver preload.js)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Processo renderer (Chromium) — renderer/app.html                        │
│                                                                           │
│  • Toda a UI, lógica de negócio e cálculos rodam aqui, em JS puro       │
│  • contextIsolation:true, nodeIntegration:false — o HTML NUNCA tem      │
│    acesso direto a fs/Node; só o que preload.js expõe em                │
│    window.goDesktop                                                     │
│  • Mesmo arquivo app.html carrega tanto na janela principal quanto na   │
│    janela da TV (`loadFile(RENDERER_PATH, {hash:'dashboard'})`) — o     │
│    hash #dashboard ativa o "modo kiosk" dentro do próprio JS            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Por que um único arquivo HTML gigante?

`renderer/app.html` nasceu como uma ferramenta 100% client-side (`GO_Enterprise_V8.html`, citada no
README) que rodava direto no navegador, com tudo em IndexedDB local. O empacotamento Electron foi
adicionado por cima **sem reescrever a UI** — o mesmo arquivo detecta em tempo de execução se está
dentro do app desktop (`window.goDesktop` existe) e, se estiver, troca a fonte de verdade dos dados
de IndexedDB para a pasta compartilhada, sem tocar no resto do código. Isso significa:

- Não há bundler, não há `npm run build` do renderer — o que está em `renderer/app.html` é
  exatamente o que roda.
- O arquivo também funciona sozinho, aberto direto num navegador (sem o app desktop) — útil pra
  testar rapidinho uma mudança sem precisar do Electron rodando. Nesse modo ele usa só IndexedDB e o
  mecanismo legado de arquivo `.godb` (File System Access API), que fica escondido
  (`.browser-only{display:none}`) quando roda dentro do app desktop.
- Isso também significa que **não existe divisão em componentes/módulos** dentro do app.html — é um
  único `<script>` com ~3.700 linhas de JS. A organização interna é por comentários de seção
  numerados (`===================== N. NOME =====================`), não por arquivos.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `main.js` | Processo principal: janelas, menu, bandeja do sistema, IPC, agenda checagem de update |
| `preload.js` | `contextBridge.exposeInMainWorld('goDesktop', {...})` — única porta de entrada do renderer pro mundo Node/Electron |
| `src/dataStore.js` | Lê/escreve o JSON de dados na pasta compartilhada; mescla por registro quando dois PCs salvam quase ao mesmo tempo; observa mudanças externas via `chokidar` |
| `src/settingsStore.js` | Configurações **locais deste PC** (qual é a pasta compartilhada, preferências da janela de TV) — arquivo separado, fora da pasta compartilhada, em `app.getPath('userData')/settings.json` |
| `src/updater.js` | Compara versão local (`package.json`) com `atualizacoes/version.json` na pasta compartilhada; copia o instalador pra uma pasta temporária e abre |
| `renderer/app.html` | A aplicação inteira — ver seção abaixo |
| `renderer/master-secret.js` | Segredo local (senha mestre), gitignored — ver [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md) |

## Seções internas de `renderer/app.html`

O JS principal (dentro da única tag `<script>`, perto do fim do arquivo) é dividido por comentários
numerados. Para navegar, faça uma busca por `===================== ` no arquivo:

| # | Seção | Conteúdo |
|---|---|---|
| 1 | UTILITÁRIOS | `$()`, `val()`, `numVal()`, formatação de número/moeda/data, `fmtBRL`, `fmtNum`, cálculo de dias úteis |
| 2 | CRIPTOGRAFIA (WebCrypto) | Hash SHA-256, criptografia opcional do arquivo `.godb` com PIN |
| 3 | MODELO DE DADOS | Objeto `db` (estado global em memória), `normalizeDb()`, seed dos manuais de equipamento |
| 4 | PERSISTÊNCIA | `save()`, IndexedDB local, mecanismo legado `.godb` (File System Access API), backup/restore |
| 5 | SEGURANÇA / PIN | Tela de acesso, PIN do gestor, matrícula do operador, PIN da TV, senha mestre |
| 6 | MODAIS / CRUD | Todos os `prepareXModal()`/`addX()`/`saveX()`/`deleteX()` de cada cadastro |
| 7 | IMPORTAÇÃO XLSX | Leitor de `.xlsx` **sem nenhuma lib externa** (descompacta o zip, faz parse do XML manualmente) — ver `unzipXlsx`, `parseSheet`, `readFirstSheet`, `findCol` |
| 7B | FOLHA DE PONTO (PDF) | Parser de PDF do cartão de ponto, sem lib externa — extrai texto do PDF na unha e interpreta o layout do relatório |
| 8 | CÁLCULOS DE NEGÓCIO | `financeTotals()`, alertas de férias, absenteísmo, valor a receber estimado |
| 9 | RENDER | Uma função `renderX()` por tela/widget — é aqui que a maior parte da lógica de UI vive |
| 10 | RELATÓRIOS EM PDF | Exportação por impressão do navegador (`window.print()`), sem lib de PDF |
| 10B | MANUAIS DE EQUIPAMENTOS | CRUD dos manuais ilustrados (passo a passo com fotos) |
| 10C | INTEGRAÇÃO COM O APP DESKTOP | Toda a ponte com `window.goDesktop` — é o "adaptador" que faz o mesmo HTML funcionar dentro do Electron |
| 11 | INICIALIZAÇÃO | `boot()` — decide se mostra a trava de pasta compartilhada, a tela de PIN, ou entra direto (modo TV) |

A seção **9. RENDER** é a mais importante para entender "o que desenha cada tela" — a lista completa
de funções `renderX()` está em [TELAS_E_FUNCIONALIDADES.md](TELAS_E_FUNCIONALIDADES.md).

## Fluxo de dados (visão de altura)

```
Usuário edita algo na UI
        │
        ▼
função addX()/saveX() (seção 6) — valida, empurra/atualiza no objeto `db` em memória
        │
        ▼
save() (seção 4)
        │
        ├─► IndexedDB local (sempre, cache rápido pra reabrir o app sem esperar a rede)
        │
        └─► window.goDesktop.writeData(db)  [só dentro do app desktop, se há pasta configurada]
                    │  (IPC → main.js → dataStore.writeData)
                    ▼
            relê o arquivo em disco, mescla por registro se alguém mais salvou
            nesse meio tempo, grava atômico (arquivo temporário + rename)
                    │
                    ▼
        cliente de nuvem (OneDrive/Drive/Dropbox) sincroniza o arquivo pros outros PCs
                    │
                    ▼
        chokidar detecta a mudança em cada outro PC → main.js manda
        'data:changedExternally' pro renderer → app.html troca `db` e re-renderiza
```

Ver [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md) para os detalhes da mesclagem
e das limitações desse modelo (não é um banco multiusuário em tempo real).

## Canais IPC (main.js ↔ preload.js ↔ app.html)

Toda comunicação passa por `ipcMain.handle`/`ipcRenderer.invoke` (request/response) ou
`ipcRenderer.on` (eventos do main pro renderer). Lista completa (ver `main.js` e `preload.js`):

| Canal | Direção | Para quê |
|---|---|---|
| `app:getVersion` | invoke | Versão instalada (mostrada em Administração) |
| `settings:get` / `settings:set` | invoke | Ler/gravar `settings.json` local |
| `settings:chooseSharedFolder` | invoke | Abre diálogo nativo de pasta |
| `settings:openSharedFolder` | invoke | Abre a pasta no Explorer |
| `settings:getDisplays` | invoke | Lista monitores (pra escolher onde a TV abre) |
| `data:read` / `data:write` | invoke | Ler/gravar o JSON de dados na pasta compartilhada |
| `tv:open` / `tv:close` / `tv:isSelf` | invoke | Controla a janela independente da TV |
| `update:check` / `update:install` | invoke | Checagem/instalação manual de atualização |
| `data:changedExternally` | evento (main→renderer) | Avisa que outro PC salvou algo |
| `update:available` | evento (main→renderer) | Avisa que há uma versão nova publicada |

## Janela da TV — pontos de atenção

`createTvWindow()` em `main.js` cria uma `BrowserWindow` **sem moldura desde a construção**
(`frame: !autoFullscreen`), não apenas via `setKiosk(true)` em tempo de execução — essa foi uma
correção importante (ver [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md)) porque em TVs reais
`setKiosk(true)` sozinho às vezes falhava silenciosamente, deixando a barra de menu visível e
encolhendo a área útil, o que empurrava o conteúdo por trás do cabeçalho/rodapé fixos do dashboard.
