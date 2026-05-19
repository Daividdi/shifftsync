# ShiftSync — Workforce Manager

Sistema de gerenciamento de escalas de sábado com autenticação LDAP/Active Directory.

---

## 🗂️ Estrutura do Projeto

```
shiftsync/
├── backend/                   # API Node.js + Express + SQLite
│   ├── src/
│   │   ├── config/ldap.js     # Integração LDAP
│   │   ├── db/init.js         # Schema SQLite
│   │   ├── middleware/auth.js # JWT auth
│   │   └── routes/
│   │       ├── auth.js        # Login via LDAP
│   │       ├── users.js       # Usuários + sync LDAP
│   │       ├── groups.js      # Grupos / Times
│   │       ├── schedule.js    # Escalas + auto-schedule
│   │       ├── swaps.js       # Pedidos de troca
│   │       └── reports.js     # Relatórios
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── frontend/                  # React + Vite
│   ├── src/
│   │   ├── api/client.js      # Axios instance
│   │   ├── hooks/useAuth.jsx  # Auth context
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   └── UI.jsx         # Componentes reutilizáveis
│   │   └── pages/
│   │       ├── LoginPage.jsx
│   │       ├── Dashboard.jsx
│   │       ├── CalendarPage.jsx
│   │       ├── ScheduleManager.jsx
│   │       ├── SwapRequests.jsx
│   │       ├── GroupsManager.jsx
│   │       ├── UsersManager.jsx
│   │       └── Reports.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── Dockerfile
├── nginx/nginx.conf           # Proxy reverso
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚀 Deploy no Ubuntu (Docker)

### 1. Pré-requisitos

```bash
# Instalar Docker e Docker Compose
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Faça logout e login novamente para aplicar o grupo
```

### 2. Clonar / copiar o projeto

```bash
# Copie a pasta shiftsync para o servidor e entre nela
cd /opt
sudo cp -r /caminho/para/shiftsync .
cd /opt/shiftsync
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Preencha obrigatoriamente:

| Variável            | Descrição                                      | Exemplo                                  |
|---------------------|------------------------------------------------|------------------------------------------|
| `JWT_SECRET`        | Chave secreta longa e aleatória                | `abc123xyz...` (mín. 32 chars)           |
| `LDAP_URL`          | URL do servidor LDAP                           | `ldap://192.168.1.10:389`                |
| `LDAP_BIND_DN`      | DN da conta de serviço                         | `cn=svc-shiftsync,ou=svc,dc=empresa,dc=com` |
| `LDAP_BIND_PASSWORD`| Senha da conta de serviço                      | `senha_segura`                           |
| `LDAP_BASE_DN`      | Base de busca dos usuários                     | `ou=usuarios,dc=empresa,dc=com`          |
| `LDAP_FILTER`       | Filtro LDAP (AD: `(objectClass=user)`)         | `(objectClass=user)`                     |

Para **Active Directory**, use também:
```
LDAP_USERNAME_ATTR=sAMAccountName
LDAP_FULLNAME_ATTR=displayName
LDAP_EMAIL_ATTR=mail
LDAP_DEPT_ATTR=department
LDAP_TITLE_ATTR=title
```

Para **OpenLDAP**:
```
LDAP_USERNAME_ATTR=uid
LDAP_FULLNAME_ATTR=cn
LDAP_EMAIL_ATTR=mail
LDAP_DEPT_ATTR=departmentNumber
LDAP_TITLE_ATTR=title
LDAP_FILTER=(objectClass=inetOrgPerson)
```

### 4. Subir os containers

```bash
docker compose up -d --build
```

Aguarde o build (~2-3 min na primeira vez). Ao final:
- **Frontend:** http://seu-servidor
- **API:**       http://seu-servidor/api
- **Health:**    http://seu-servidor/api/health

### 5. Verificar logs

```bash
docker compose logs -f backend   # logs da API
docker compose logs -f frontend  # logs do Nginx frontend
```

---

## 👤 Primeiro acesso

1. Acesse `http://seu-servidor`
2. Faça login com suas credenciais corporativas (LDAP)
3. O primeiro usuário a fazer login terá role `employee` por padrão
4. Para tornar um usuário HR Admin, acesse o banco direto uma única vez:

```bash
# Abrir o banco SQLite
docker compose exec backend sh -c "sqlite3 /app/data/shiftsync.db"

# Dentro do sqlite3:
UPDATE users SET role = 'hr' WHERE username = 'seu.usuario';
.quit
```

Após isso, o HR pode promover outros usuários diretamente pela interface.

---

## 🔄 Operações comuns

### Reiniciar após atualizar código

```bash
docker compose up -d --build
```

### Backup do banco de dados

```bash
# O banco fica em ./backend/data/shiftsync.db
cp backend/data/shiftsync.db backup_$(date +%Y%m%d).db
```

### Parar / remover

```bash
docker compose down          # para os containers
docker compose down -v       # para e remove volumes
```

---

## 🛠️ Desenvolvimento local (sem Docker)

### Backend

```bash
cd backend
npm install
cp ../.env.example .env   # ajuste as variáveis
npm run dev               # inicia com nodemon na porta 3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev               # inicia Vite na porta 5173 (proxy para :3001)
```

Acesse: `http://localhost:5173`

---

## 🔐 Permissões

| Role       | Acesso                                                          |
|------------|-----------------------------------------------------------------|
| `hr`       | Tudo: usuários, grupos, escalas, aprovações, relatórios         |
| `leader`   | Ver/editar escalas do seu grupo, aprovar/rejeitar trocas        |
| `employee` | Ver calendário, criar pedidos de troca                          |

---

## 🌐 Configurar domínio (opcional)

Para usar com domínio real, edite `nginx/nginx.conf`:

```nginx
server_name shiftsync.suaempresa.com;
```

Para HTTPS com Let's Encrypt:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d shiftsync.suaempresa.com
# Depois adicione os certificados no nginx.conf
```

---

## 📦 Stack Técnica

| Camada     | Tecnologia                              |
|------------|-----------------------------------------|
| Frontend   | React 18 + Vite + Recharts + Lucide     |
| Backend    | Node.js 20 + Express 4                 |
| Banco      | SQLite (better-sqlite3) — sem dependências externas |
| Auth       | LDAP (ldapjs) + JWT                    |
| Deploy     | Docker Compose + Nginx                 |
