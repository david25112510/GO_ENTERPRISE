# GO Enterprise 8.14.6

Publicada em 23/11/2026.

## Importação de OS de Desenvolvimento

- Operadores agora podem importar planilhas ODS pelo módulo OS de Desenvolvimento.
- O processo principal aceita somente os campos operacionais permitidos das OS e o resumo da importação. Uma gravação comum não substitui a base de OS.

## Build e artefatos

- Build NSIS x64 gerado com electron-builder.
- O `app.asar` inclui a versão 8.14.6, o botão de importação, a validação no processo principal e a sanitização dos registros.
- SHA-256:

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.14.6.exe | `3FA6505D1A17F021D767022026B1EAAD14B1552CD180B2BB6D600F07279063A4` |
| GO-Enterprise-Setup-8.14.6.exe.blockmap | `772E5D0785FF9AEA1BA9B87E8D2058CB9AF116BD4A60466F745A5906050F1ED8` |

- O instalador não possui assinatura Authenticode. O atualizador integrado recusará instalá-lo; execute-o manualmente em cada computador. O Windows pode bloquear a execução.
- Destino: `Z:\atualizacoes`.
