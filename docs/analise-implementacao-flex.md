# Implementação do saldo Flex — 17/09/2026

Contrato confirmado: `nr_pedido` preenchido em `pedido_venda_api` significa que o Duapi já calculou o Flex. Quantidade 3, original R$100 e vendido R$60 produzem `vl_flex=-120`, total do item.

## Funcionamento

- Configuração por holding **Usa saldo Flex**, desligada por padrão, enviada no login e na sincronização.
- Saldo oficial vem exclusivamente de `representante.vl_saldo_flex` para `users.vl_saldo_flex`. Não usar as antigas tabelas `representante_saldo_flex`/`flex_movto`.
- API guarda consumo e confirmação na própria pré-venda. O valor enviado por item é `(vendido - original) × quantidade`, arredondado em centavos: desconto negativo e acréscimo positivo. O consumo é o valor absoluto dos descontos; acréscimos não geram crédito antecipado no limite local. Reservas de pedidos da versão anterior continuam calculadas pelos preços, sem depender do sinal salvo.
- O Integrador lê saldo e confirmações numa única consulta transacional ODBC. A API aplica ambos atomicamente, rejeitando revisões ultrapassadas. Recebimento no TECHBULL e envio à fila do Duapi não liberam reservas.
- SQLite guarda o último estado completo por holding/vendedor em `flex_estado`, fora das tabelas limpas pela importação. Pedidos ainda exclusivos do aparelho são somados ao consumo remoto. IDs conhecidos evitam dupla contagem.
- Recibos de envio permanecem na outbox até uma resposta completa reconhecer o pedido. Edição substitui reserva; exclusão local libera. Tentativa de envio sem resposta conclusiva protege contra edição/exclusão até reenviar e confirmar. Uma rejeição de validação permite corrigir.
- Preço original é capturado no pedido, preservado pela API e exportado em `vl_tabela_preco`. Preço vendido em `vl_unitario`, diferença total em `vl_flex`.
- API recalcula e valida saldo com lock por vendedor. Mais de um aparelho offline pode ter visão antiga; o excedente será bloqueado no envio.

## Compatibilidade

Clientes sem a opção continuam sem limite Flex. Regras existentes de preço, margem e desconto máximo continuam valendo. Ao habilitar, requer primeira sincronização coordenada. Não usar o saldo antigo da sessão como disponibilidade.

## Publicação e validação

Migração SQL aditiva antes da API, remoção das tabelas antigas após a API pronta. OTA de produção no runtime 1.1.3 só depois do deploy. Instalar o Integrador atualizado no Windows antes de habilitar a opção.

Testes cobrem limite exato/excedido, quantidade fracionária, arredondamento, acréscimos, múltiplas vendas, edição/exclusão, saves concorrentes, reservas após envio, revisão antiga, isolamento por vendedor e importação completa/reabertura de SQLite. O teste real no Duapi requer o ambiente Windows/ODBC do cliente.
