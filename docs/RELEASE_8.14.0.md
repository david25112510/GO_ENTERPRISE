# GO Enterprise 8.14.0

Release preparada em 13/11/2026.

## Operação ao vivo

- Novo gráfico interativo de utilização, com filtro por impressora ou operação completa, períodos de 6, 12 e 24 horas e detalhes ao passar o mouse.
- Indicadores da capacidade nominal total (ppm), capacidade nominal em impressoras que reportam impressão e percentual estimado em uso no momento.
- Cada impressora mostra seu contador cumulativo em destaque e a variação mensal do contador.
- A coleta usa por padrão `prtMarkerLifeCount` (Printer-MIB) com índice 1.1; o OID pode ser alterado para modelos com outro índice.

A porcentagem é uma estimativa baseada no estado SNMP de impressão e na capacidade nominal informada. Ela não mede a velocidade real nem a fração de tempo em que cada motor está imprimindo.

## Validação e artefatos

- Verificação de sintaxe concluída para o processo principal, preload, coletor e script da interface.
- Build NSIS x64 concluído com electron-builder 24.13.3 e Electron 30.5.1.
- ASAR conferido: versão 8.14.0, gráfico/capacidade, OID padrão do contador e bootstrap mestre incluídos.
- Homologação em impressoras reais não realizada; alguns modelos podem exigir OIDs de estado/contador diferentes.

## Hashes SHA-256

| Artefato | SHA-256 |
| --- | --- |
| GO-Enterprise-Setup-8.14.0.exe | `7f7ed6096df79a6d9777cb5248aa7f8e40384c6fd97422e4e83b35a39f782b31` |
| GO-Enterprise-Setup-8.14.0.exe.blockmap | `a2efb603052ffb2f1d0ef8b1e02532fe6a696012cf72261d3657e0839cb8df07` |

## Distribuição

Destino: `Z:\atualizacoes`. O manifesto `version.json` aponta para esta versão após os arquivos serem copiados e conferidos.
