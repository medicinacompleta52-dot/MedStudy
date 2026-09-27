# MedStudy — Catálogo de Cursos Médicos no Google Drive

O MedStudy é uma plataforma para organizar e acessar cursos médicos, videoaulas, apostilas e materiais de apoio hospedados no Google Drive, com autenticação Supabase e controle de acesso por assinatura via Mercado Pago.

## Recursos Principais
- **Catálogo Geral de Cursos**: Interface moderna para explorar cursos divididos por ciclos (Básico, Clínico, Prática/Internato, Residência).
- **Proteção dos Links do Google Drive**: As URLs diretas das pastas no Google Drive ficam protegidas no backend. Visitantes ou usuários sem plano ativo não visualizam os links; apenas assinantes com conta confirmada e pagamento ativo recebem as URLs para abrir as pastas.
- **Autenticação com Supabase**: Cadastro e login seguro por e-mail e senha.
- **Assinaturas via Mercado Pago**:
  - **Mensal**: R$ 80 / mês
  - **Anual**: R$ 500 / ano
  - **Vitalício**: R$ 750 (pagamento único com liberação permanente)
- **Painel Administrativo**: Possibilidade de cadastrar novas pastas do Google Drive diretamente pela interface (`cursos.html` ou `conta.html`).

## Estrutura do Projeto
- `index.html`: Landing page moderna com apresentação dos ciclos e áreas médicas.
- `cursos.html`, `cursos.css`, `cursos.js`: Catálogo interativo de cursos do Google Drive com busca, filtros por ciclo e proteção de acesso.
- `conta.html`, `conta.css`, `conta.js`: Área do assinante (Login/Cadastro Supabase e Checkout Mercado Pago).
- `courses.json`: Base de dados dos cursos com títulos, categorias, materiais e URLs do Drive.
- `server.js`: Backend Node.js / Express com rotas de API seguras, verificação de JWT e webhooks.
- `supabase/schema.sql`: Script de criação das tabelas no banco de dados Supabase (`user_subscriptions` e `courses`).

## Como Rodar Localmente
1. Instale as dependências:
   ```bash
   pnpm install # ou npm install
   ```
2. Inicie o servidor:
   ```bash
   node server.js
   ```
3. Acesse `http://localhost:3000`.

## Configuração no Render / Produção
Configure as seguintes variáveis de ambiente no Render (conforme `.env.example`):
- `APP_URL`: URL da sua aplicação no Render (ex: `https://medstudy-secure.onrender.com`)
- `SUPABASE_URL`: URL do projeto no Supabase
- `SUPABASE_ANON_KEY`: Chave anônima pública do Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Chave secreta de serviço do Supabase
- `MP_ACCESS_TOKEN`: Token de acesso de produção ou teste do Mercado Pago
- `MP_WEBHOOK_SECRET`: Segredo do Webhook do Mercado Pago
