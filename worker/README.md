# IPTV Flow Worker

Serviço Node.js separado da interface Vercel. O worker executa Chromium com Playwright e mantém a sessão do atendimento FUTEX enquanto aguarda a confirmação de instalação do aplicativo.

## Requisitos

- Node.js 20 ou superior.
- Um servidor persistente (VPS, Railway ou Render com processo web contínuo).
- Permissão para abrir o site FUTEX e usar o fluxo público de teste.

## Instalação local

No diretório `worker`:

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run dev
```

Configure `API_TOKEN`, `ALLOWED_ORIGINS` e revise as variáveis do FUTEX no arquivo `.env`.

A automação vem desativada por padrão. Primeiro execute o worker em ambiente de teste e confirme que os seletores do atendimento correspondem ao site atual. Só então defina `FUTEX_AUTOMATION_ENABLED=true`.

## API

- `GET /health`: estado do worker.
- `POST /api/test-requests`: inicia um atendimento.
- `GET /api/test-requests`: lista solicitações mantidas em memória.
- `GET /api/test-requests/:id`: consulta uma solicitação.
- `POST /api/test-requests/:id/app-confirmation`: envia `{ "installed": true | false }`.

As rotas em `/api` exigem `Authorization: Bearer <API_TOKEN>` quando o token está configurado. Em produção, o worker não inicia sem `API_TOKEN`.

## Limitações importantes

- Os registros e as sessões do navegador ficam em memória. Reiniciar o processo encerra sessões ativas e apaga o histórico do worker. Para uso contínuo, adicione banco de dados e fila persistente.
- Execute uma única instância do worker nesta primeira versão; sessões do navegador não são compartilhadas entre réplicas.
- O fluxo foi construído a partir das etapas e dos textos visíveis nas capturas fornecidas. Como o atendimento é dinâmico, os seletores precisam ser validados com uma execução real antes de ativar a automação.
- Não há tentativa de contornar CAPTCHA, bloqueios, autenticação ou limites do site. Se o site pedir uma ação manual ou mudar o fluxo, a automação deve parar e sinalizar a situação.
- Não faça solicitações em massa. O worker limita a uma sessão ativa por vez e aplica intervalo mínimo entre solicitações.

## Deploy

Publique este diretório como um serviço Node.js persistente. Comando de build: nenhum. Comando de start: `npm start`. Instale o Chromium no ambiente de deploy com:

```bash
npx playwright install --with-deps chromium
```

Configure as variáveis listadas em `.env.example`. No Vercel, defina `VITE_API_BASE_URL` para a URL pública deste worker e `VITE_API_TOKEN` com o mesmo token de acesso. Para um app multiusuário, substitua o token compartilhado por autenticação individual no backend.
