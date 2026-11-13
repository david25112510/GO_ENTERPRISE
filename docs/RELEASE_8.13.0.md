# GO Enterprise 8.13.0

Release preparada em 13/11/2026.

## Alterações

- Adicionado o módulo **Operação ao vivo**, com coleta de impressoras SNMP v2c a cada 30 segundos.
- Painel com estado de impressão, ociosidade, desconexão e sem leitura; páginas por diferença de contador; capacidade nominal; tempos mensais; linha do tempo de 24 horas.
- Credenciais SNMP protegidas localmente pelo Windows. Leituras compartilhadas com os demais computadores; bloqueio para manter um único coletor ativo.
- Sem dados financeiros.

## Validação e artefatos

- JavaScript do processo principal, preload, serviço SNMP e script da interface passaram pela verificação de sintaxe.
- Build NSIS x64 concluído com electron-builder 24.13.3 e Electron 30.5.1.
- ASAR conferido: versão 8.13.0, dependência `net-snmp`, módulo e bootstrap mestre incluídos.
- A instalação interativa e a leitura em impressoras reais não foram homologadas.

## Hashes SHA-256

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.13.0.exe | `5201c22ed0e6c455b12a01dc35f8e158af13239194305ec8e73be3a460e17c86` |
| GO-Enterprise-Setup-8.13.0.exe.blockmap | `8eb57b5423c91e9da52233651acd3c85c63a6f34a39065a99b54bbeb9a4fa2e3` |

## Distribuição

Destino configurado: `Z:\atualizacoes`. O manifesto `version.json` aponta para o instalador desta release. A versão anterior foi preservada em um arquivo de backup.
