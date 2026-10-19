# Administração da plataforma

Rota: `/admin`. Login em `/login?next=/admin`. O link no painel do proprietário aparece somente após confirmação da permissão pelo banco.

## Funcionalidades

- Indicadores de usuários, barbearias, acessos recentes, testes grátis e assinaturas.
- Busca e paginação de barbearias, usuários e cobranças.
- Histórico financeiro calculado a partir dos eventos do webhook, deduplicado por ID de pagamento.
- Estados separados para inadimplência, checkout pendente, teste encerrado e período encerrado.
- Observações internas, cortesias e histórico de alterações.
- CSV da página atual com proteção contra fórmulas em planilhas.
- Alertas de processamento do webhook.

## Instalação

1. Conferir o schema de `barbershops`, `subscriptions`, `asaas_webhook_events` e `auth.users` no ambiente de destino. Os eventos utilizam a coluna `received_at`.
2. Na conexão administrativa que executará `db/platform-admin.sql`, definir `vdb.platform_admin_email` com o e-mail confirmado do proprietário. Exemplo: `select set_config('vdb.platform_admin_email','owner@example.com',false);`. Não executar pelo cliente público.
3. Aplicar o SQL revisado. A transação falha se a conta indicada não existir ou o e-mail não estiver confirmado.
4. Validar os RPCs com a conta permitida, uma conta comum e `anon`.
5. Conferir os valores financeiros com a fonte de pagamento do ambiente antes de usar os relatórios para decisões comerciais.

## Controle de acesso

A lista de administradores fica em tabela privada. Os RPCs verificam a permissão no banco em todas as operações. Metadata editável pelo usuário não concede administração. Não há segredo privilegiado no navegador ou autoinscrição pelo cliente.

A interface informa indisponibilidade quando não consegue verificar a autorização; não preenche os indicadores com dados demonstrativos.

## Indicadores financeiros

Logins em 30 dias não significam pessoas online agora. Receita mensal estimada usa o preço configurado multiplicado por assinaturas de status ativo e não equivale a receita recebida. A estimativa deve acompanhar mudanças no preço do checkout.

Recebido no mês considera apenas pagamentos de estado RECEIVED com data no mês de Brasília. Checkouts sem pagamento identificado não geram recebimento financeiro. Eventos que não chegaram ao webhook não aparecem no histórico. Pagamentos estornados ou excluídos não contam como recebidos.

A cortesia permite de 1 a 30 dias para assinaturas não ativas, exige motivo e grava auditoria. Ela não quita, cancela, reembolsa ou altera cobranças no provedor de pagamento.

## Testes isolados

O runner usa somente fixtures locais; não executar o arquivo de fixtures diretamente em produção.

```bash
npm install --prefix /tmp/vdb-admin-tests --no-save @electric-sql/pglite@0.3.14
PGLITE_MODULE=/tmp/vdb-admin-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/platform-admin.mjs
pnpm build
```

Cobertura: autorização; negação a contas comuns, anônimas e não confirmadas; metadata editável; permissões de tabelas privadas; agregações; deduplicação; filtros; testes encerrados; observações; auditoria; limites da cortesia e preservação de assinatura ativa.
