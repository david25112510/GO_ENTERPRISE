# Seguranca no aplicativo desktop

Este documento descreve os controles Electron atuais. A documentacao legada em
`SEGURANCA_E_ACESSO.md` tambem cobre o modo navegador, cujas restricoes sao de interface.

## Perfis e dados

- O processo principal autentica gestor por PIN ou senha mestre, operador por matricula e TV pelo PIN configurado.
- Antes do login, o renderer recebe somente o estado necessario da tela de acesso; hashes de PIN e dados funcionais permanecem no processo principal.
- O operador recebe apenas seu cadastro, registros pessoais associados e dados agregados de producao/SLA.
- O operador pode consultar Operacao ao vivo e importar a planilha de producao; a gravacao do perfil fica restrita a campos de SLA e ao resumo da importacao.
- O operador pode consultar OS de Desenvolvimento com campos operacionais projetados e importar planilhas ODS; a gravacao fica limitada aos campos do modulo e ao resumo da importacao.
- TV recebe dados publicos/operacionais projetados, sem salarios, colecoes financeiras ou identificadores completos de colaboradores.
- O kiosk nao exige PIN, mas recebe a mesma projecao restrita e opera em somente leitura.
- A importacao de producao pelos perfis operador e TV pode gravar apenas linhas SLA e o registro resumido dessa importacao.
- Cadastro de impressoras e ativacao do coletor em Operacao ao vivo continuam restritos ao gestor.
- O processo principal aplica o perfil nos handlers IPC de dados, configuracoes, operacao ao vivo e midia. Builds instalados desativam DevTools.

## Chave corporativa do arquivo compartilhado

`GO_ENTERPRISE_DATA_KEY_FILE` pode apontar para um arquivo local provisionado pela TI. O arquivo
contem uma chave aleatoria de 32 bytes em Base64 ou hexadecimal; a mesma chave deve estar disponivel
em todos os computadores que compartilham a base. O arquivo com a chave deve ficar fora da pasta
sincronizada, com ACL restrita, e nao pode ser incluido no Git ou instalador.

Sem essa variavel, clientes mantem o formato legado. Com ela, a proxima gravacao cifra o arquivo
usando AES-256-GCM. Para evitar indisponibilidade ou perda de acesso, atualize todos os clientes
antes de provisionar a variavel em qualquer computador. Sem a chave correta, a aplicacao nao le nem
grava a base cifrada. Rotacao da chave ainda exige procedimento de migracao controlado e backup
recuperavel pela TI.

## Limites

## Assinatura dos atualizadores

O processo de instalacao de atualizacoes exige assinatura Authenticode valida e o nome completo do
publicador configurado em `GO_ENTERPRISE_UPDATE_PUBLISHER` (correspondente ao Subject do certificado).
Sem um certificado aprovado pela Selbetti e sem essa configuracao externa, o instalador e recusado.
Nao coloque certificado ou chave privada no aplicativo, no instalador ou na pasta compartilhada.

O login de operador continua sendo apenas a matricula, conforme decisao de produto. A base so migra
para formato cifrado depois que a TI provisionar a chave. O modo navegador nao possui um processo
principal confiavel e nao recebe estes controles IPC.
