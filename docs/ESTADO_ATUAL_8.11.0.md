# Estado atual — GO Enterprise 8.11.0

Atualizado em 13/11/2026. Branch `main` de https://github.com/david25112510/GO_ENTERPRISE.

Esta versão acrescenta à aba Produção a geração manual de uma imagem PNG com os indicadores do
Dashboard TV, usando os dados disponíveis até ontem no fuso `America/Sao_Paulo`. A imagem é baixada
para que o usuário a envie manualmente ao grupo do WhatsApp.

- Instalador NSIS x64 gerado em `dist/GO-Enterprise-Setup-8.11.0.exe`; SHA-256 e conferência do pacote estão em [notas da release](RELEASE_8.11.0.md).
- Destino de atualização configurado: `Z:\atualizacoes`.
- Commit da release: consultar o histórico Git da branch `main`.
- Homologação da instalação interativa ainda pendente; ver [notas da release](RELEASE_8.11.0.md).

O recurso não agenda nem envia mensagens pelo WhatsApp. O programa e a imagem dependem dos dados já
importados no banco compartilhado. Permanecem as limitações de sincronização documentadas em
[VERIFICACAO_2026-10-20.md](VERIFICACAO_2026-10-20.md). O estado da 8.10.1 e anteriores é histórico.
