# Calendário diário

O Calendário é o segundo módulo do Percorso, disponível em `/calendar` para usuários autenticados. Ele reproduz o registro em papel: azul (`done`) quando as metas do dia foram cumpridas, vermelho (`missed`) quando a meta acompanhada falhou. Sem registro, o dia permanece em branco. A observação opcional de até 500 caracteres registra qual meta falhou ou algum contexto útil.

## Regras de uso

- O calendário abre no mês atual; o usuário seleciona um dia anterior para registrar. Só permite marcar ou corrigir datas anteriores ao dia local do dispositivo. Hoje e datas futuras ficam desabilitados; ao passar da meia-noite a tela atualiza a disponibilidade.
- Um clique seleciona o dia. Os botões azul e vermelho salvam ou substituem a marcação; **Limpar este dia** remove o registro. Dias sem registro não são considerados falhas nos totais.
- O resumo conta apenas marcas do mês exibido. A tela carrega somente o mês aberto, guarda os meses visitados em memória e pagina a navegação por mês.
- Há tradução em português, inglês e italiano, suporte a tema claro/escuro e identificação textual para leitores de tela além das cores.

## Arquitetura

`CalendarPage.tsx` mantém o mês e a seleção na interface; `store.ts` concentra as operações Supabase e o cache temporário. O `AppLayout` limpa esse cache ao encerrar a sessão, impedindo que dados de outra conta permaneçam em memória. As datas são strings `YYYY-MM-DD` locais, conforme `src/lib/dates.ts`, sem conversão UTC para os quadrados do calendário.

A migration `20260925120000_calendar_days.sql` cria `public.calendar_days` com uma linha por `(user_id, date)`, restrição dos dois estados, índice por usuário/data, políticas RLS de proprietário e permissões explícitas ao papel `authenticated`. Aplicar com `npx supabase db push` ou pelo fluxo de migrations do ambiente. `supabase/schema-full.sql` é apenas um retrato destrutivo para bancos descartáveis: **não o execute no banco de produção**. As seeds local e demonstrativa incluem dias azuis e vermelhos.

## Verificação

Execute `npm run typecheck`, `npm run lint`, `npm test` e `npm run build`. Com a migration aplicada, confira em uma conta de teste a persistência após atualizar a página, mudança azul/vermelho, limpeza, troca de mês, bloqueio de hoje e isolamento entre usuários.

**Decisão de escopo:** esta primeira versão acompanha uma avaliação geral por dia. A observação identifica a meta específica que motivou o vermelho; catálogo de metas, alertas e relatórios por meta poderão ser módulos independentes depois, sem vincular este registro às metas financeiras existentes.
