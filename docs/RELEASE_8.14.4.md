# GO Enterprise 8.14.4

Publicada em 23/11/2026.

## Acesso de colaboradores

- O perfil operador pode consultar o módulo Operação ao vivo.
- O perfil operador pode importar a planilha de produção/SLA pela tela Produção.
- A gravação dos perfis operador e TV continua limitada a campos de SLA e ao resumo da importação.
- Cadastro de impressoras e ativação do coletor continuam restritos ao gestor.

## Build e artefatos

- Build NSIS x64 gerado com electron-builder.
- O `app.asar` inclui a versão 8.14.4, o acesso de consulta de Operação ao vivo, a importação por operador e a gravação limitada no processo principal.
- SHA-256:

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.14.4.exe | `A30220F740B56CA8873FA9DC4695257EFA5BC656ED8E82C9E742F658C5E331FB` |
| GO-Enterprise-Setup-8.14.4.exe.blockmap | `530C8C395381097D00EB9E2AEA5A055F3E93EDA86774DE6E9E77825A8A94E521` |

- O instalador não possui assinatura Authenticode. O atualizador integrado recusará instalá-lo; execute-o manualmente em cada computador. O Windows pode bloquear a execução.
- Destino: `Z:\atualizacoes`.
