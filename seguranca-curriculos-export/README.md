# 🛡️ Segurança - Sistema de Currículos

Sistema web para gerenciamento seguro de currículos, desenvolvido como projeto acadêmico com foco em **Defesa de Aplicações Web**.

Backend em Node.js + Express com banco de dados Supabase (PostgreSQL).

---

## Tecnologias

- **Backend:** Node.js + Express
- **Banco de Dados:** Supabase (PostgreSQL na nuvem)
- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **Segurança:** Helmet, CSRF Tokens, Rate Limiting, Validação Dupla (client + server)

---

## Pré-requisitos

Antes de começar, você precisa ter instalado:

- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- [npm](https://www.npmjs.com/) (já vem com o Node.js)
- Uma conta gratuita no [Supabase](https://supabase.com/)

---

## Instalação e Configuração

### 1. Clone o repositório

```bash
git clone https://github.com/zFelixxxx/seguranca-curriculos.git
cd seguranca-curriculos/seguranca-curriculos-export
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o Supabase

#### 3.1 — Crie um projeto no Supabase

1. Acesse [https://supabase.com/](https://supabase.com/) e faça login (ou crie uma conta gratuita)
2. Clique em **"New Project"**
3. Escolha um nome e uma senha para o banco, depois clique em **"Create new project"**
4. Aguarde o projeto ser criado

#### 3.2 — Crie a tabela `curriculos`

1. No painel do Supabase, vá em **SQL Editor** (no menu lateral)
2. Cole e execute o seguinte SQL:

```sql
CREATE TABLE curriculos (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT NOT NULL,
  web_address TEXT,
  experiencia TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

3. Clique em **"Run"** para criar a tabela

#### 3.3 — Copie suas credenciais

1. No Supabase, vá em **Settings** → **API**
2. Copie os seguintes valores:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **`anon` public key** (em "Project API keys")
   - **`service_role` key** (em "Project API keys" — clique em "Reveal" para ver)

#### 3.4 — Configure o arquivo de credenciais

```bash
cp config.json.example config.json
```

Abra o arquivo `config.json` e preencha com suas credenciais:

```json
{
  "SUPABASE_URL": "https://SEU_PROJETO.supabase.co",
  "SUPABASE_SERVICE_ROLE_KEY": "SUA_SERVICE_ROLE_KEY_AQUI",
  "SUPABASE_ANON_KEY": "SUA_ANON_KEY_AQUI"
}
```

> ⚠️ **IMPORTANTE:** O arquivo `config.json` contém credenciais sensíveis e **não deve ser compartilhado**. Ele já está protegido pelo `.gitignore`.

### 4. Inicie o servidor

```bash
npm start
```

O servidor será iniciado em `http://localhost:3000`. Abra esse endereço no navegador.

---

## Estrutura do Projeto

```
├── server.js              # Servidor principal (Express + todas as proteções)
├── config.json.example    # Template de configuração (sem credenciais reais)
├── config.json            # Credenciais do Supabase (NÃO versionado)
├── package.json           # Dependências do projeto
├── security.log           # Log de eventos de segurança (NÃO versionado)
├── public/
│   ├── index.html         # Página principal (SPA)
│   ├── css/
│   │   └── style.css      # Estilos visuais
│   └── js/
│       └── app.js         # Lógica do frontend
└── .gitignore             # Arquivos ignorados pelo Git
```

---

## Medidas de Segurança Implementadas

| Proteção | Descrição |
|---|---|
| **Anti-XSS** | Sanitização de saída (`escapeHtml`), bloqueio de tags HTML na entrada, CSP via Helmet, DOM seguro (`textContent`) |
| **Anti-CSRF** | Token criptográfico por sessão, verificado em todas as rotas mutantes (POST/PUT/DELETE) |
| **Anti-Injeção** | Queries parametrizadas (Supabase SDK), validação de ID com regex, bloqueio de operadores NoSQL (`$`, `__proto__`) |
| **Headers HTTP** | Helmet com CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| **Rate Limiting** | 100 requisições por IP a cada 15 minutos nas rotas `/api/` |
| **CORS** | Bloqueio de origens cross-origin diferentes do host |
| **Validação Dupla** | Regex espelhados no client e server para todos os campos |
| **Cookies Seguros** | `httpOnly`, `secure`, `sameSite: Strict` |
| **Uploads** | Rota de upload bloqueada e logada |
| **Logging** | Registro de eventos suspeitos em arquivo local (não exposto) |

---

## Segurança do Repositório

- ✅ As credenciais do Supabase ficam em `config.json` — **não versionado**
- ✅ Logs de segurança (`security.log`) — **não versionados**
- ✅ Nenhuma chave ou token está exposta no código-fonte
- ✅ O `.gitignore` protege todos os arquivos sensíveis

---

## Licença

Projeto desenvolvido para fins acadêmicos — Disciplina de Segurança da Informação.

© 2026 Miguel Ribeiro. Licença Educacional.
