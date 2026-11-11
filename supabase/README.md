# Supabase

Execute as migrações SQL por ordem em `migrations/`.

O primeiro utilizador deve ser promovido manualmente a `platform_admin` através de uma operação SQL executada pelo proprietário do projecto. Não disponibilize esta operação no front-end.

A função `validate_ticket(p_event_id, p_code)` recebe o evento previamente seleccionado e o código lido. A validação é transaccional e regista leituras aceites e recusadas.
