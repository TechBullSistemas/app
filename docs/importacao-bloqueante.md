# Importação com bloqueio de uso

`DownloadGate`, no layout autenticado, apresenta um modal de tela cheia durante
a carga e quando houver recuperação pendente. Não há ação para dispensá-lo;
o Voltar do Android chega ao `onRequestClose`, que mantém o modal aberto.
O modal cobre o cabeçalho e a navegação por gestos do iOS. `expo-keep-awake`
mantém a tela ligada somente enquanto há execução; não impede bloqueio manual
nem garante execução com o app em segundo plano.

`runDownloadSync` concentra preparação, entidades, logos e fotos. O estado só é
concluído depois das fotos e da remoção do marcador persistente no AsyncStorage.
O marcador é gravado antes da limpeza da base e verificado ao montar o layout,
inclusive após uma nova sessão. Falhas preservam o marcador e exigem nova carga.
Os pedidos pendentes continuam preservados pelas regras existentes de limpeza.
O progresso representa etapas, com fração da etapa atual quando há total conhecido;
não é uma estimativa de tempo nem de bytes. O percentual fica abaixo de 100 até
o sucesso. As falhas individuais de arquivos opcionais continuam seguindo a
política existente dos caches de fotos e logos.

O início é protegido contra execução duplicada e contra envio de pedidos em
andamento. Atualizações OTA baixadas durante a importação aguardam outra ocasião
para aplicação. O marcador não recupera retroativamente cargas interrompidas
em versões anteriores à introdução deste controle.

## Validação

- `node --test tests/download-sync.test.cjs`: ciclo completo, bloqueio até fotos,
  falha de página, marcador após reinício, retry, paginação incompleta e duplicidade.
- `npx tsc --noEmit`.
- Em Android/iOS: iniciar carga, tentar Voltar e gesto de retorno, conferir etapas
  e quantidades; o app só é liberado após terminar.
- Cortar a conexão: conferir erro e tentar novamente após reconectar.
- Encerrar o processo durante carga: ao reabrir, conferir bloqueio e nova tentativa.
- Confirmar tela ligada durante execução e comportamento normal após sucesso/erro.

Esta alteração não implementa serviço nativo de download em segundo plano,
retomada por cursor persistente ou troca atômica da base offline.
