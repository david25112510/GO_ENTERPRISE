# Build e release

## Ambiente necessário

Windows com internet normal (o build baixa o binário do Electron e compila o instalador NSIS — não
funciona num ambiente sandboxed sem rede). Node.js + npm.

**Windows Developer Mode precisa estar ativado** para o `electron-builder` conseguir criar symlinks
durante o empacotamento (`winCodeSign`) — sem isso, `npm run dist` falha. Ativa em
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock` →
`AllowDevelopmentWithoutDevLicense = 1` (ou pela tela Configurações → Privacidade e segurança → Para
desenvolvedores), precisa de uma sessão elevada (admin) pra mexer no registro.

## Antes do primeiro build: `renderer/master-secret.js`

Este arquivo **não está no Git**. Sem ele, o app funciona normalmente, mas a senha mestre de
bootstrap fica inoperante (só quem já tem PIN configurado consegue entrar como gestor). Crie:

```js
// renderer/master-secret.js
const MASTER_SALT='...';
const MASTER_PASSWORD_HASH='...';  // SHA-256(MASTER_SALT + senha), ver docs/SEGURANCA_E_ACESSO.md
```

Gerar o hash (Node, sem depender do navegador):
```js
require('crypto').createHash('sha256').update(MASTER_SALT + senha, 'utf8').digest('hex')
```

## `ELECTRON_RUN_AS_NODE` — armadilha comum

Se essa variável de ambiente estiver setada (comum em alguns harnesses/CI), `npm start`/`electron .`
roda o Electron como Node puro em vez de abrir a janela do app. Sempre confirme que está limpa antes
de testar localmente:

```bash
unset ELECTRON_RUN_AS_NODE   # bash
# ou, PowerShell:
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

## Passo a passo de uma release

1. **Editar o código** em `renderer/app.html` (ou `main.js`/`src/*.js`).
2. **Testar localmente**: `npm start` (com `ELECTRON_RUN_AS_NODE` limpa). Verificação rápida sem abrir
   a janela: checar sintaxe do JS inline com `node -e "new Function(fs.readFileSync(...))"` — pega
   erro de sintaxe sem precisar do Electron rodando.
3. **Commitar** a mudança (mensagens de commit deste projeto seguem descrever o "porquê", em
   português, sem período final no título).
4. **Bump de versão** em `package.json` (`"version"`) — semver simples, incrementando o patch pra
   cada correção pequena. O número aparece no instalador (`GO-Enterprise-Setup-<versão>.exe`) e é o
   que `updater.js` compara.
5. **Commitar o bump** separadamente do código (padrão deste projeto: um commit "Bump versao para
   X.Y.Z" isolado).
6. **Gerar o instalador**: `npm run dist` → aparece em `dist/GO-Enterprise-Setup-<versão>.exe`.
7. **Instalar localmente e testar** antes de publicar (`Start-Process` no `.exe`, ou rodar o
   instalador manualmente).
8. **Publicar** (só depois de confirmação — este projeto tem o hábito de só copiar pra pasta
   compartilhada depois que o David confirma que testou local):
   - Copiar o `.exe` gerado para `<pasta compartilhada>/atualizacoes/`.
   - Criar/atualizar `<pasta compartilhada>/atualizacoes/version.json`:
     ```json
     {
       "version": "8.3.10",
       "installer": "GO-Enterprise-Setup-8.3.10.exe",
       "notes": "Resumo curto do que mudou nesta versão.",
       "publishedAt": "2026-08-12T12:00:00.000Z"
     }
     ```
   - Todo PC instalado detecta sozinho (checagem automática a cada 1h, por padrão — configurável em
     `settingsStore.DEFAULTS.updateCheckIntervalMinutes` — e também ao abrir o programa) e mostra um
     banner "Atualizar agora" (ver `renderDesktopUpdateBanner()` em app.html e `updater.js`).

## Como a comparação de versão funciona

`updater.compareVersions(a, b)` compara `major.minor.patch` numericamente (não é comparação de
string) — `8.3.9` < `8.3.10` corretamente. `checkForUpdate()` só considera a atualização "disponível"
se a versão do manifesto for maior **E** o arquivo `.exe` referenciado existir de fato na pasta (evita
oferecer update no meio de uma sincronização de nuvem incompleta).

## Assinatura de código

Não configurada (custo recorrente de certificado). Sem assinatura, o Windows SmartScreen avisa
"Editor desconhecido" na primeira execução — normal para ferramenta interna; usuário clica em "Mais
informações → Executar assim mesmo". Se algum dia for assinar, é em `build.win.certificateFile`/
`certificatePassword` no `package.json`.

## `package.json` → `build` (electron-builder)

`files` é uma lista **explícita** (`main.js`, `preload.js`, `src/**/*`, `renderer/**/*`,
`package.json`) — não depende do `.gitignore`. Isso é importante: `renderer/master-secret.js` está
gitignored mas **é empacotado normalmente no instalador**, porque o electron-builder empacota o que
está em disco, não o que está no Git.
