# Fluxo n8n — Cobrança diária

Este fluxo roda todo dia às 10h e chama a rotina automática do sistema, que:

1. Envia a cobrança (com botão de copiar PIX) para todo cliente que **vence hoje**.
2. Envia um aviso de atraso para quem **venceu ontem e ainda não pagou**.

> Os avisos ao **grupo de administradores** (novo cliente, pagamento recebido e pedido de atendimento humano) não dependem mais deste fluxo — são enviados na hora do acontecimento. Veja em Configurações > Avisos.

## Como importar

1. No n8n, vá em **Workflows > Import from File** e selecione `cobranca-diaria.json`.
2. Abra o node **"Chamar /api/automacao/cobranca-diaria"** e troque `SEU-DOMINIO.vercel.app` pelo domínio real do seu sistema.
3. Defina o segredo de duas formas (escolha uma):
   - **Variável do n8n** (recomendado): em *Settings > Variables*, crie `AUTOMACAO_SECRET` com o mesmo valor que você colocou na variável de ambiente `AUTOMACAO_SECRET` do seu projeto na Vercel. O node já está configurado para usar `{{ $vars.AUTOMACAO_SECRET }}`.
   - **Valor fixo**: se sua versão do n8n não tiver variáveis, apague a expressão e cole o valor do segredo direto no campo do header `x-automacao-secret`.
4. Ative o fluxo (toggle "Active").

## Importante

- O endpoint só responde para quem mandar o header `x-automacao-secret` correto — sem isso, retorna 401.
- Esse segredo **precisa estar configurado como variável de ambiente `AUTOMACAO_SECRET` no seu projeto na Vercel** (Project Settings > Environment Variables) — o sistema não tem como definir isso sozinho.
- Se quiser um horário diferente das 10h, edite o campo `cronExpression` no node "Todo dia às 10h" (formato cron padrão: minuto hora dia mês dia-da-semana).
- O node "Teve falha no envio?" está pronto para você conectar uma notificação (e-mail, Slack, outro WhatsApp) caso algum envio falhe — hoje ele não faz nada sozinho.
