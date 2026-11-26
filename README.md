# IPTV Flow — Control Center

Painel web mobile-first para iniciar e acompanhar solicitações do atendimento público FUTEX.

## Estrutura

- `src/`: interface React + TypeScript + Vite.
- `api/worker/[...path].js`: proxy server-side da Vercel. Mantém a chave do worker fora do navegador.
- `worker/`: API Node.js, Playwright, parser dinâmico, testes e Dockerfile.

## Fluxo de atendimento

O painel coleta nome, WhatsApp, dispositivo e marca. O worker abre o atendimento FUTEX em Chromium no servidor, preenche as etapas e devolve a recomendação e as credenciais para o próprio IPTV Flow. O usuário não precisa abrir a FUTEX nem preencher o formulário novamente. Se o chatbot perguntar se o aplicativo foi instalado, a confirmação pode ser feita dentro do IPTV Flow ou avançada automaticamente por uma preferência salva no app.

O formato de credenciais não é fixo: o parser suporta rótulos dinâmicos como Código, Usuário, Senha, Servidor, MAC, PIN, Playlist, URL e também preserva o bloco final caso o site retorne dados sem rótulos.

## Arquitetura

- **Painel:** Vercel (Vite + React).
- **Proxy:** Vercel Function em `api/worker/[...path].js`.
- **Automação:** Playwright em um servidor persistente, recomendado Railway com Docker.
- **Histórico:** arquivo JSON em volume persistente do worker (`DATA_DIR=/data`), com nome, telefone e credenciais criptografados com AES-256-GCM.

Não execute Chromium em uma função serverless da Vercel. A Vercel hospeda o painel e o proxy; o worker precisa permanecer ativo para manter a sessão do navegador entre a indicação do aplicativo e a confirmação do usuário.

## Configuração da Vercel

Em **Project → Settings → Environment Variables**, adicione:

```env
WORKER_API_URL=https://SEU-WORKER.up.railway.app
WORKER_API_TOKEN=mesmo-token-configurado-no-worker
APP_ACCESS_CODE=chave-aleatoria-de-pelo-menos-32-caracteres
```

Gere `APP_ACCESS_CODE` com `openssl rand -hex 16` e mantenha-o privado. Não use prefixo `VITE_` nessas variáveis. O proxy lê os segredos no servidor e os injeta somente na chamada privada ao worker. O histórico de clientes e credenciais é carregado do servidor e não é salvo no armazenamento local do navegador. O painel solicita o `APP_ACCESS_CODE` em Configurações antes de consultar o backend. Não compartilhe esse código.

## Configuração do worker

Consulte [worker/README.md](worker/README.md) para criar o serviço Railway, configurar o volume e instalar Chromium.

Variáveis principais:

```env
NODE_ENV=production
PORT=8787
DATA_DIR=/data
DATA_ENCRYPTION_KEY=chave-hexadecimal-de-64-caracteres
API_TOKEN=token-aleatorio-longo
FUTEX_URL=https://futex.com.br/teste/
FUTEX_AUTOMATION_ENABLED=false
FUTEX_HEADLESS=true
MIN_SECONDS_BETWEEN_REQUESTS=30
MAX_ACTIVE_SESSIONS=1
MAX_SESSION_MINUTES=30
```

Gere duas chaves independentes com `openssl rand -hex 32`: uma para `API_TOKEN` (use o mesmo valor em `WORKER_API_TOKEN` na Vercel) e outra para `DATA_ENCRYPTION_KEY`. No Windows PowerShell, use `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` para cada chave. Esta segunda chave criptografa nome, telefone e credenciais no histórico persistido. Guarde-a com segurança e nunca a troque enquanto houver dados salvos. Mantenha `FUTEX_AUTOMATION_ENABLED=false` até executar o diagnóstico e validar o fluxo real.

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

No painel, acesse **Configurações → Verificar conexão** e depois **Diagnosticar FUTEX**. O diagnóstico lê a página e lista os frames, textos, inputs e botões encontrados sem enviar dados nem gerar teste.

Execute os testes do parser:

```bash
npm test --prefix worker
node --test tests/proxy.test.js
npm run check --prefix worker
npm run build
```

O build e os testes verificam a aplicação e a extração de formatos de credenciais. A interação real com a FUTEX ainda precisa ser validada no worker implantado, pois o site usa conteúdo dinâmico e pode mudar seletores ou exigir ações manuais.

## Fluxo somente pelo IPTV Flow

A tela do painel não incorpora nem abre a FUTEX no celular. Toda a navegação Playwright acontece no worker. A recomendação do aplicativo, o andamento e o resultado são exibidos dentro do IPTV Flow. Em **Configurações**, a opção **Avançar automaticamente após indicar o aplicativo** faz o worker responder “Sim” à pergunta de instalação sem intervenção por solicitação. Ative somente quando essa resposta corresponder ao uso real; se ficar desligada, a confirmação aparece dentro do próprio IPTV Flow.

## Segurança e limites

- Não há bypass de CAPTCHA, login, bloqueios, rate limits ou outras proteções do site.
- Uma sessão Playwright ativa por vez e intervalo mínimo de 30 segundos entre novas solicitações.
- Sessões expiram após 30 minutos de inatividade.
- Nome, telefone e credenciais são criptografados com AES-256-GCM antes de serem gravados no histórico do volume privado do worker. Proteja também as chaves e o volume.
- Reiniciar o worker encerra sessões abertas; as solicitações interrompidas ficam marcadas para ação manual.
- Para múltiplos usuários, migre o histórico para PostgreSQL e implemente autenticação individual.
