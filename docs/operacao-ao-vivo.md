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

O OID do contador cumulativo de páginas depende da impressora e pode ser informado no cadastro. A produção mensal é calculada pela diferença entre leituras consecutivas válidas. A capacidade em ppm é nominal e informativa. Cada período de 30 minutos da linha do tempo usa a leitura mais recente daquele período.

Se o equipamento usar outro OID, outro índice de instância, SNMPv1/v3 ou se a rede compartilhada não estiver disponível, consulte o manual/MIB do fabricante e configure um agente SNMP v2c acessível pelo computador coletor.
