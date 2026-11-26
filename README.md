# IPTV Flow — Control Center

Painel web mobile-first para organizar solicitações de testes IPTV e acompanhar um serviço de automação autorizado.

## O que existe nesta versão

- Dashboard com indicadores calculados a partir dos registros locais.
- Formulário de solicitação com seleção de dispositivo, marca e aplicativo.
- Histórico local com busca e detalhes.
- Configurações com estado explícito da integração.
- Layout responsivo para desktop e celular.
- Camada inicial de comunicação com uma API externa.

## Importante: estado atual da integração

A interface está funcional para navegação, seleção de opções, criação de rascunhos locais, pesquisa e visualização de registros. **Sem um backend configurado, o botão salva apenas um rascunho no navegador; nenhum teste é solicitado ou gerado.**

A integração real deve ser feita por um backend/worker separado. O frontend envia:

```http
POST /api/test-requests
Content-Type: application/json
```

Exemplo de corpo:

```json
{
  "customerName": "Cliente 01",
  "contact": "",
  "device": "Smart TV",
  "brand": "Samsung",
  "app": "IPTV Smarters Pro",
  "notes": ""
}
```

A interface espera um objeto de resposta com pelo menos `id`, `status` e `createdAt`. Credenciais opcionais só são exibidas se vierem da resposta real do backend:

```json
{
  "id": "request-id",
  "status": "queued",
  "createdAt": "2026-11-26T12:00:00.000Z",
  "username": "retornado-pelo-servico",
  "password": "retornado-pelo-servico",
  "code": "opcional",
  "duration": "opcional"
}
```

Para sincronizar o histórico, o backend também deve implementar:

```http
GET /api/test-requests
```

O endpoint pode retornar uma lista de solicitações ou um objeto `{ "items": [] }`.

## Arquitetura recomendada

- **Frontend:** React + TypeScript + Vite, hospedado na Vercel.
- **API e worker:** serviço Node.js separado, hospedado em Railway, Render ou VPS.
- **Automação:** Playwright executado no servidor, respeitando os controles de acesso, os limites e as regras do site FUTEX.
- **Banco de dados:** PostgreSQL/Supabase para histórico compartilhado e autenticação administrativa.

Não é recomendado executar um navegador Playwright persistente dentro de uma função serverless da Vercel. A Vercel pode hospedar a interface e encaminhar as chamadas para um worker externo.

## Variáveis de ambiente do frontend

Crie `.env.local`:

```env
VITE_API_BASE_URL=https://sua-api.example.com
```

A URL pode ser pública. **Não coloque tokens, senhas, cookies ou chaves privadas em variáveis `VITE_*`**, pois elas são incorporadas ao bundle do navegador.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Próximas etapas

1. Definir e implementar o backend real da integração autorizada com a FUTEX.
2. Configurar autenticação administrativa e banco de dados.
3. Implementar fila, estados de execução, tentativas e logs sem segredos.
4. Validar o fluxo ponta a ponta antes de liberar a geração real.
