# Importação com bloqueio de uso

`BuscarInformacoesScreen` preserva a listagem detalhada durante a carga.
`DownloadOverview` mostra resumo fixo no topo e todas as etapas na lista rolável,
com ordem estável e contadores reservados. `DOWNLOAD_STAGES` inicializa inclusive
as etapas pendentes, preparação, logo e fotos. Não há centralização vertical do
conteúdo nem inserção/remoção de linhas durante a carga.

`usePreventRemove` intercepta o retorno e apresenta um aviso sem mudar a tela.
O botão físico do Android também é tratado quando a tela é a primeira da pilha;
o gesto de retorno do iOS fica desabilitado enquanto há carga pendente.
`DownloadGate` restaura o marcador no layout autenticado e redireciona para
essa mesma tela em caso de recuperação. O modal é usado somente na verificação
inicial/transição de rota, nunca para cobrir a listagem durante a importação.
O bloqueio de navegação é liberado quando a sessão expira, permitindo novo login.
`expo-keep-awake`
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
- Verificar que transições entre etapas com/sem total não movem resumo nem linhas;
  rolar até etapas pendentes e conferir que o scroll não é reposicionado.

Esta alteração não implementa serviço nativo de download em segundo plano,
retomada por cursor persistente ou troca atômica da base offline.
