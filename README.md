# MedStudy

O MedStudy organiza áreas de estudo e flashcards pessoais. A branch `feat/private-library-subscriptions` prepara autenticação, planos pagos e uma biblioteca privada.

## Planos preparados
- Mensal: R$ 80 por mês.
- Anual: R$ 500 por ano.
- Vitalício: R$ 750 em pagamento único, com acesso permanente após confirmação do pagamento.

## Recursos
- Cadastro e login via Supabase Auth.
- Checkout Stripe e atualização de assinatura/acesso vitalício por webhook.
- Arquivos guardados em bucket privado Supabase Storage.
- Upload, listagem e links temporários só após validar a conta e o direito de acesso no servidor.
- Segredos via variáveis de ambiente, sem credenciais no código.

## Configuração antes de publicar
1. Crie um projeto Supabase e execute `supabase/schema.sql` no SQL Editor. Confirme que o bucket `medstudy-private` está privado.
2. No Stripe, cadastre três preços em BRL: recorrente mensal R$ 80, recorrente anual R$ 500 e pagamento único R$ 750. Informe cada Price ID ao serviço.
3. Configure um endpoint Stripe em `https://SEU-SERVICO.onrender.com/api/stripe/webhook`, com os eventos `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` e `checkout.session.completed`.
4. Crie um Web Service Render a partir desta branch com `render.yaml`. Configure as variáveis conforme `.env.example`, incluindo as chaves Supabase/Stripe, URL pública e Price IDs.
5. Faça cadastro e valide login, pagamentos, webhooks, expiração/renovação e biblioteca privada antes de trocar o endereço em produção.

Não publique mídia na pasta do site, no Git ou em bucket público. O site hospedado atualmente é estático; autenticação de servidor e biblioteca protegida exigem o novo Web Service configurado.
