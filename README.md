# GO Enterprise — app desktop (Windows)

App desktop do GO Enterprise para a Selbetti (Correios MG), empacotado com Electron. Reaproveita
100% da ferramenta que já existia (`GO_Enterprise_V8.html`) como a "tela" do programa — o que muda é
que agora ele roda como um `.exe` instalado no Windows, com uma pasta compartilhada sincronizando os
dados entre todos os computadores, uma janela de TV independente e verificação de atualização.

## O que foi construído

- **`main.js`** — processo principal do Electron: cria a janela principal, a janela da TV (independente),
  o ícone da bandeja, o menu, e liga tudo à pasta compartilhada e ao verificador de atualização.
- **`preload.js`** — ponte seguraentre a tela (`renderer/app.html`) e o sistema de arquivos, expondo
  `window.goDesktop` só com as funções necessárias (sem dar acesso livre ao Node para o HTML).
- **`renderer/app.html`** — o mesmo GO Enterprise de sempre (todas as telas, cálculos, PDF de manuais
  etc.), só que agora com um pedaço de código a mais que detecta se está rodando dentro do app desktop
  (`window.goDesktop`) e, quando está, usa a pasta compartilhada em vez do IndexedDB do navegador.
- **`src/dataStore.js`** — lê/escreve o banco de dados num arquivo JSON dentro da pasta compartilhada,
  observa mudanças feitas por outros computadores e faz uma mesclagem automática por registro quando
  necessário (ver seção "Como funciona a sincronização" abaixo).
- **`src/settingsStore.js`** — configurações locais de cada computador (qual é a pasta compartilhada
  escolhida, preferências da janela de TV etc.), guardadas fora da pasta compartilhada.
- **`src/updater.js`** — verifica se há uma versão nova publicada na pasta compartilhada e permite
  instalar sem precisar ir de máquina em máquina.

## Como configurar (depois de instalado em cada PC)

1. Abra o GO Enterprise normalmente.
2. Vá em **Administração** → **🖥️ Sincronização entre computadores**.
3. Clique em **Escolher pasta compartilhada** e selecione uma pasta dentro do OneDrive, Google Drive
   ou Dropbox já configurado nesse computador (ex: `OneDrive\GO Enterprise Compartilhado`).
4. Repita esse passo 3 em **todos os outros computadores**, sempre apontando para a **mesma pasta**
   (ou seja, cada PC precisa ter o mesmo OneDrive/Drive/Dropbox sincronizando essa pasta).
5. Pronto — a partir daí, qualquer alteração feita em um PC aparece nos outros assim que o cliente de
   nuvem sincronizar (normalmente segundos a poucos minutos, dependendo da internet de cada lugar).

Dentro da pasta compartilhada, o app cria sozinho:
```
GO Enterprise Compartilhado/
  dados/
    gestao_operacional.json     ← o banco de dados de verdade, compartilhado entre todos os PCs
  atualizacoes/
    version.json                ← manifesto da versão mais recente (você quem publica, ver abaixo)
    GO-Enterprise-Setup-X.Y.Z.exe
```

## Como funciona a sincronização (e suas limitações)

Isto **não é um banco de dados multiusuário em tempo real** — é um arquivo JSON dentro de uma pasta
sincronizada por nuvem. Funciona muito bem para o uso normal (um gestor lançando dados, operadores
importando a própria folha de ponto, etc.), mas tem um limite importante:

- Antes de cada salvamento, o programa relê o arquivo da pasta compartilhada. Se detectar que outro
  computador salvou algo nesse meio tempo, ele **mescla registro por registro** (por id) em vez de
  sobrescrever tudo — então editar um colaborador em um PC e lançar produção em outro, quase ao mesmo
  tempo, funciona sem perda de dados.
- Quando o **mesmo registro** é alterado de forma diferente em dois PCs muito perto um do outro, o
  programa mantém a edição mais recente e guarda a versão descartada em `db.syncConflicts` (visível
  nos dados, não é apagada) — mas o ideal é evitar editar o mesmo cadastro em duas máquinas ao mesmo
  tempo.
- A sincronização depende do cliente de nuvem (OneDrive etc.) estar rodando e com internet — sem
  internet, cada PC continua funcionando normalmente com a última cópia que tinha, e sincroniza assim
  que a conexão voltar.

## Tela de TV independente

Em **Administração → 📺 Tela de TV independente** (ou pelo menu do app / ícone na bandeja), o botão
"Abrir Dashboard TV" abre uma **janela separada** com o painel giratório já existente (produção, SLA,
ranking, ritmo + aniversariantes, com o visual espacial). Essa janela:

- roda em processo/janela independente da janela principal — fechar ou minimizar a janela principal
  **não** fecha a TV;
- se detectar um segundo monitor (a própria TV ligada como tela extra), abre direto em tela cheia nele;
- se só houver uma tela, abre como janela normal — é só arrastar pra TV e usar F11/tela cheia do Windows;
- continua funcionando em segundo plano: o app fica disponível no ícone da bandeja do Windows mesmo se
  a janela principal for fechada, então quem usa esse computador para outras coisas pode fechar a janela
  do GO Enterprise sem derrubar a TV.

## Atualização de versão

Sem precisar de servidor próprio — usa a mesma pasta compartilhada:

1. Quando quiser publicar uma versão nova, gere o instalador (ver "Como gerar o instalador" abaixo).
2. Copie o `.exe` gerado para `<pasta compartilhada>/atualizacoes/`.
3. Crie/atualize o arquivo `<pasta compartilhada>/atualizacoes/version.json`:
   ```json
   {
     "version": "8.2.0",
     "installer": "GO-Enterprise-Setup-8.2.0.exe",
     "notes": "Resumo curto do que mudou nesta versão.",
     "publishedAt": "2026-08-10T12:00:00.000Z"
   }
   ```
4. Todos os computadores instalados verificam essa pasta sozinhos (a cada 1 hora, por padrão) e também
   ao abrir o programa. Quando encontram uma versão mais nova, mostram um aviso com botão "Atualizar
   agora" — ao clicar, o instalador é copiado para uma pasta temporária local, executado, e o app fecha
   para a instalação prosseguir.
5. É possível forçar a checagem a qualquer momento em Administração → Atualizações → "Verificar
   atualizações agora", ou pelo menu do app.

## Como gerar o instalador (.exe) — IMPORTANTE

Este ambiente onde o código foi escrito **não tem acesso de internet liberado** para baixar o binário
do Electron nem para compilar o instalador do Windows — então o build final (`npm run dist`) precisa
ser feito em um computador com internet normal, de preferência **Windows** (ou Linux/Mac com Wine
configurado, mas Windows é o caminho mais simples e confiável para gerar um instalador Windows).

Passo a passo:

```bash
# 1. entre na pasta do projeto
cd GO_Enterprise_Desktop

# 2. instale as dependências (electron, electron-builder, chokidar)
npm install

# 3. rode em modo desenvolvimento pra testar antes de empacotar
npm start

# 4. gere o instalador Windows (.exe) — vai aparecer em dist/
npm run dist
```

O instalador final fica em `dist/GO-Enterprise-Setup-8.1.0.exe` (o número da versão vem do
`"version"` em `package.json` — mude ali antes de cada release).

### Ícone do programa

Já incluí um ícone provisório em `build/icon.ico` (gerado automaticamente, simples). Se quiser usar a
logo oficial da Selbetti, troque esse arquivo por um `.ico` de verdade (pode gerar em qualquer
conversor de PNG→ICO com múltiplos tamanhos: 16, 32, 48, 256px) mantendo o mesmo nome/caminho.

### Assinatura de código (recomendado, opcional)

Sem assinatura digital, o Windows SmartScreen vai avisar "Editor desconhecido" na primeira execução em
cada PC — o usuário só precisa clicar em "Mais informações → Executar assim mesmo". Isso é normal para
ferramentas internas. Se quiser eliminar esse aviso, é preciso comprar um certificado de assinatura de
código (Code Signing Certificate) de uma autoridade certificadora e configurar em
`build.win.certificateFile`/`certificatePassword` no `package.json` antes de gerar o instalador — isso
tem um custo recorrente e não foi configurado aqui.

## O que ainda precisa ser validado num Windows real

Tudo que está neste projeto foi escrito e testado o quanto deu neste ambiente (sintaxe, lógica de
mesclagem de dados isolada, checagem de versão), mas por não ter Windows nem Electron rodando de
verdade aqui, os itens abaixo precisam de um teste real antes de distribuir pros computadores da
operação:

- Instalar em 2+ PCs de teste e confirmar que a sincronização via OneDrive/Drive/Dropbox realmente
  propaga as mudanças entre eles (a lógica está pronta, mas o comportamento real de sincronização de
  cada provedor de nuvem pode ter particularidades, ex.: conflitos de nome de arquivo do próprio
  OneDrive se dois PCs escreverem ao mesmo tempo antes do merge interno rodar).
- Testar a janela de TV com uma TV/segundo monitor de verdade ligada (detecção de monitor secundário,
  tela cheia automática).
- Testar o fluxo completo de publicar uma versão nova e atualizar um PC a partir dela.
- Definir se vale a pena investir em assinatura de código antes de distribuir pra todos os PCs.

## Estrutura de pastas

```
GO_Enterprise_Desktop/
  package.json          ← config do app + do electron-builder (empacotamento Windows)
  main.js                ← processo principal (janelas, menu, bandeja, IPC)
  preload.js              ← ponte segura renderer ↔ sistema de arquivos
  src/
    dataStore.js           ← leitura/escrita/observação/mesclagem do banco na pasta compartilhada
    settingsStore.js        ← configurações locais deste PC
    updater.js               ← checagem e instalação de novas versões
  renderer/
    app.html                 ← o GO Enterprise (interface completa), adaptado pra rodar no desktop
  build/
    icon.ico, icon.png, tray.png   ← ícones do instalador/bandeja (provisórios)
```
