# Histórico de decisões e armadilhas conhecidas

Este documento registra **por que** o sistema é do jeito que é em pontos não óbvios — bugs reais que
já aconteceram, a causa raiz encontrada e a correção aplicada. O objetivo é evitar reintroduzir o
mesmo problema numa "limpeza de código" futura que pareça inofensiva mas remova a razão de algo
existir. Ordem cronológica (mais antigo primeiro).

## 1. Migração para desktop: `ELECTRON_RUN_AS_NODE` e ambiente sem admin

- `ELECTRON_RUN_AS_NODE=1` (setada pelo harness de desenvolvimento usado) faz `electron .` rodar como
  Node puro em vez de abrir a janela — sempre limpar essa variável antes de `npm start`/`npm run dist`.
- `electron-builder` falha ao empacotar (`winCodeSign`, criação de symlink) se o Windows Developer
  Mode não estiver ativo — precisa mexer no registro
  (`AllowDevelopmentWithoutDevLicense`) numa sessão elevada.

## 2. Repositório Git duplicado aninhado

Em algum momento existiu um `GO_ENTERPRISE\GO_ENTERPRISE` (repo dentro do repo). Foi removido; o
remoto do repo raiz foi apontado pro GitHub existente (que só tinha um commit placeholder trivial) e
recebeu um force-push consciente (autorizado explicitamente, com a ressalva "sobrescrever o remoto").
Se algo parecer duplicado/aninhado de novo, **investigar antes de apagar** — pode ser trabalho em
andamento, não sujeira.

## 3. Senha mestre embutida sem PIN configurado

**Sintoma original:** instalar em um PC novo abria a tela de gestor **sem pedir nada** quando ainda
não havia PIN configurado naquele banco — qualquer pessoa entrava como gestor.

**Correção:** senha mestre obrigatória nesse caso específico (ver
[SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md)) — só libera o *primeiro* acesso, e `setNewPin()`
fecha esse caminho permanentemente pra aquele banco assim que um PIN de verdade é definido.

## 4. Mecanismo `.godb` legado sobrescrevendo a pasta compartilhada

**Sintoma:** dados da pasta compartilhada eram silenciosamente sobrescritos por uma cópia local
antiga.

**Causa raiz:** `afterUnlock()` tentava recarregar um handle de arquivo `.godb` salvo de uma sessão
de navegador anterior, mesmo já rodando dentro do app desktop — essa cópia local antiga acabava
"vencendo" por cima dos dados recém-lidos da pasta compartilhada.

**Correção:** `afterUnlock()` **nunca** tenta recarregar um handle `.godb` quando `window.goDesktop`
existe — a pasta compartilhada é a única fonte de verdade dentro do app desktop, ponto final. O painel
`.godb` na UI também é escondido (`.browser-only`) nesse modo. Ver comentário explícito no código
(`app.html`, dentro de `afterUnlock()`) e [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md).

## 5. CSS `[data-role]` escondendo botão da TV do operador

**Sintoma:** mesmo depois de liberar `dashboardTv` pro operador em `NAV_VIEWS_BY_ROLE` (JS), o botão
continuava escondido.

**Causa raiz:** regras CSS antigas com `[data-role]`+`!important` competindo com a lógica nova baseada
em JS (`applyRoleUI()` alternando `.nav button[data-view].style.display`).

**Correção:** as regras CSS obsoletas foram **removidas por completo** — a visibilidade de navegação
é decidida **inteiramente em JS**, em um único lugar (`NAV_VIEWS_BY_ROLE`/`applyRoleUI()`). Se um botão
do menu não aparecer para um papel que deveria vê-lo, o primeiro lugar a checar é essa lista — não
deveria haver mais nenhuma regra CSS de `data-role` competindo.

## 6. Saga do overlap na TV (o bug mais longo desta jornada)

**Sintomas ao longo de várias rodadas**, na TV real de 50 polegadas (computador diferente do de
desenvolvimento, HDMI direto): logo/relógio sobrepondo o título "PRODUÇÃO"; dados desatualizados ao
voltar pro slide de Produção; frase do dia sobrepondo o gráfico/notícias; gráfico cortado; cards de
notícias cortados; data do cabeçalho cortada.

**Causa raiz de fundo (a que resolveu a maior parte):** `setKiosk(true)` chamado **em tempo de
execução** (depois da janela já criada) é pouco confiável em monitores/TVs reais — em alguns casos a
barra de menu nativa continuava visível silenciosamente, encolhendo a área útil da janela. Como o
CSS usava `justify-content:center` e alturas calculadas via `calc(100vh - Npx)` (assumindo a altura
cheia da tela), o conteúdo — mais alto que a área realmente disponível — era empurrado por trás do
cabeçalho/rodapé fixos.

**Correção definitiva, em duas partes:**
1. `main.js` → `createTvWindow()`: `frame: !autoFullscreen` **na criação da `BrowserWindow`**, não só
   `setKiosk(true)` depois. `setKiosk`/`setBounds` continuam sendo chamados no `ready-to-show` como
   reforço, mas a ausência de moldura já garantida na construção é o que realmente resolveu.
2. CSS da TV trocado de alturas fixas/`calc()` para **flexbox que o navegador calcula sozinho**:
   `.dash-slide.active{display:flex;flex-direction:column;flex:1;min-height:0}` e todo container de
   conteúdo dentro do slide (`.dash-chart-wrap`, `.dash-news-grid`, `.dash-sla-row`,
   `.dash-rank-grid`, `.dash-ritmo-row`, etc.) com `flex:1;min-height:0;overflow:hidden`. Isso
   funciona **independente da resolução real da tela** — não precisa mais adivinhar pixels.

**Lição:** qualquer ajuste futuro de layout da TV deve preferir flexbox/grid computado a valores fixos
em pixel, e **precisa ser validado com foto da TV real** antes de publicar — o monitor de
desenvolvimento não reproduz os bugs que só aparecem numa TV grande de verdade. O usuário já pediu
explicitamente para **não publicar** uma correção não verificada visualmente ("não suba!") — esse é o
padrão de trabalho esperado: testar localmente, esperar confirmação visual, só então copiar pra pasta
`atualizacoes/`.

Também nessa mesma leva: `refreshKioskData()` foi corrigido para reler a pasta compartilhada
**diretamente** (`window.goDesktop.readData()`) em vez do cache do IndexedDB — o cache local ficava
desatualizado e o slide de Produção voltava mostrando números antigos mesmo depois de uma atualização
já ter chegado por evento externo.

## 7. Campos numéricos não aceitavam vírgula

**Causa raiz:** `<input type="number">` HTML5 só aceita "." como separador decimal — em pt-BR, digitar
vírgula simplesmente não funciona (o campo trava/ignora), o que parecia um campo quebrado pros
usuários.

**Correção, aplicada em todos os campos numéricos do sistema:** trocar `type="number"` por
`type="text" inputmode="decimal"`, e ler o valor com `numVal(id)` (app.html, seção 1) em vez de
`+val(id)`:
```js
const numVal=id=>{const n=parseFloat(String(val(id)).trim().replace(',','.'));return isNaN(n)?0:n};
```
**Se um campo numérico novo for adicionado no futuro, seguir este padrão** — não usar
`type="number"` nem `+val(...)` diretamente.

## 8. Financeiro contando errado: registro financeiro como receita

**Sintoma:** lançar um "registro financeiro" (lembrete de cobrança) inflava a Receita mostrada em
Financeiro, e não entrava em Gastos — o oposto do que fazia sentido pro negócio.

**Causa raiz:** `financeTotals()` somava `db.finance` (registros financeiros) como receita (`inc`) e
só `db.expenses` como despesa (`exp`).

**Correção, em duas rodadas** (o usuário ajustou a intenção entre a primeira e a segunda):
1. Primeira tentativa: receita = faturamento produzido (produção × valor por impressão); gastos =
   `db.expenses` + `db.finance`.
2. **Ajuste final pedido pelo usuário:** registros financeiros são **só lembretes**, não devem contar
   como gasto de jeito nenhum. Estado atual: **Receita = faturamento produzido; Gastos = só
   `db.expenses`**, e `db.finance` não entra em nenhuma soma — só aparece listado (com alertas de
   vencimento).

Ver `financeTotals()` (app.html, seção 8) para a implementação atual — se voltar a mexer nisso,
confirmar com o usuário antes de assumir que `db.finance` deveria contar em algum total, porque essa
decisão já foi tomada e revertida uma vez.

## 9. Banco de horas: da folha de ponto (PDF) para planilha da equipe

**Pedido do usuário:** o banco de horas não deveria mais ser calculado a partir da folha de ponto
(PDF individual, importado por colaborador), e sim vir de uma planilha única com o saldo de toda a
equipe (positivo/negativo), enviada pela gestão.

**O que mudou:**
- Nova função `importHourBank()` (Visão Geral → "Importar planilha de banco de horas") — lê `.xlsx` e
  escreve direto em `employee.hourBank = {minutes, sign, asOf}`.
- `importTimesheet()` (a folha de ponto em PDF, no perfil do colaborador) **parou de escrever**
  `employee.hourBank` — continua preenchendo turno/horário/localização automaticamente e alimentando
  a sincronização de faltas e a estimativa de pagamento, só não mexe mais no banco de horas.
- O botão de importar folha de ponto foi **removido do Meu Painel do operador** — só a gestão importa
  a planilha da equipe agora; o operador só visualiza.

**Armadilha real encontrada ao testar com arquivos de verdade:** o export real do sistema de ponto
("Banco de horas do time") **não** tem o cabeçalho na primeira linha — vem um título e uma linha com a
data de geração (`"12 de ago. de 2026 14:57:54"`) antes do cabeçalho de verdade. E a coluna do saldo
final se chama **"Total Banco"**, não "Banco de Horas"/"Saldo" (que foi o que o importador assumiu na
primeira versão, sem nunca ter visto um arquivo real). Corrigido com:
- `findHeaderRow(rows)` — procura a linha que realmente contém "Nome"/"Matrícula" em vez de assumir
  que é `rows[0]`.
- `"Total Banco"` adicionado à lista de nomes de coluna aceitos em `findCol(...)`.
- `parsePtBrReportDate()` — extrai a data de geração do relatório (formato `"D de mmm. de AAAA"`) pra
  usar como `asOf` quando a planilha não tem uma coluna de data própria.

**Lição:** ao construir um importador de planilha "no escuro" (sem um arquivo real de exemplo em
mãos), tratar o primeiro teste com um arquivo real como obrigatório antes de considerar pronto — o
formato assumido a partir da descrição do usuário raramente bate 100% com a exportação real do
sistema de origem.

## 10. Senha mestre exposta no histórico do Git

**Contexto:** ao publicar o repositório como público pela primeira vez, `MASTER_SALT`/
`MASTER_PASSWORD_HASH` estavam hardcoded em `app.html` (commit `47258df` em diante).

**O que foi feito:**
1. Externalizado para `renderer/master-secret.js`, adicionado ao `.gitignore` — ver
   [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md).
2. **Isso sozinho não bastava**: o histórico do Git ainda contém o hash+salt antigos em commits
   anteriores — um repositório público expõe o histórico inteiro, não só o `HEAD` atual.
3. Decisão tomada (com o usuário, explicitamente): **não** reescrever o histórico (operação
   destrutiva, muda todos os hashes de commit, exigiria force-push) — em vez disso, **rotacionar a
   senha mestre** para um valor novo, nunca commitado. O hash antigo exposto no histórico vira
   inofensivo porque deixa de bater com o que o app realmente compara.
4. A senha mestre atual está só em `renderer/master-secret.js` local — não documentada aqui de
   propósito (este arquivo pode ser lido por qualquer sessão futura, inclusive com o repo público).

**Lição para qualquer segredo futuro:** nunca commitar, mesmo que "só por um tempo" — remover do
`HEAD` depois **não** remove do histórico, e um repositório que já foi público uma vez pode ter sido
clonado/indexado por qualquer um nesse meio tempo.

## 11. Alternância pública/privada do repositório

O David pede ocasionalmente para tornar `github.com/david25112510/GO_ENTERPRISE` público ou privado
(ex.: pra compartilhar algo pontualmente). Como o ambiente não tem GitHub CLI (`gh`) instalado, a
alternância é feita via chamada direta à API REST do GitHub (`PATCH /repos/{owner}/{repo}` com
`{"private": true|false}`), usando o token já armazenado pelo GitHub Desktop
(`git credential fill` contra `host=github.com` recupera um `gho_...` válido — é o mesmo usado pra
`git push`, não é um token novo sendo criado). Antes de tornar público um repositório **diferente**
do principal (ex.: um novo repo vazio criado pelo usuário), sempre conferir o conteúdo primeiro
(`GET /repos/{owner}/{repo}/contents/`) — nunca presumir que está vazio ou inofensivo.

## 12. Reformulação do Dashboard TV: de 5 slides rotativos pra tela única

**Pedido do usuário:** usar craft de design de verdade (skill `artifact-design`) pra reformular o
Dashboard TV — não só corrigir bugs, e sim repensar o design, "estilo Zabbix, com animações, numa só
tela". O rodízio de 5 slides (Produção/SLA/Ranking/Ritmo/Notícias) virou uma única tela sempre visível
(ver [TELAS_E_FUNCIONALIDADES.md](TELAS_E_FUNCIONALIDADES.md) pra estrutura atual).

**Fluxo de trabalho usado (vale repetir pra mudanças visuais grandes):** antes de mexer no
`app.html` de verdade, o design foi prototipado como um arquivo HTML autônomo local (não como
Artifact publicado — nesse ambiente específico, publicar Artifact retornava "page not found",
provavelmente por ser a extensão do VSCode e não "Claude Code on the web"; o fallback funcional foi
salvar o HTML na Área de Trabalho do usuário e abrir com `Start-Process`), com dados de exemplo
realistas, e só foi portado pro app depois de várias rodadas de aprovação do usuário sobre esse
protótipo. Esse ciclo (protótipo local → aprovação → porta pro app real) evitou repetir o erro da
tentativa de redesign de notícias mencionada no item 6 (mudar direto no app sem preview e quebrar na
TV real).

**Assets reaproveitados, não recriados:** o tema espacial (campo de estrelas, "planeta", mascote
astronauta) já existia no app antes dessa reformulação (`STARFIELD_B64`, `PLANET_B64`,
`DASH_MASCOTE_B64` — ver [ARQUITETURA.md](ARQUITETURA.md)). Pra montar o protótipo com fidelidade
visual sem gastar contexto lendo esses base64 enormes (80-150KB cada como texto), a extração foi feita
só com `sed`/Node **fora** do contexto do modelo — grava cada constante num arquivo `.txt` à parte via
`sed -n 'Np'` + strip do `const X='...'`, depois um script Node pequeno faz a substituição de
placeholders (`__ASTRO_B64__` etc.) no HTML final. Útil de repetir sempre que precisar reusar um asset
grande já embutido no app sem estourar o contexto.

**Logo dos Correios adicionada ao cabeçalho** (`CORREIOS_B64`, novo) — o arquivo que o usuário mandou
inicialmente por engano estava salvo como `.png` mas era na verdade um JPEG (sem canal alfa, daí o
fundo branco "colado" mesmo sendo anunciado como transparente); a versão certa era um PNG de verdade
já baixado antes no Desktop do usuário. Lição: **nunca confiar na extensão do arquivo** — cheque a
assinatura de bytes (`89 50 4E 47` = PNG real, `FF D8 FF` = JPEG) antes de assumir transparência.

Removidas nessa reformulação, por não fazerem mais sentido sem o rodízio por slide: as constantes
`DASHBG_PRODUCAO_B64`/`DASHBG_RANKING_B64`/`DASHBG_SLA_B64` (fundo fotográfico por slide) e as classes
`.bg-producao`/`.bg-sla`/`.bg-ranking`/`.bg-ritmo`. `--bg-starfield`/`--bg-planet` continuam em uso
(login e o novo `.dash-planet-accent`).

### 12a. Regressão "parou de sincronizar" — causa real vs. causa aparente

Depois de publicar a primeira versão da tela única, o usuário reportou "parou de sincronizar" — sem
nenhum erro visível, só a TV parando de atualizar sozinha. Investigação:

- `renderDashboardTv()` é chamado no **meio** da sequência de `render()` (antes do perfil do
  colaborador e do detalhe de manual) e também por `refreshKioskData()` (a cada 60s) e por
  `onDataChangedExternally` (quando outro PC salva algo). Um erro não tratado dentro dele impedia o
  resto dessas funções de rodar — mesmo que os dados já tivessem sido lidos/salvos corretamente por
  baixo. `save()` já escreve no arquivo compartilhado **antes** de chamar `render()`, então a escrita
  em si nunca ficou comprometida — era só a atualização visual que travava.
- Testado exaustivamente com um harness Node+jsdom que carrega o `app.html` de verdade
  (`vm.runInContext` contra `dom.getInternalVMContext()`, não `window.eval` — este último não expõe
  declarações de função no `window` do jsdom) e chama a função com dezenas de formatos de dado
  realistas — nenhum erro foi reproduzido dessa forma, então a causa raiz exata nunca foi confirmada.
- Correção aplicada independente de achar a causa exata: `renderDashboardTv()` virou uma casca fina
  que chama `renderDashboardTvInner()` dentro de `try/catch`, só logando um aviso no console. Isso é
  uma proteção estrutural permanente — qualquer bug futuro na TV não pode mais travar o resto do app.
  **Mas não resolve, sozinho, um problema real dentro do render da TV** — só isola o dano. Se "a TV não
  atualiza mais" acontecer de novo, abrir o DevTools da janela da TV (`Ctrl+Shift+I` ou menu → Exibir →
  toggleDevTools) e procurar por "Falha ao renderizar o Dashboard TV:" no console é o primeiro passo.

### 12b. Layout do kiosk: dois erros de proporção, em direções opostas

Depois de portar a tela única pro app, uma TV real de 50" mostrou o conteúdo do meio (gráfico/SLA/
ranking) cortado — a linha de KPIs, com altura `auto` (por conteúdo) e tipografia grande (`38px`),
sozinha já tomava a maior parte da altura disponível, sobrando pouco pras outras duas linhas.

**Primeira correção — passou do ponto oposto:** trocar `.dash-row-kpis` pra `flex:0.75` (competindo
por espaço com as outras linhas) resolveu o corte do gráfico, mas encolheu demais a linha de KPIs —
como `.dash-tile-head` tem `flex:0 0 auto` (não encolhe) mas `.dash-kpi-val`/`.dash-kpi-lbl` não têm
essa trava, eles encolheram até desaparecer visualmente (cortados pelo `overflow:hidden` necessário
pra TV nunca estourar) — sobrando só o título de cada card, vazio por dentro. Foto confirmou.

**Correção final:** depois de já ter reduzido a tipografia dos KPIs numa rodada anterior, o conteúdo
*natural* da linha de KPIs já é pequeno o bastante — voltar `.dash-row-kpis` pra `flex:0 0 auto`
(altura por conteúdo) resolveu de vez, com `.dash-row-main`/`.dash-row-secondary` dividindo o resto
por `flex-grow` normalmente. **Lição:** quando um elemento tem filhos que "não podem encolher"
(`flex:0 0 auto`, como um título) misturados com filhos que podem, dar pouco espaço ao container pai
não deixa o conteúdo "menor" — deixa ele **invisível**, porque só os filhos que não encolhem sobrevivem
visualmente. Nesses casos, ajustar o *conteúdo* (fonte/padding) pra ser naturalmente compacto é mais
seguro do que forçar uma fração de espaço via flex-grow.

Nessa mesma rodada: as datas do gráfico (`.dash-linechart-day`) usavam `position:absolute;
bottom:NEGATIVO` — ficavam de propósito **fora** da caixa do próprio gráfico. Isso funcionava bem
antes de existir `overflow:hidden` nos tiles, mas depois de virar padrão pra TV nunca estourar, essas
datas passaram a ser cortadas (invisíveis) pelo pai. Correção: aumentar a margem reservada na base do
próprio SVG (`padBottom` dentro de `renderProdLineChart()`, de 6 pra 16) e colocar a data **dentro**
da caixa (`bottom:0`), nunca mais depender de conteúdo "vazando" pra fora via offset negativo.

### 12c. Overscan de TV — corte simétrico nas duas bordas

Com o gráfico/KPIs já corrigidos, uma foto ainda mostrava texto cortado **nas duas bordas** (esquerda
e direita) de forma simétrica — assinatura clássica de *overscan* (a própria TV recorta uma faixa do
sinal HDMI achando que é transmissão de TV comum, não pixel-a-pixel de computador), não um bug de
CSS. Como o app não tem como saber quanto cada TV vai cortar, a correção foi puramente defensiva:
trocar as margens fixas em pixel do `.dash-kiosk-wrap`/`.dash-kiosk-header` por `vw`/`vh` (porcentagem
da tela) — uma "área segura" que sobra de propósito nas bordas, absorvendo o corte típico de overscan
em qualquer resolução. Isso é diferente de mudar a configuração da própria TV (que também resolveria,
procurando por "Sem escala"/"Ponto a ponto" no menu de formato de imagem) — a margem em `vw`/`vh` é a
correção do lado do app, que funciona mesmo se ninguém mexer na TV.

### 12d. Disco cheio interrompendo o build (não é bug de código)

Um `npm run dist` falhou com `Error: can't write ... bytes to output` — não tinha nada a ver com o
código, o disco `C:` da máquina de build estava com **145MB livres de 118GB** (99% cheio). A pasta
`dist/` sozinha acumulava ~1,5GB de instaladores antigos (cada versão publicada nesta jornada gerou um
`.exe` de ~78MB que nunca era apagado). Como `dist/` é gitignored e inteiramente regenerável
(`npm run dist`), apagá-la por completo antes de cada build é seguro e já virou rotina — mas o disco
cheio em si é um problema da máquina, não do projeto, e vale o usuário investigar o que mais está
ocupando espaço (118GB usados é muito).

## Coisas que parecem bug mas são intencionais

- `db.production` sempre vazio — não é bug, é vestigial; produção real vem de `db.sla` (ver
  [MODELO_DE_DADOS.md](MODELO_DE_DADOS.md)).
- Ativar "criptografia do arquivo" em Administração **não** criptografa o
  `gestao_operacional.json` da pasta compartilhada, só o `.godb`/IndexedDB locais (ver
  [SEGURANCA_E_ACESSO.md](SEGURANCA_E_ACESSO.md)).
- O campo `salary` do colaborador está em texto plano no JSON mesmo estando escondido da UI pro
  operador (`.gestor-only` é só uma trava visual).
- `db.finance` (registros financeiros) não entra em nenhum total de Financeiro — é só uma lista com
  alertas de vencimento, de propósito (ver item 8 acima).
- No Dashboard TV, só o card de destaque (notícias/aniversariantes) reveza sozinho — todo o resto da
  tela única fica sempre visível, sem nenhum rodízio. Isso é o design atual (item 12), não um resquício
  incompleto do rodízio antigo de 5 slides.
- As margens do `.dash-kiosk-wrap` em modo TV são em `vw`/`vh`, não pixel fixo — de propósito, é a
  "área segura" contra overscan de TV física (item 12c). Não trocar de volta pra pixel fixo achando
  que é mais preciso.
