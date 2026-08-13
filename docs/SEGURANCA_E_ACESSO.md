# Segurança e controle de acesso

## Três papéis (`currentRole`)

| Papel | Como entra | O que vê |
|---|---|---|
| `gestor` | PIN (ou senha mestre, no primeiro acesso) | Tudo — todas as telas do menu |
| `operador` | Só a matrícula (`reg`), sem senha | `operadorHome`, `producao`, `manuais`, `dashboardTv` |
| `tv` | PIN próprio da TV (opcional, desativado por padrão) | Só `dashboardTv` e `noticias` |

A tela de acesso (`showPinGate()`) sempre aparece antes de entrar — não existe mais um caminho que
libere o gestor sem digitar nada (isso já foi um bug corrigido, ver
[HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md)). Exceção: quando a aba é aberta com `#dashboard`
(modo kiosk da TV), `boot()` pula a trava inteira e entra direto como `gestor` somente-leitura — a
trava de PIN aqui controla edição dentro do app, não a exibição da TV.

### Onde a visibilidade de tela é decidida

```js
const NAV_VIEWS_BY_ROLE = {
  operador: ['operadorHome','producao','manuais','dashboardTv'],
  tv:       ['dashboardTv','noticias'],
  gestor:   ['home','producao','financeiro','rh','manuais','dashboardTv','fornecedores','admin','noticias']
};
```

`applyRoleUI()` esconde/mostra os botões do menu (`.nav button[data-view]`) batendo contra essa lista,
e `switchView(v)` força um redirecionamento se o papel atual tentar entrar numa view não permitida
(ex.: operador clicando em `rh` é redirecionado pro próprio perfil, `openEmployeeProfile
(currentOperatorId)`, nunca vê a listagem completa de colaboradores).

> **Isto é só uma trava de UI, não uma trava de dados.** O objeto `db` inteiro chega ao renderer
> independente do papel — não há um "backend" que filtre o que cada papel pode ler. Um operador com
> acesso ao DevTools do navegador tecnicamente enxergaria o `db` inteiro em memória. Isso é aceitável
> pro contexto (ferramenta interna, uso confiado), mas é bom ter em mente ao decidir o que colocar em
> `db` no futuro.

## Login do gestor: PIN + senha mestre de bootstrap

Fluxo em `submitPin()` (seção 5):

1. **Banco criptografado** (`GO-DB-ENC`, mecanismo `.godb` legado) → pede o PIN pra decifrar
   (`decryptPayload`).
2. **Nenhum PIN de gestor definido ainda** (`db.config.security.enabled === false`) → pede a
   **senha mestre**, não deixa entrar sem nada. Ver seção abaixo.
3. **PIN normal** → compara hash (`SHA-256(salt + pin)`) contra `db.config.security.pinHash`.

`setNewPin()` (Administração → Segurança → Definir/alterar PIN) é o que grava um PIN de verdade
(salt aleatório de 16 bytes + SHA-256) e ativa `security.enabled`, fechando o caminho da senha mestre
para aquele banco de dados dali em diante.

### Senha mestre — `renderer/master-secret.js` (NÃO versionado)

```js
const MASTER_SALT='...';
const MASTER_PASSWORD_HASH='...';  // SHA-256(MASTER_SALT + senha)
```

Este arquivo **não está no Git** (`.gitignore` tem `renderer/master-secret.js`) — é carregado via
`<script src="master-secret.js"></script>` logo antes do script principal em `app.html`, e como scripts
clássicos (não-módulo) compartilham o mesmo escopo léxico global, as `const` declaradas ali ficam
visíveis pro resto do código sem precisar de `window.X =`.

**Por quê está fora do Git:** o repositório pode ficar público (o David alterna a visibilidade
conforme a necessidade — ver histórico de commits/README). Se `MASTER_SALT`/`MASTER_PASSWORD_HASH`
estivessem no código público, qualquer pessoa poderia ler o hash+salt e quebrar a senha offline em
segundos (o espaço de senhas numéricas curtas é pequeno pra SHA-256 sem work factor). Por isso:

- **Para gerar um instalador que funcione**, `renderer/master-secret.js` precisa existir na máquina
  onde `npm run dist` roda (não é criado automaticamente — ver
  [BUILD_E_RELEASE.md](BUILD_E_RELEASE.md)).
- **Se o arquivo não existir**, o app carrega normalmente, só que ninguém consegue usar a senha
  mestre — só serve pra quem já tem PIN configurado no banco.
- **A senha mestre atual não é "230320"** — esse valor vazou no histórico do Git (commits antigos,
  antes da externalização) e foi **rotacionado**. Trocar o valor sem reescrever o histórico é a
  mitigação suficiente: o hash antigo vira inútil porque o app passa a comparar contra o novo. Ver
  [HISTORICO_E_DECISOES.md](HISTORICO_E_DECISOES.md) para o relato completo desse incidente.
- Se precisar saber/trocar a senha mestre atual, é preciso olhar o arquivo local
  `renderer/master-secret.js` (não está documentado aqui de propósito).

## Login do operador

Sem senha — só a matrícula (`submitOperadorLogin()`), casada contra `db.employees` por
`norm(x.reg)===norm(reg)`. Cadastros com `status==='Inativo'` são bloqueados. Isso é intencional: o
controle de acesso "de verdade" é físico/organizacional (só quem está na operação sabe a própria
matrícula) — não é pensado para resistir a alguém mal-intencionado tentando adivinhar matrículas.

## PIN da TV

Opcional (`security.tvEnabled`), com salt/hash próprios (`tvPinHash`/`tvSalt`), configurado em
Administração → Segurança → "Definir/alterar PIN da TV" (`setNewTvPin()`). Só existe uma aba "TV" na
tela de acesso quando `tvEnabled` está ligado. Dá acesso só a `dashboardTv`+`noticias`.

## Criptografia opcional do arquivo (`.godb`)

`toggleEncryption()` liga/desliga `security.encryptionEnabled`. Quando ativa, `persistPayload()`
passa a chamar `encryptPayload()` (PBKDF2-SHA256 150.000 iterações deriva uma chave AES-256-GCM a
partir do PIN do gestor) em vez de gravar o JSON puro.

> **Importante: isto só afeta o IndexedDB local e o arquivo `.godb` legado (File System Access API,
> mecanismo de navegador).** A pasta compartilhada usada pelo app desktop (ver
> [SINCRONIZACAO_E_PERSISTENCIA.md](SINCRONIZACAO_E_PERSISTENCIA.md)) **sempre recebe o `db` em texto
> plano** — `save()` chama `window.goDesktop.writeData(db)` diretamente, não
> `persistPayload()`. Ligar a criptografia no app desktop não criptografa o
> `gestao_operacional.json` na pasta de rede. Se um dia isso precisar mudar, é aqui
> (`save()`, seção 4) que a lógica teria que ser ajustada.

Ao ativar, o app baixa automaticamente um backup em texto simples antes de criptografar (proteção
contra perda de dados se o PIN for esquecido — sem o PIN, o conteúdo criptografado é irrecuperável).

## Visibilidade de valores monetários

`moneyVisible` (variável em memória, não persistida) controla se `fmtBRL()` mostra o valor real ou
`"R$ ******"`. É um toggle de tela (👁️ no rodapé do menu), não uma trava de segurança — qualquer
papel com o botão visível pode revelar os valores.
