# GO Enterprise 8.12.0

Release preparada em 13/11/2026.

## Alterações

- Matinal da operação: imagem reorganizada em formato vertical 9:16 (1080 × 1920) para leitura em
  telefone e gerada em JPG com qualidade 92%, pronta para compartilhar pelo WhatsApp.
- Perfil TV: acesso à aba Produção e importação da planilha de produção/SLA. Os valores financeiros
  continuam ocultos nesse perfil.
- Dashboard TV: o indicador de backlog do bloco OS Desenvolvimento considera somente OS abertas no
  mês vigente que continuam sem entrega e cujo prazo já venceu.

## Validação e artefatos

- `git diff --check`: sem erros.
- Build NSIS x64 concluído com electron-builder 24.13.3 e Electron 30.5.1. O ASAR contém a versão
  8.12.0, a exportação JPG vertical 1080 × 1920 e as permissões do perfil TV atualizadas.
- SHA-256 calculado após o build; valores abaixo.
- Homologação da instalação e dos fluxos visuais: pendente.

## Distribuição

Destino configurado: `Z:\atualizacoes`. Publicar instalador e blockmap após conferir os hashes; atualizar
o manifesto `version.json` por último.

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.12.0.exe | `fa8b290e3a845e54e485c00e0e99e04c438a3c3fec365ad52534d0f8f79db063` |
| GO-Enterprise-Setup-8.12.0.exe.blockmap | `a739e808030fa314d9bfe3eb29ced439a720ea1d3a77e922d5b460602a90dd77` |
