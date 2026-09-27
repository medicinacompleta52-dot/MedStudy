# MedStudy

O MedStudy organiza áreas de estudo e flashcards pessoais. A branch `feat/private-library-subscriptions` prepara uma versão com backend para autenticação, assinatura e biblioteca privada.

## Recursos preparados
- Cadastro e login de conta por Supabase Auth.
- Planos mensal e anual com checkout e sincronização por webhook do Stripe.
- Biblioteca em bucket privado Supabase Storage.
- Uploads, listagem e links assinados temporários liberados pelo servidor apenas para a própria conta com assinatura ativa.
- Segredos configurados por variáveis de ambiente, sem credenciais no código.

## Configuração necessária antes de publicar
1. Crie um projeto Supabase e execute `supabase/schema.sql` no SQL Editor. Confirme que o bucket `medstudy-private` está privado.
2. No Stripe, configure os preços mensal e anual e copie seus Price IDs.
3. Crie um endpoint Stripe para `https://SEU-SERVICO.onrender.com/api/stripe/webhook`, assinando `customer.subscription.created`, `customer.subscription.updated` e `customer.subscription.deleted`.
4. Crie um Web Service Render a partir desta branch usando `render.yaml`. Configure as variáveis de ambiente conforme `.env.example`, incluindo chaves Supabase/Stripe e valores reais de apresentação dos planos.
5. Abra `/conta.html` no serviço Render e faça um cadastro de teste. Só depois de verificar fluxo de pagamento, webhook e acesso privado faça a troca do endereço em produção.

Não publique mídia na pasta do site, em Git, nem em bucket público: arquivos privados devem entrar pela biblioteca autenticada. O navegador antigo do site mantém flashcards em armazenamento local; a nova biblioteca é armazenada no Supabase.