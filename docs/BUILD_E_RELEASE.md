# Build e release

Procedimento revisado em 13/11/2026. Release atual: **8.14.0**. Veja [notas e hashes](RELEASE_8.14.0.md). Os exemplos anteriores documentam publicações passadas; ajuste a versão em cada execução.

## Preparação

O fluxo padrão usa Windows, Node.js e npm. Downloads do Electron e das ferramentas de empacotamento exigem internet quando não estão no cache. Verifique espaço livre no disco e na pasta temporária.

1. Confira `git status` e `git fetch origin`. Incorpore alterações remotas sem descartar trabalho local. Na release 8.10.0, havia quatro commits da 8.9.1 a incorporar.
2. Confira a versão publicada em `<pasta compartilhada>/atualizacoes/version.json`; a próxima versão deve ser superior.
3. Confira a presença de `renderer/master-secret.js`, usado no primeiro acesso. Não imprima seu conteúdo, não o inclua no Git e não registre o segredo na documentação. A lista explícita de arquivos do build o inclui no instalador mesmo sendo gitignored.
4. Execute `npm ci` quando precisar instalar as dependências do lockfile e `npm test` para as regressões de Jornada/HE. Não é necessário reinstalar dependências a cada build se já estão corretas.

## Teste e versionamento

```powershell
npm test
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

A variável `ELECTRON_RUN_AS_NODE=1` faz o Electron funcionar como Node, sem abrir a interface. Ela deve estar ausente ao testar o aplicativo normalmente.

Valide os fluxos alterados. Os testes automatizados atuais usam dados sintéticos e não homologam PDFs reais, instalação interativa ou sincronização entre máquinas.

Atualize a versão em `package.json` e nas duas ocorrências de versão do projeto em `package-lock.json`. Registre as funcionalidades e a release em commits descritivos, preferencialmente separados. Atualize as notas de release e o índice da documentação.

## Gerar e conferir o instalador

```powershell
npm run dist -- --publish never
Get-FileHash -LiteralPath 'dist\GO-Enterprise-Setup-8.10.0.exe' -Algorithm SHA256
```

Ajuste o nome conforme a versão. Saídas esperadas: instalador NSIS x64, `.exe.blockmap` e aplicação em `dist/win-unpacked`.

Antes de publicar:

- Confira a versão do `package.json` dentro de `resources/app.asar` e a correspondência do código empacotado com o código testado.
- Confira `build/tray.png`: desde a 8.10.0, consta explicitamente em `build.files`, pois `main.js` usa esse caminho para criar a bandeja.
- Confira a presença do arquivo de bootstrap sem expor seu conteúdo.
- Confira que o `app.asar` extraído do instalador corresponde ao pacote validado e teste os fluxos sobre esse conteúdo.
- Homologue a instalação interativa em uma máquina de teste quando disponível. Na 8.10.0, foram validados o conteúdo extraído e a execução em Electron; não foi homologada a instalação interativa.

## Publicar no GitHub e na pasta compartilhada

A publicação deve fazer parte do escopo autorizado pelo responsável. Uma instrução explícita para publicar já fornece essa autorização; não é necessário pedi-la novamente.

1. Faça o commit, execute `git push origin main` e compare `git rev-parse HEAD` com `git ls-remote origin refs/heads/main`. Se o Git Credential Manager solicitar login, conclua a autenticação e confirme o resultado do push.
2. Localize o destino em `%APPDATA%\GO Enterprise\settings.json`, campos `sharedFolder` e `updatesSubfolder`. Na publicação 8.10.0, era `Z:\atualizacoes`; não presuma a mesma letra em outras máquinas.
3. Copie o instalador e o `.blockmap` com nomes temporários. Compare o SHA-256 de cada arquivo local e remoto antes de renomeá-los para o nome final. Não sobrescreva um artefato de mesmo nome com conteúdo diferente.
4. Faça backup do manifesto atual e confirme que sua versão não mudou durante a operação.
5. Grave um novo manifesto UTF-8 sem BOM em arquivo temporário e substitua `version.json` **por último**, depois de verificar os arquivos referenciados. Exemplo da publicação 8.10.0:

```json
{
  "version": "8.10.0",
  "installer": "GO-Enterprise-Setup-8.10.0.exe",
  "notes": "Melhorias de Jornada/HE e gráfico interativo de evolução.",
  "publishedAt": "2026-10-20T18:40:07.2997827Z"
}
```

Use a data UTC real de cada nova publicação. Preserve a versão anterior para recuperação e registre os hashes nas notas da release.

O aplicativo consulta o manifesto ao iniciar e a cada hora por padrão. A oferta depende de uma versão superior e da existência do instalador. O atualizador não valida assinatura/hash nem implementa downgrade automático; publicar um número inferior não faz máquinas mais novas voltarem de versão.

## Alternativa usada na máquina de publicação da 8.10.0

Node/npm não estavam no PATH dessa sessão; as dependências já estavam instaladas. Foi usado o Node 20.16.0 embarcado no Electron 30.5.1:

```powershell
$env:ELECTRON_RUN_AS_NODE='1'
Start-Process -FilePath '.\node_modules\electron\dist\electron.exe' -ArgumentList '--test tests/jornada-he.cjs' -Wait -WindowStyle Hidden
```

Para o build, utilizou-se um script temporário com a API do electron-builder, executado na raiz do repositório pelo mesmo binário. A CLI sob Electron interpretou os argumentos incorretamente; a API evitou esse problema:

```js
process.noAsar = true;
const path = require('path');
const builder = require(path.join(process.cwd(), 'node_modules/electron-builder'));
builder.build({targets: builder.Platform.WINDOWS.createTarget(), publish: 'never'})
  .then(files => console.log(files))
  .catch(error => { console.error(error); process.exitCode = 1; });
```

`process.noAsar = true` evita que a interceptação de arquivos ASAR do Electron atrapalhe a criação do pacote. Capture saída, erros e código de saída do processo. Remova `ELECTRON_RUN_AS_NODE` antes de voltar a executar a interface.

## Problemas de ambiente já observados

- **Links simbólicos em winCodeSign:** a extração do pacote 2.6.0 falhou por falta de privilégio ao criar links de bibliotecas macOS. Na 8.10.0, o arquivo baixado pelo builder foi extraído no cache `winCodeSign/winCodeSign-2.6.0`, excluindo a pasta `darwin`, preservando as ferramentas Windows. Não foi necessário alterar permissões do sistema nem desativar a edição do executável. Esse cache parcial serve ao build Windows, não a builds macOS.
- **Disco cheio na 8.9.1:** o NSIS falhou com `error creating mmap`. Usar `TEMP`/`TMP` em volume com espaço resolveu naquele ambiente. Na 8.10.0, havia espaço disponível no C:.
- **Assinatura digital:** não configurada nesta release. O Windows pode exibir aviso de editor desconhecido. A conferência SHA-256 da cópia não equivale a uma assinatura digital do instalador.

Notas e hash da publicação: [RELEASE_8.10.0.md](RELEASE_8.10.0.md).
