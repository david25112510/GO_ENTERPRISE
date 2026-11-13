# Operação ao vivo

O módulo acompanha impressoras via SNMP v2c. A coleta e a atualização do painel ocorrem a cada 30 segundos. Ele apresenta estado, contador de páginas, capacidade nominal, tempo mensal em cada estado e uma linha do tempo das últimas 24 horas. Não há campos financeiros.

## Primeiro uso

1. Configure a mesma pasta compartilhada do GO Enterprise neste computador e nos computadores que consultarão o painel.
2. Entre no GO com o perfil Gestor e abra **Operação ao vivo**.
3. Cadastre cada impressora com nome, endereço, comunidade SNMP, capacidade nominal e os OIDs disponíveis.
4. Habilite **Este computador é o coletor central** somente no computador designado.

O coletor grava as leituras no arquivo `dados/operacao_ao_vivo.json` dentro da pasta compartilhada. Um bloqueio compartilhado impede que dois coletores consultem as impressoras ao mesmo tempo. As comunidades SNMP ficam criptografadas pelo Windows no perfil local do computador coletor; não são gravadas no arquivo compartilhado.

## OIDs e estados

O OID inicial para estado é `1.3.6.1.2.1.25.3.5.1.1.1`, correspondente a `hrPrinterStatus` do HOST-RESOURCES-MIB (instância 1). No padrão da MIB, estado 3 significa ociosa e 4 significa imprimindo. Outros estados respondidos aparecem como **Sem leitura**; ausência de resposta aparece como **Offline**.

O contador cumulativo usa por padrão `prtMarkerLifeCount`, da [Printer-MIB (RFC 3805)](https://www.rfc-editor.org/rfc/rfc3805.html), com índice 1.1 (`1.3.6.1.2.1.43.10.2.1.4.1.1`). Modelos com outro índice/OID podem ser ajustados no cadastro. O painel mostra o contador acumulado de cada impressora e a variação no mês. A unidade exata depende do `prtMarkerCounterUnit` informado pelo equipamento, portanto o painel não pressupõe que todo contador corresponda a folhas.

A capacidade total é a soma das velocidades nominais cadastradas. O uso instantâneo soma a capacidade nominal das impressoras cujo estado atual é “imprimindo” e divide pela capacidade total. É uma estimativa pelo estado SNMP, não uma medição da velocidade real da página. O gráfico permite filtrar uma impressora ou toda a operação e alternar entre 6, 12 e 24 horas; cada ponto representa um intervalo de 30 minutos.

A capacidade em ppm é nominal e informativa. Cada período de 30 minutos da linha do tempo usa a leitura mais recente daquele período.

Se o equipamento usar outro OID, outro índice de instância, SNMPv1/v3 ou se a rede compartilhada não estiver disponível, consulte o manual/MIB do fabricante e configure um agente SNMP v2c acessível pelo computador coletor.
