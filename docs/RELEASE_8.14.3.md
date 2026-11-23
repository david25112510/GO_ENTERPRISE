# GO Enterprise 8.14.3

Publicada em 23/11/2026.

## Correcao

- A tela SELBNEWS agora fica visivel no perfil TV durante o rodizio do Dashboard TV.

## Validacao e artefatos

- Build NSIS x64 gerado com electron-builder.
- O `app.asar` inclui a versao 8.14.3, a correcao CSS e `renderer/master-secret.js`.
- SHA-256 conferido nos artefatos locais e na pasta compartilhada `Z:\atualizacoes`:

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.14.3.exe | `2DE0B82B56CE4BB06211DFD0572E2C3BFE1004FADAC51884DC3F6D0DCAC747E9` |
| GO-Enterprise-Setup-8.14.3.exe.blockmap | `D7E4A0F243B0FF45EE340F37E09D1719BF74091636A31FC5087D08E0F780EF15` |

- O instalador nao possui assinatura Authenticode. O atualizador integrado oferece a versao, mas recusa instala-la sem certificado aprovado pela Selbetti e a configuracao `GO_ENTERPRISE_UPDATE_PUBLISHER`. Para atualizar, execute o instalador manualmente; o Windows pode bloquear a execucao.
- O manifesto `Z:\atualizacoes\version.json` aponta para 8.14.3. O manifesto anterior foi preservado como backup.
