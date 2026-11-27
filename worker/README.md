# IPTV Flow Worker

Serviço Node.js persistente que executa Chromium com Playwright para conduzir o fluxo público de atendimento da FUTEX. A interface fica na Vercel; este worker deve ficar em um serviço de servidor contínuo.

## Como funciona

1. Recebe do IPTV Flow o pedido para abrir uma sessão manual.
2. Abre a página pública da FUTEX em um Chromium persistente no servidor.
3. Lê as mensagens e opções do chatbot dentro do Shadow DOM e as envia ao painel.
4. O usuário digita as respostas no IPTV Flow; o worker encaminha cada mensagem à sessão real da FUTEX.
5. O painel consulta a conversa e apresenta as respostas seguintes, sem abrir o site no celular.
6. Quando a FUTEX exibe os dados do teste, o parser extrai os campos e o IPTV Flow mostra os botões de cópia.
7. Salva o histórico e a transcrição criptografada no diretório persistente configurado em `DATA_DIR`.

A automação não tenta resolver CAPTCHA, contornar bloqueios, autenticação, limites ou controles do site. Se a FUTEX alterar o fluxo ou exigir uma ação manual, a solicitação deve parar e sinalizar isso no painel.

## Rodar localmente

Requisitos: Node.js 22+.

No primeiro terminal:

```bash
cd worker
npm install
npx playwright install --with-deps chromium
cp .env.example .env
```

No arquivo `.env`, mantenha `NODE_ENV=development`, `API_TOKEN=` vazio, `DATA_ENCRYPTION_KEY=` vazio e `FUTEX_AUTOMATION_ENABLED=false` durante a configuração inicial. Depois:

```bash
npm run dev
```

No segundo terminal, na raiz do repositório:

```bash
npm install
npm run dev
```

O Vite encaminha `/api/worker/*` para `http://127.0.0.1:8787`. O worker aceita chamadas locais sem token somente em modo development.

## Verificar a página FUTEX

Com o worker iniciado, abra o IPTV Flow e vá a **Configurações → Diagnosticar FUTEX**. O diagnóstico abre a página pública e apenas lê o conteúdo inicial, sem clicar em botões, preencher dados de cliente ou iniciar um atendimento. Ele retorna:
- título e URL carregada;
- frames/iframes encontrados;
- textos visíveis;
- campos, botões e controles detectados.

Use o resultado para validar os seletores antes de habilitar a automação. O usuário final não precisa abrir a FUTEX: toda a navegação ocorre dentro do Chromium do worker. A página pode não expor o atendimento até que o próprio usuário abra o widget.

## Variáveis de ambiente do worker

| Variável | Obrigatória | Descrição |
|---|---:|---|
| `PORT` | Não | Porta HTTP, padrão 8787 |
| `NODE_ENV` | Produção | Em produção, exige `API_TOKEN` e `DATA_ENCRYPTION_KEY` |
| `DATA_DIR` | Recomendado | Diretório persistente para `jobs.json`; use `/data` com volume |
| `DATA_ENCRYPTION_KEY` | Sim em produção | Chave hexadecimal de 64 caracteres para criptografar nome, telefone e credenciais com AES-256-GCM |
| `API_TOKEN` | Sim em produção | Token aleatório com pelo menos 32 caracteres para autenticar a API |
| `OWNER_USERNAME` | Recomendado | Nome de usuário proprietário, padrão `1joaodev` |
| `AUTH_KEY_PEPPER` | Recomendado | Segredo estável com pelo menos 32 caracteres para gerar hashes das chaves de acesso; se omitido, usa `API_TOKEN` |
| `ALLOWED_ORIGINS` | Não | Origens permitidas pelo CORS; o proxy Vercel usa chamadas server-to-server |
| `FUTEX_URL` | Não | Página pública de teste |
| `FUTEX_AUTOMATION_ENABLED` | Sim para gerar | Começa como false; habilite somente depois da validação |
| `FUTEX_HEADLESS` | Não | true para Chromium sem janela |
| `MIN_SECONDS_BETWEEN_REQUESTS` | Não | Intervalo mínimo, padrão 30 segundos |
| `MAX_ACTIVE_SESSIONS` | Não | Sessões simultâneas, padrão 1 |
| `MAX_SESSION_MINUTES` | Não | Tempo máximo aguardando confirmação, padrão 30 |

Gere duas chaves independentes com `openssl rand -hex 32`: uma para `API_TOKEN` (use o mesmo valor em `WORKER_API_TOKEN` na Vercel) e outra para `DATA_ENCRYPTION_KEY`. A chave de criptografia protege nome, telefone e credenciais no arquivo `jobs.json`. Guarde-a com segurança e nunca a troque enquanto houver dados salvos. O armazenamento de autenticação fica em `auth.json` no mesmo volume: as senhas são derivadas com scrypt e as chaves de acesso são armazenadas somente como HMAC-SHA256. Defina `AUTH_KEY_PEPPER` como um segredo independente e estável; não o altere enquanto houver chaves emitidas, pois isso invalidaria as chaves ainda não utilizadas. Defina `OWNER_USERNAME=1joaodev`. Na Vercel, defina `ADMIN_USERNAME=1joaodev`, `APP_ACCESS_CODE` com pelo menos 32 caracteres aleatórios e `APP_SESSION_SECRET` com pelo menos 64 bytes aleatórios.

## Fluxo com interface própria

1. O usuário informa nome, WhatsApp, dispositivo e marca no formulário do IPTV Flow.
2. O painel envia esses dados a `POST /api/test-requests`.
3. O worker abre `FUTEX_URL` no Chromium, preenche os campos e seleciona as opções equivalentes no atendimento original.
4. Quando a FUTEX indica o aplicativo, o worker mantém a sessão aberta e o IPTV Flow mostra a recomendação ao usuário.
5. O usuário confirma se conseguiu instalar o aplicativo por `POST /api/test-requests/:id/app-confirmation`.
6. O worker continua o atendimento, aguarda a resposta final e extrai as credenciais com o parser.
7. O IPTV Flow exibe o resultado e permite copiar os campos individualmente ou em conjunto.

O usuário final vê apenas a interface própria do IPTV Flow. O site da FUTEX é utilizado pelo Chromium no servidor, sem ser incorporado ou aberto no celular.

## Endpoints

- `GET /health`: health check público de liveness usado pelo Railway.
- `GET /api/health`: estado autenticado do serviço e da automação.
- `POST /api/auth/login`: valida uma conta local.
- `POST /api/auth/register`: cria uma conta comum consumindo uma chave de acesso de uso único.
- `POST /api/auth/validate`: valida se a conta ainda está ativa e retorna seu papel atual.
- `GET /api/auth/keys` e `POST /api/auth/keys`: lista e gera chaves; somente proprietário e administradores.
- `POST /api/auth/keys/:id/revoke`: revoga uma chave ainda não utilizada.
- `GET /api/auth/users` e `POST /api/auth/users/role`: lista contas e promove/rebaixa administradores; somente proprietário.
- `GET /api/diagnostics/futex`: diagnóstico de leitura do site, sem enviar formulários.
- `POST /api/test-requests`: inicia uma solicitação com `{ "customerName", "contact", "device", "brand" }`.
- `GET /api/test-requests`: lista o histórico persistido.
- `GET /api/test-requests/:id`: consulta o andamento e o resultado de uma solicitação.
- `POST /api/test-requests/:id/app-confirmation`: recebe `{ "installed": true | false }` e responde imediatamente; o painel acompanha o processamento por polling.

Todas as rotas `/api` exigem `Authorization: Bearer <API_TOKEN>` em produção. A rota pública `/health` retorna apenas que o processo está vivo; os detalhes operacionais ficam em `/api/health`.

## Deploy do worker no Railway

1. Crie um projeto Railway e conecte este repositório.
2. Configure o **Root Directory** como `/worker`.
3. O Railway detectará o `Dockerfile` e instalará Chromium com as dependências de sistema.
4. Adicione um **Volume** montado em `/data`.
5. Configure as variáveis:
   - `NODE_ENV=production`
   - `PORT=8787`
   - `DATA_DIR=/data`
   - `DATA_ENCRYPTION_KEY=<chave hexadecimal de 64 caracteres>`
   - `API_TOKEN=<token aleatório com pelo menos 32 caracteres>`
   - `FUTEX_URL=https://futex.com.br/teste/`
   - `FUTEX_AUTOMATION_ENABLED=false` até concluir a validação
   - `FUTEX_HEADLESS=true`
   - `MIN_SECONDS_BETWEEN_REQUESTS=30`
   - `MAX_ACTIVE_SESSIONS=1`
   - `MAX_SESSION_MINUTES=30`
6. Gere um domínio público HTTPS para o serviço.
7. Confira `https://SEU-WORKER/health`.

Use somente uma réplica do worker nesta versão, pois as sessões do Chromium ficam na memória do processo. O histórico fica no volume. Se o worker reiniciar, solicitações que dependiam de uma sessão aberta passam para `needs_human`, porque uma sessão ativa de navegador não pode ser retomada após reinicialização.

## Deploy do painel na Vercel

1. Importe o mesmo repositório na Vercel.
2. Use o preset Vite e o comando `npm run build`.
3. Em **Environment Variables**, configure:
   - `WORKER_API_URL=https://SEU-WORKER.up.railway.app`
   - `WORKER_API_TOKEN=<o mesmo token de API_TOKEN>`
   - `APP_ACCESS_CODE=<código aleatório com pelo menos 32 caracteres>`
4. Faça o deploy.

A pasta `api/worker/[...path].js` é um proxy server-side. O navegador chama o mesmo domínio da Vercel e nunca recebe o token do worker. O painel pede o `APP_ACCESS_CODE`, que deve ter pelo menos 32 caracteres aleatórios e funciona como proteção simples para uso administrativo privado. Não crie variáveis `VITE_*` com chaves secretas.

## Testes e limites conhecidos

```bash
npm test
npm run check
cd ..
node --test tests/proxy.test.js
```

Os testes automatizados cobrem a extração de campos com formatos diferentes. Eles não substituem uma execução real no site. A FUTEX pode alterar textos, botões, frames ou o formato das mensagens; use o diagnóstico e valide o atendimento antes de ativar o processamento real.

O histórico é persistido em JSON no volume do worker; nome, telefone e credenciais são criptografados com AES-256-GCM antes da gravação. Registros antigos sem criptografia são migrados automaticamente na próxima persistência. As contas e chaves ficam em `auth.json`: senhas usam scrypt, chaves usam HMAC-SHA256 e cada chave pode ser resgatada uma única vez. A chave é mostrada somente no momento da geração; depois, a interface exibe apenas um prefixo. Administradores podem gerar e revogar chaves; somente o proprietário pode promover ou rebaixar administradores. Mantenha uma única réplica do worker para preservar as garantias de uso único e gravação serializada. Para alta disponibilidade e múltiplas réplicas, migre o armazenamento para PostgreSQL.
