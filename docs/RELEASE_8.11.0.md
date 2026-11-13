# GO Enterprise 8.11.0

Release preparada em 13/11/2026.

## Alterações

- Aba Produção: botão **Gerar imagem do matinal** cria uma imagem PNG com os mesmos indicadores
  operacionais do Dashboard TV: produção diária, objetos, ritmo, perda de papel, totais do mês,
  dias com produção e restantes, evolução diária, SLA, melhores dias, OS de desenvolvimento e
  mensagem do dia.
- A imagem é calculada para o dia anterior no fuso `America/Sao_Paulo`, aparece em prévia e é baixada
  para compartilhamento manual no WhatsApp. Não há envio automático nem integração de WhatsApp.

## Fonte dos dados

- Impressões e objetos: OS de produção em `db.sla`, agrupadas por `deliveryDate`, pela lógica existente
  de `dailyProduction()`.
- OS de desenvolvimento: dados de `db.developmentOrders`, seguindo as datas de abertura, entrega,
  prazo e cancelamento já usadas pelo Dashboard TV.
- Indicadores auxiliares do Dashboard TV usam as fontes existentes de configuração, perdas, SLA e
  mensagens diárias.

## Validação e artefatos

- Revisão de diff: `git diff --check` sem erros.
- Build NSIS x64 concluído com electron-builder 24.13.3 e Electron 30.5.1. O ASAR foi conferido: versão 8.11.0 e `renderer/app.html` correspondem ao código-fonte; `renderer/master-secret.js` está presente no pacote.
- SHA-256 do instalador e do blockmap calculados após o build; valores abaixo.
- Homologação da instalação interativa: pendente.

## Distribuição

Destino configurado: `Z:\atualizacoes`. Preservar a versão anterior e publicar o manifesto somente
depois de conferir os hashes dos arquivos copiados.

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.11.0.exe | `16f0f0c90756f9b81effd31028df13fc554799dc9d568bf9ec3602c172e58637` |
| GO-Enterprise-Setup-8.11.0.exe.blockmap | `6178597d8853652a7fc1050b68a1aec3bb3f2564531fc98c132fc0dff08b2cb3` |
