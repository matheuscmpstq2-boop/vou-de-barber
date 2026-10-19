# Administração da plataforma

Rota: `/admin`. Login normal em `/login?next=/admin`. Há um link no painel do proprietário somente após confirmação da permissão pelo banco.

## Estado da entrega em 19/10/2026

Interface implementada e compilação verificada. As definições de banco foram testadas em Postgres local isolado (PGlite), com permissões de papéis reais. **A instalação no banco de produção e a validação com os dados reais estão pendentes:** o projeto Supabase está INACTIVE e a reativação foi recusada pelo limite de dois projetos gratuitos ativos. Não pausar outros projetos sem a escolha do proprietário.

Enquanto o banco/configuração estiver indisponível, a página informa que não foi possível verificar o acesso e não carrega dados. Não há números demonstrativos, contas fictícias ou atalhos de autorização no frontend.

## Funcionalidades

- Indicadores de contas, barbearias, logins nos últimos 30 dias, testes grátis e assinaturas.
- Busca e paginação de barbearias, usuários (inclusive cadastros incompletos) e cobranças.
- Histórico financeiro a partir dos eventos do webhook, deduplicado por ID de pagamento.
- Estados separados para inadimplência, checkout pendente, teste encerrado e período encerrado.
- Detalhes da barbearia, observações internas e histórico de alterações.
- Cortesia de 1 a 30 dias para assinaturas não ativas, com motivo obrigatório e auditoria. Não quita, cancela, reembolsa nem altera cobranças no Asaas.
- CSV da página atual, protegido contra fórmulas ao abrir em planilhas.
- Alertas de processamento do webhook.

## Instalação após restaurar o Supabase

1. Conferir o schema real de `barbershops`, `subscriptions`, `asaas_webhook_events` e `auth.users`. A conexão estava indisponível durante o desenvolvimento; o contrato conhecido das funções existentes foi usado nos testes locais.
2. Na mesma conexão administrativa que executará `db/platform-admin.sql`, definir `vdb.platform_admin_email` com o e-mail confirmado do proprietário. Exemplo: `select set_config('vdb.platform_admin_email','owner@example.com',false);`. Nunca executar isso pelo cliente público.
3. Aplicar o arquivo SQL revisado. A transação falha integralmente se o e-mail não existir ou não estiver confirmado. Não conceder administração com base em metadata editável do usuário.
4. Validar os RPCs com a conta permitida, uma conta comum e `anon`. Rodar os advisors do Supabase e revisar permissões de execução e tabelas privadas.
5. Conferir dados financeiros com eventos e cobranças reais do Asaas antes de considerar a integração concluída.

## Segurança

Tabelas e views administrativas estão no schema privado, com privilégios revogados; tabelas têm RLS. RPCs de dados exigem usuário confirmado cadastrado na lista privada de administradores. Não há acesso anônimo. Cada operação valida a permissão no banco, independentemente da interface. Nenhuma chave privilegiada é enviada ao navegador. A função de acesso não permite autoinscrição.

## Limites dos indicadores

Logins em 30 dias não significam pessoas online agora. Receita mensal estimada usa o preço atual de R$ 39,90 multiplicado por assinaturas de status ativo; não é receita recebida. “Recebido neste mês” inclui apenas pagamentos com estado RECEIVED e data de pagamento no mês de Brasília. Checkouts sem pagamento identificado não viram recebimento financeiro. Eventos não recebidos pelo webhook não aparecem no histórico. Um pagamento estornado ou excluído deixa de ser contado como recebido. A estimativa deve acompanhar futuras mudanças no preço do checkout.

## Testes isolados

Os arquivos abaixo usam apenas fixtures locais e não devem ser executados diretamente em produção:

```bash
npm install --prefix /tmp/vdb-admin-tests --no-save @electric-sql/pglite@0.3.14
PGLITE_MODULE=/tmp/vdb-admin-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/platform-admin.mjs
pnpm build
```

Cobertura: autorização positiva; negação a proprietários comuns, anônimos e usuários sem e-mail confirmado; metadata editável não concede administração; dados privados inacessíveis; agregações; deduplicação financeira; filtros; testes encerrados; observações e auditoria; limites da cortesia; preservação de assinatura ativa. Nenhuma fixture é criada no projeto Supabase real.
