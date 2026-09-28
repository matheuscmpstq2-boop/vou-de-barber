# Vou de Barber

Sistema de gestão e agendamento online para barbearias. Cada proprietário administra os serviços, horários, clientes e o link público de agendamento da própria barbearia.

## Desenvolvimento

Requer Node.js 22 ou superior.

```bash
npm ci
npm run dev
```

O aplicativo usa Next.js no frontend e Supabase para autenticação e dados. A cobrança do plano é processada pelas funções existentes do Supabase e pelo Asaas.

## Publicação na Vercel

Conecte este repositório a um projeto Vercel com framework **Next.js** e branch de produção `main`. O comando de compilação é `npm run build`. Após a publicação, confira as rotas `/login`, `/configurar`, `/agendar` e `/recuperar-senha` e configure o domínio publicado nas URLs permitidas do Supabase Auth para confirmação de e-mail e recuperação de senha.
