# GO Enterprise 8.12.1

Release preparada em 13/11/2026.

## Alterações

- Perfil TV: botão de importação da planilha de produção/SLA adicionado diretamente à página do
  Dashboard TV. A importação também continua disponível na aba Produção.
- Os valores financeiros continuam ocultos no perfil TV.

## Validação e artefatos

- `git diff --check`: sem erros.
- Build NSIS x64 concluído com electron-builder 24.13.3 e Electron 30.5.1. O ASAR contém a versão
  8.12.1 e o controle de importação visível no Dashboard TV para o perfil TV.
- SHA-256 calculado após o build; valores abaixo.
- Homologação interativa da atualização: pendente.

## Distribuição

Destino configurado: `Z:\atualizacoes`. Preservar o manifesto anterior, conferir os hashes das cópias e
substituir `version.json` por último.

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.12.1.exe | `c2d5280785601e5f37f757093e1a407a6d00b4a38627177736ef5679c2ca74e9` |
| GO-Enterprise-Setup-8.12.1.exe.blockmap | `2db712167033deb01c5611393e59a3bb907e8fc0b5f8c19179a2064db7375fbd` |
