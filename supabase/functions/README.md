# Supabase Edge Functions

As operações privilegiadas (criar utilizadores, confirmar pagamentos, emitir bilhetes após pagamento) devem ser implementadas em Edge Functions.

Regras:
- `SUPABASE_SERVICE_ROLE_KEY` só pode existir nos segredos da função, nunca no navegador.
- Verificar sempre o JWT do utilizador que invoca a função.
- Confirmar no servidor que o utilizador tem autorização para gerir o evento.
- Para pagamentos, validar a notificação/assinatura do prestador antes de marcar a encomenda como paga e emitir ingressos.
- Registar operações administrativas para auditoria.

Esta pasta fica preparada para receber as funções de produção. Não existe gateway de pagamento configurado nesta entrega.
