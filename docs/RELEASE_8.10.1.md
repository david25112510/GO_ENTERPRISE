# GO Enterprise 8.10.1

Release de 04/11/2026.

## Alterações

- Planilha de saldo: exige início e fim do Período Ativo do Ponto; deixa de usar a data de geração como competência. Valida datas e conflitos com intervalos existentes.
- Cartão de ponto Meu RH: A PAGAR e A DESCONTAR são negativos; A COMPENSAR é positivo. Sinais explícitos prevalecem. Importação e exibição compartilham a interpretação.
- Ofensores: painel com largura completa, nomes com quebra de linha, valores alinhados e grupos responsivos.
- Resumo por competência: substitui o quadro grande de evolução por três gráficos compactos das últimas três competências, com números sempre visíveis.

## Validação

- 16 testes automatizados aprovados.
- Importador real executado sobre o PDF fornecido: −32h11 + 3h13 = −28h58, competência novembro/2026.
- Layouts verificados em 375, 768, 1024 e 1440 pixels, com dados sintéticos.
- Build NSIS x64 concluído. Código, versão, bandeja e presença do bootstrap conferidos no ASAR. O ASAR extraído do instalador corresponde ao pacote validado.
- Não houve homologação de sincronização entre dois computadores. As limitações de persistência documentadas na 8.10.0 permanecem.

## Distribuição

Destino configurado: `Z:\atualizacoes`. Publicar instalador e blockmap com conferência SHA-256, preservar o manifesto anterior e substituir `version.json` por último.

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.10.1.exe | 9f85c2f941cce397ec2a140c71d82ff244b0752e6acf2b88dffe30546fe9b713 |
| GO-Enterprise-Setup-8.10.1.exe.blockmap | dcdd1358fe532fc9e99b2b732d718eb34f2a24523b11672e5d059663ddb5ad84 |

Após atualizar, reimportar as folhas afetadas para corrigir saldos persistidos. Revisar no Histórico os registros de planilha anteriormente associados ao mês errado. A release não migra nem exclui dados automaticamente.
