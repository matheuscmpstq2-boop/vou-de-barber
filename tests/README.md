# Planos de clientes

`customer-plans.sql` verifica os RPCs reais, as permissões e os saldos no Postgres/Supabase. Execute com uma conexão administrativa no ambiente de desenvolvimento. O arquivo abre uma transação, cria usuários e barbearias temporários e executa `ROLLBACK`; não deixa clientes fictícios cadastrados.

Cobertura: isolamento de contas/RLS, CPF inválido, código incorreto, consulta sem dados pessoais, reserva de crédito, limite de saldo, finalização idempotente, cancelamento, reabertura sem saldo, validade, pausa, redefinição de código, renovação preservando histórico e conflito de gravação do painel.

As migrações de origem estão em `db/customer-plans.sql` e `db/public-booking-consistency.sql`. Estes arquivos representam as definições aplicadas, não devem ser executados novamente em um banco que já recebeu as migrações.

Fluxo de uso:

1. Proprietário cadastra seus serviços em Serviços.
2. Em Planos de clientes, cria nome, preço, validade e quantidade por serviço.
3. Ativa o plano com nome, CPF válido, WhatsApp e data de início. Entrega o código de 6 números ao cliente.
4. No link público, o cliente informa CPF e código, consulta o saldo e agenda um serviço incluído.
5. Agenda reserva um crédito. Proprietário finaliza para consumir ou cancela para liberar. Escolha a data na Agenda para ver atendimentos futuros.
6. Pausar/cancelar bloqueia novos agendamentos. Reservas anteriores permanecem vinculadas ao plano contratado. Renovar cria um novo saldo, mantendo o histórico anterior.

Preço é informativo: a contratação/pagamento dos planos de clientes é acertada diretamente com a barbearia. Não cria cobranças Asaas ou assinaturas do cliente. É independente da assinatura do proprietário na plataforma.
