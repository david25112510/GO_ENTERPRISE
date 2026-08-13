# Sincronização e persistência

Não existe servidor nem banco relacional. O GO Enterprise usa **três camadas de persistência**,
dependendo de onde e como está rodando — é importante saber qual está ativa para debugar qualquer
"meus dados sumiram"/"não sincronizou".

## As três camadas

| Camada | Quando é usada | Onde mora | Alcance |
|---|---|---|---|
| **IndexedDB local** | Sempre, em qualquer modo | Dentro do perfil do Chromium/Electron deste PC | Só este PC — cache/fallback |
| **Pasta compartilhada** (JSON) | Só dentro do app desktop, com pasta configurada | `<pasta compartilhada>/dados/gestao_operacional.json`, sincronizada por OneDrive/Google Drive/Dropbox | Todos os PCs apontando pra mesma pasta — **fonte de verdade** |
| **Arquivo `.godb`** (legado) | Só fora do app desktop, direto num navegador | Onde o usuário escolher (File System Access API) | Só quem abriu aquele arquivo específico |

Dentro do app desktop, o mecanismo `.godb` fica **escondido da UI** (`.browser-only{display:none}`,
aplicado por `initDesktopIntegration()`) e o `boot()` explicitamente evita recarregar um handle antigo
de `.godb` quando `window.goDesktop` existe — ver o gotcha correspondente em
[HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md).

## Fluxo de gravação (`save()`, app.html seção 4)

```
save()
  ├─ pushHistorySnapshot()           (a menos que skipHistory=true)
  ├─ persistPayload()                monta o envelope (criptografado ou não, ver SEGURANCA_E_ACESSO.md)
  ├─ idbSet(DBKEY, payload)          sempre — cache local rápido pro próximo boot
  └─ se window.goDesktop && pasta configurada:
        window.goDesktop.writeData(db)     ← nota: manda o `db` puro, NÃO o `payload` criptografado
              │  IPC → main.js → dataStore.writeData(db)
              ▼
        (ver "Mesclagem" abaixo)
```

## `src/dataStore.js` — leitura, escrita atômica e mesclagem

Roda no **processo principal** (main.js), não no renderer. Responsabilidades:

1. **`writeData(incomingDb)`**: antes de gravar, relê o arquivo em disco (`readEnvelope()`). Se detectar
   que o `savedAt` do disco é diferente do último que esta instância leu (`baseSavedAt`) — ou seja,
   outro PC salvou algo nesse meio tempo — chama `mergeDb(diskDb, incomingDb)` em vez de sobrescrever
   tudo. Depois grava **atomicamente**: escreve num arquivo temporário (`<arquivo>.tmp-<pid>`) e faz
   `rename()` por cima do arquivo final, pra nunca deixar um JSON pela metade se o processo cair no
   meio da escrita.

2. **`mergeDb()`** — a lógica de mesclagem:
   - **Coleções-array com `id`** (`ARRAY_COLLECTIONS`: `production, finance, expenses, losses,
     employees, absences, vacations, suppliers, imports, history, activities, timesheets, manuals,
     news, alerts, dailyMessages`) → mescla **registro por registro**, casando por `id`. Registro que
     só existe num lado entra igual; registro com o mesmo `id` mas conteúdo diferente nos dois lados
     é resolvido por `updatedAt` (o mais recente vence) quando ambos os lados têm esse campo — senão,
     a versão que está sendo salva agora (`incoming`) vence, e a versão descartada do disco é
     preservada em `db.syncConflicts` (não é apagada).
   - **Coleções-mapa** (`MAP_COLLECTIONS`: só `sla`) → mesma ideia, mesclando por chave.
   - **`config`** → mesclagem rasa (`{...diskDb.config, ...incomingDb.config}`), campo por campo — o
     que está sendo salvo agora prevalece por campo individual, sem comparação de timestamp.

3. **`watch(onExternalChange)`** — usa `chokidar` pra observar o arquivo. Quando detecta uma mudança
   que **não** veio de uma escrita própria recente (janela de 3s desde o último `writeData` local),
   chama o callback com `external=true`, que `main.js` repassa por IPC (`data:changedExternally`) pra
   janela principal e pra janela da TV, ambas trocando `db` e re-renderizando
   (`showDesktopToast('Dados atualizados por outro computador (...)')`).

### O que isso significa na prática

- **Não é um banco multiusuário em tempo real.** Duas pessoas editando o **mesmo registro** em dois
  PCs quase ao mesmo tempo (antes da nuvem sincronizar o arquivo) fazem uma delas "vencer" — a outra
  edição não é perdida de verdade (vai pra `db.syncConflicts`, visível em Administração), mas não é
  aplicada automaticamente. Evitar editar o mesmo cadastro em duas máquinas ao mesmo tempo continua
  sendo a orientação pro usuário.
- Editar **registros diferentes** em PCs diferentes ao mesmo tempo funciona bem (é exatamente o caso
  que a mesclagem por `id` resolve).
- A sincronização depende inteiramente do cliente de nuvem (OneDrive etc.) estar rodando com internet.
  Sem internet, cada PC continua funcionando com a última cópia que tinha (IndexedDB local) e
  sincroniza quando a conexão voltar.

## `src/settingsStore.js` — configurações locais (NÃO sincronizadas)

Cada PC guarda suas próprias preferências fora da pasta compartilhada, em
`app.getPath('userData')/settings.json` (ex.: `%APPDATA%\GO Enterprise\settings.json`): qual é a
pasta compartilhada escolhida, em qual monitor a TV deve abrir, preferências de checagem de
atualização. Isso é proposital — a pasta compartilhada em si é "onde apontar", não um dado de negócio.

## Papel do `chokidar`

`dataStore.watch()` usa `awaitWriteFinish` (estabilidade de 800ms) pra não disparar o callback no
meio de uma escrita ainda em andamento pelo cliente de nuvem — evita ler um JSON truncado no meio de
uma sincronização.
