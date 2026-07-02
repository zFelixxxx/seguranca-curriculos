# Segurança - Sistema de Currículos

Sistema web para gerenciamento seguro de currículos, com backend em Node.js e banco de dados Supabase.

## Tecnologias

- **Backend:** Node.js + Express
- **Banco de Dados:** Supabase (PostgreSQL)
- **Frontend:** HTML, CSS, JavaScript

## Instalação

1. Clone o repositório:
   ```bash
   git clone https://github.com/zFelixxxx/seguranca-curriculos.git
   cd seguranca-curriculos
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   - Copie o arquivo `config.json.example` para `config.json`
   - Preencha com suas credenciais do Supabase:
   ```bash
   cp config.json.example config.json
   ```

4. Inicie o servidor:
   ```bash
   npm start
   ```

## Estrutura do Projeto

```
├── server.js              # Servidor principal (Express)
├── config.json.example    # Template de configuração
├── package.json           # Dependências do projeto
├── public/
│   ├── index.html         # Página principal
│   ├── css/
│   │   └── style.css      # Estilos
│   └── js/
│       └── app.js         # JavaScript do frontend
└── .gitignore             # Arquivos ignorados pelo Git
```

## Segurança

- As credenciais do Supabase ficam em `config.json` (não versionado)
- O banco de dados local SQLite é ignorado pelo Git
- Logs de segurança não são enviados ao repositório
