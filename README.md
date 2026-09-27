# MedStudy

O MedStudy organiza áreas de estudo e flashcards pessoais. A branch `feat/private-library-subscriptions` prepara autenticação, planos pagos e uma biblioteca privada.

## Planos preparados
- Mensal: R$ 80 por mês.
- Anual: R$ 500 por ano.
- Vitalício: R$ 750 em pagamento único, com acesso permanente após confirmação do pagamento.

## Recursos
- Cadastro e login via Supabase Auth.
- Checkout e confirmação de pagamentos via Mercado Pago.
- Arquivos guardados em bucket privado Supabase Storage.
- Upload, listagem e links temporários só após validar a conta e o direito de acesso no servidor.
- Segredos via variáveis de ambiente, sem credenciais no código.

## Configuração antes de publicar
1. Crie um projeto Supabase e execute `supabase/schema.sql` no SQL Editor. Confirme que o bucket `medstudy-private` está privado.
2. Crie uma aplicação em "Suas integrações" no Mercado Pago e configure credenciais de teste antes de entrar em produção.
3. Configure no Render `MP_ACCESS_TOKEN` como segredo e `APP_URL` com a URL do Web Service.
4. Configure o webhook do Mercado Pago para `https://SEU-SERVICO.onrender.com/api/mercadopago/webhook`, selecione eventos de pagamentos e assinaturas e salve o segredo gerado como `MP_WEBHOOK_SECRET`.
5. Crie um Web Service Render a partir desta branch com `render.yaml`. Configure as variáveis Supabase e Mercado Pago conforme `.env.example`.
6. Faça cadastro e valide login, pagamentos, webhooks, expiração/renovação e biblioteca privada antes de trocar o endereço em produção.

Não publique mídia na pasta do site, no Git ou em bucket público. O site hospedado atualmente é estático; autenticação de servidor e biblioteca protegida exigem o novo Web Service configurado.
