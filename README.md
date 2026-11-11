# MO EVENTOS

Plataforma web para descoberta de eventos, gestão de organizadores, emissão de ingressos e convites, validação por QR Code e consulta de relatórios.

**Stack:** React, TypeScript, Vite, Supabase, PostgreSQL, Recharts e QRCode.

## 1. Requisitos

- Node.js 20 ou superior;
- npm;
- Conta e projecto no Supabase (opcional para explorar o modo de demonstração).

## 2. Instalação local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:5173`.

No Windows PowerShell, para copiar o ficheiro de ambiente:

```powershell
Copy-Item .env.example .env.local
```

Sem credenciais Supabase, a aplicação abre em **modo de demonstração**, com dados fictícios em memória. Os dados de demonstração não são persistentes. Nesta entrega, o início de sessão Supabase está ligado, mas os módulos de eventos, convidados e relatórios ainda usam dados locais de demonstração; a ligação CRUD completa à base de dados é uma etapa de integração.

## 3. Ligar ao Supabase

1. Crie um projecto no Supabase.
2. Abra **Project Settings → API**.
3. Copie a Project URL e a chave `anon`/publishable.
4. Coloque os valores em `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. No SQL Editor do Supabase, execute por ordem os ficheiros em `supabase/migrations/`.
6. Active o serviço de autenticação por correio electrónico.
7. Crie o primeiro utilizador através de Authentication → Users.
8. Promova esse utilizador a administrador, executando o comando indicado no final de `001_initial_schema.sql`, substituindo o UUID.

**Nunca** coloque a chave `service_role` numa variável `VITE_*`, no front-end, no Git ou neste projecto.

## 4. Funcionalidades incluídas

- Dashboard com indicadores e gráfico de entradas;
- Área pública de descoberta de eventos;
- Eventos públicos e privados;
- Criação, edição e remoção de eventos (modo demonstração);
- Gestão de convidados e emissão de convites;
- QR Code único por convite;
- Validação por leitura através da câmara (quando o navegador suporta) ou por código;
- Verificação da associação do ingresso ao evento seleccionado;
- Prevenção de reutilização através de validação transaccional no PostgreSQL;
- Registo de leituras aceites e recusadas;
- Relatórios e histórico de validações;
- Estrutura de perfis e associação de operadores a eventos;
- Personalização inicial do bilhete através de imagem de fundo e QR dinâmico.

## 5. Limites desta versão

Esta entrega é um **MVP de interface e arquitectura**, não uma plataforma comercial pronta para produção. A leitura real pela câmara, CRUD persistente dos módulos, envio de bilhetes, pagamentos e gestão de utilizadores por Edge Function ainda necessitam de implementação e testes. Antes de lançar:
- implementar e testar o fluxo de pagamentos com um prestador autorizado;
- criar o fluxo seguro de convite/criação de utilizadores através de Edge Function;
- configurar envio de correio electrónico;
- validar políticas RLS com contas de cada perfil;
- configurar armazenamento privado/público de imagens;
- testar concorrência, cópias de segurança e recuperação;
- rever requisitos legais, fiscais, privacidade e tratamento de dados em Angola.

A compra de ingressos e o pagamento ainda não estão ligados a um gateway. Não considere um pedido como pago sem confirmação server-side do prestador.

## 6. Estrutura

```text
mo-eventos/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   ├── data/
│   ├── lib/
│   ├── types/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── supabase/
│   ├── migrations/
│   └── functions/
├── .env.example
├── .gitignore
├── config.js
├── index.html
├── package.json
└── README.md
```

## 7. Segurança

- O navegador utiliza apenas a chave pública `anon`/publishable.
- As políticas RLS limitam o acesso às linhas autorizadas.
- A função `validate_ticket` valida o evento e marca o ingresso como utilizado numa única transacção.
- A função de validação é executada com a identidade autenticada do operador.
- As permissões de administrador devem ser atribuídas por um administrador de base de dados ou por uma função server-side protegida.

## 8. Comandos

```bash
npm run dev       # desenvolvimento
npm run typecheck # verificação TypeScript
npm run build     # compilação de produção
npm run preview   # pré-visualizar build
```

## Créditos

Concepção, identidade visual e desenvolvimento do projecto: **Rivaldo Abel**.

© 2026 MO EVENTOS. Todos os direitos reservados.
