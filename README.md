# IPTV Flow — Control Center

Painel web mobile-first para iniciar e acompanhar solicitações do atendimento público FUTEX.

## Estrutura

- `src/`: interface React + TypeScript + Vite.
- `api/worker.js`: proxy server-side da Vercel. Mantém a chave do worker fora do navegador.
- `worker/`: API Node.js, Playwright, parser dinâmico, testes e Dockerfile.

## Fluxo de atendimento

O usuário preenche nome, WhatsApp, dispositivo e marca no formulário próprio do IPTV Flow e clica em **Gerar teste grátis**. O worker abre o site original da FUTEX em Chromium no servidor, informa os dados e segue o atendimento para solicitar o teste. Se a FUTEX indicar um aplicativo, o IPTV Flow apresenta essa orientação e pede a confirmação de instalação ao usuário. Quando a FUTEX retorna o teste, o parser extrai os campos de acesso e o app mostra as credenciais com botões de cópia. O usuário utiliza somente a interface do IPTV Flow; o site FUTEX fica em segundo plano.

O formato de credenciais não é fixo: o parser suporta rótulos dinâmicos como Código, Usuário, Senha, Servidor, MAC, PIN, Playlist, URL e também preserva o bloco final caso o site retorne dados sem rótulos.

## Arquitetura

- **Painel:** Vercel (Vite + React).
- **Proxy:** Vercel Function em `api/worker.js`, com rota fixa e caminho da API encaminhado por query string.
- **Automação:** Playwright em um servidor persistente, recomendado Railway com Docker.
- **Histórico:** arquivo JSON em volume persistente do worker (`DATA_DIR=/data`), com nome, telefone e credenciais criptografados com AES-256-GCM.

Não execute Chromium em uma função serverless da Vercel. A Vercel hospeda o painel e o proxy; o worker precisa permanecer ativo para manter a sessão do navegador entre a indicação do aplicativo e a confirmação do usuário.

## Configuração da Vercel

Em **Project → Settings → Environment Variables**, adicione:

```env
WORKER_API_URL=https://SEU-WORKER.up.railway.app
WORKER_API_TOKEN=mesmo-token-configurado-no-worker
APP_ACCESS_CODE=senha-forte-do-proprietario-de-pelo-menos-32-caracteres
APP_SESSION_SECRET=segredo-aleatorio-com-pelo-menos-64-bytes
ADMIN_USERNAME=1joaodev
```

Gere `APP_ACCESS_CODE` com `openssl rand -hex 32` e `APP_SESSION_SECRET` com `openssl rand -hex 64`. Mantenha ambos privados e diferentes. `ADMIN_USERNAME=1joaodev` identifica a conta proprietária, que usa `APP_ACCESS_CODE` como senha principal. Não use prefixo `VITE_` nas variáveis secretas. O cadastro público exige uma chave interna de uso único gerada no próprio painel por um proprietário ou administrador. As senhas de todas as contas comuns exigem pelo menos 8 caracteres, uma maiúscula, um número e um símbolo; a força aparece como Fraca, Média ou Forte. As senhas são armazenadas com scrypt e as chaves de acesso somente como hashes HMAC no volume persistente do worker. Administradores podem gerar, consultar e revogar chaves; somente o proprietário pode promover ou rebaixar administradores. As sessões usam cookie `HttpOnly; Secure; SameSite=Strict` com validade de 4 horas. O worker valida o papel atual em cada requisição e cada usuário vê somente seus próprios testes, enquanto administradores veem todos. Configure as variáveis em Production e Preview e faça um novo deploy após alterar qualquer segredo.

## Configuração do worker

Consulte [worker/README.md](worker/README.md) para criar o serviço Railway, configurar o volume e instalar Chromium.

Variáveis principais:

```env
NODE_ENV=production
PORT=8787
DATA_DIR=/data
DATA_ENCRYPTION_KEY=chave-hexadecimal-de-64-caracteres
API_TOKEN=token-aleatorio-longo
OWNER_USERNAME=1joaodev
AUTH_KEY_PEPPER=segredo-estavel-com-pelo-menos-32-caracteres
FUTEX_URL=https://futex.com.br/teste/
FUTEX_AUTOMATION_ENABLED=false
FUTEX_HEADLESS=true
MIN_SECONDS_BETWEEN_REQUESTS=30
MAX_ACTIVE_SESSIONS=1
MAX_SESSION_MINUTES=30
```

Gere uma chave para `API_TOKEN` e use o mesmo valor em `WORKER_API_TOKEN` na Vercel; gere outra para `DATA_ENCRYPTION_KEY` e uma terceira para `AUTH_KEY_PEPPER`. Use `openssl rand -hex 32` para cada uma. No Windows PowerShell, use `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`. `DATA_ENCRYPTION_KEY` protege nome, telefone e credenciais no histórico. `AUTH_KEY_PEPPER` protege os hashes das chaves de acesso; mantenha-o estável enquanto houver chaves não resgatadas. Defina `OWNER_USERNAME=1joaodev` e mantenha-o igual a `ADMIN_USERNAME` na Vercel. Mantenha `FUTEX_AUTOMATION_ENABLED=false` até executar o diagnóstico e validar o fluxo real.

## Desenvolvimento local

Terminal 1:

```bash
cd worker
npm install
npx playwright install --with-deps chromium
cp .env.example .env
npm run dev
```

Terminal 2, na raiz:

```bash
npm install
npm run dev
```

O Vite encaminha `/api/worker/*` ao worker local em `127.0.0.1:8787`. Em desenvolvimento, deixe `API_TOKEN` vazio e `NODE_ENV=development`.

## Validação

No painel, acesse **Configurações → Verificar conexão** e depois **Diagnosticar FUTEX**. O diagnóstico lê a página e lista os frames, textos, inputs e botões encontrados sem enviar dados nem gerar teste. Depois de configurar o worker, faça uma solicitação real de teste para validar o fluxo completo.

Execute os testes do parser:

```bash
npm test --prefix worker
node --test tests/proxy.test.js
npm run check --prefix worker
npm run build
```

O build e os testes verificam a aplicação e a extração de formatos de credenciais. A interação real com a FUTEX ainda precisa ser validada no worker implantado, pois o site usa conteúdo dinâmico e pode mudar seletores ou exigir ações manuais.

## Fluxo somente pelo IPTV Flow

A tela do painel usa o formulário e a identidade visual do IPTV Flow. O worker mantém o navegador remoto da FUTEX e executa o atendimento com os dados fornecidos no formulário. A confirmação de instalação continua sendo feita pelo usuário dentro do IPTV Flow.

## Diagnóstico real da FUTEX

O workflow **FUTEX live diagnostic** abre o portal em um Chromium isolado, identifica o campo de mensagem e lê as mensagens renderizadas no Shadow DOM do chatbot. Ele não envia nome ou telefone e não gera um teste. O relatório fica como artefato na execução do GitHub Actions por 3 dias. Para executar novamente, use **Actions → FUTEX live diagnostic → Run workflow**.

## Segurança e limites

- Não há bypass de CAPTCHA, login, bloqueios, rate limits ou outras proteções do site.
- Uma sessão Playwright ativa por vez e intervalo mínimo de 30 segundos entre novas solicitações.
- Sessões expiram após 30 minutos de inatividade.
- Nome, telefone e credenciais são criptografados com AES-256-GCM antes de serem gravados no histórico do volume privado do worker. Proteja também as chaves e o volume.
- Reiniciar o worker encerra sessões abertas; as solicitações interrompidas ficam marcadas para ação manual.
- Contas comuns são criadas com uma chave interna de uso único e recebem o papel `user`; a conta proprietária `1joaodev` continua protegida por `APP_ACCESS_CODE`.
- Somente o proprietário pode promover contas existentes a administradoras; o cadastro público nunca permite escolher o papel administrativo.
- O histórico do worker é filtrado por usuário; contas comuns não conseguem consultar solicitações de outras contas.
- As chaves são armazenadas como HMAC-SHA256, exibidas integralmente somente uma vez e podem ser revogadas antes do resgate.
