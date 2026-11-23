# GO Enterprise 8.14.5

Publicada em 23/11/2026.

## OS de Desenvolvimento

- O perfil operador pode abrir e consultar o módulo, usar filtros e exportar o recorte CSV.
- A projeção do operador inclui somente os campos operacionais exibidos pelo módulo.
- A importação da planilha ODS continua restrita ao gestor.

## Build e artefatos

- Build NSIS x64 gerado com electron-builder.
- O `app.asar` inclui a versão 8.14.5, a rota de Operador, a projeção de dados do módulo e o controle de importação exclusiva para gestor.
- SHA-256:

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.14.5.exe | `07906B08B5FC11474698607110D32B66B20E71AF95C459828E9D8ABDC7DCFF68` |
| GO-Enterprise-Setup-8.14.5.exe.blockmap | `A6B6FC07DD314D26C71DF50F93522F009746A16546277D4DFB7D5223599D1307` |

- O instalador não possui assinatura Authenticode. O atualizador integrado recusará instalá-lo; execute-o manualmente em cada computador. O Windows pode bloquear a execução.
- Destino: `Z:\atualizacoes`.
