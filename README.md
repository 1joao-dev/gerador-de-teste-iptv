# IPTV Flow — Control Center

Painel web mobile-first para organizar solicitações de testes IPTV e acompanhar um serviço de automação autorizado.

## O que existe nesta versão

- Dashboard com indicadores calculados a partir dos registros locais.
- Fluxo baseado nas etapas observadas na FUTEX: nome, WhatsApp, onde vai assistir, marca, confirmação de instalação do aplicativo recomendado e exibição das credenciais.
- Histórico local com busca e detalhes.
- Configurações com estado explícito da integração.
- Layout responsivo para desktop e celular.
- Camada inicial de comunicação com uma API externa.

## Importante: estado atual da integração

A interface está funcional para navegação, seleção das opções de dispositivo e marca observadas nas capturas, criação de rascunhos locais, pesquisa, confirmação de instalação do aplicativo recomendado (quando a API retornar essa etapa) e apresentação de campos de acesso dinâmicos retornados pelo backend. **Sem backend configurado, o sistema salva apenas um rascunho; não gera credenciais.**

A integração real deve ser feita por um backend/worker separado. O frontend envia:

```http
POST /api/test-requests
Content-Type: application/json
```

Exemplo de corpo:

```json
{
  "customerName": "Cliente 01",
  "contact": "(11) 99999-9999",
  "device": "Smart TV",
  "brand": "Samsung"
}
```

A interface espera um objeto de resposta com pelo menos `id`, `status` e `createdAt`. Credenciais opcionais só são exibidas se vierem da resposta real do backend:

```json
{
  "id": "request-id",
  "status": "awaiting_app",
  "createdAt": "2026-11-26T12:00:00.000Z",
  "recommendedApp": "Zuxo Player",
  "appGuideUrl": "https://endereco-do-tutorial",
  "message": "Instale o aplicativo indicado e confirme para continuar."
}
```


Após a pessoa confirmar que conseguiu instalar o aplicativo, o frontend envia:

```http
POST /api/test-requests/{id}/app-confirmation
Content-Type: application/json
```

```json
{ "installed": true }
```

A interface consulta o andamento de uma solicitação em aberto por:

```http
GET /api/test-requests/{id}
```

O formato de acesso muda conforme o dispositivo e o aplicativo. Por isso, o frontend não presume que todo teste terá Código Uniplay, usuário e senha. O backend deve normalizar os dados retornados pela FUTEX em uma lista dinâmica `accessDetails`, com o rótulo e o valor de cada campo. Assim, o app exibe e permite copiar somente os campos que realmente vierem na resposta.

Exemplo ilustrativo de resposta (os campos e valores reais dependem do dispositivo escolhido e do retorno da FUTEX):

```json
{
  "id": "request-id",
  "status": "completed",
  "device": "Smart TV",
  "brand": "LG",
  "recommendedApp": "Aplicativo retornado pela FUTEX",
  "resultTitle": "Dados do seu teste",
  "duration": "6 horas",
  "accessDetails": [
    { "label": "Código", "value": "valor-retornado-pela-futex" },
    { "label": "Usuário", "value": "usuario-retornado-pela-futex" },
    { "label": "Senha", "value": "senha-retornada-pela-futex" }
  ],
  "message": "Orientação retornada pela FUTEX."
}
```

Se um tipo de aparelho retornar URL, MAC, PIN, playlist ou outros dados, o backend envia esses mesmos itens em `accessDetails` com rótulos adequados. Não é necessário alterar a interface para cada novo formato. Os campos antigos `code`, `username` e `password` continuam aceitos para compatibilidade.

Para sincronizar o histórico, o backend também deve implementar:

```http
GET /api/test-requests
```

O endpoint pode retornar uma lista de solicitações ou um objeto `{ "items": [] }`.

## Arquitetura recomendada

- **Frontend:** React + TypeScript + Vite, hospedado na Vercel.
- **API e worker:** serviço Node.js em `worker/`, hospedado em Railway, Render ou VPS.
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

1. Instalar e validar o serviço Playwright disponível em `worker/` com uma solicitação real controlada; ajustar seletores caso o atendimento do site tenha mudado.
2. Configurar autenticação administrativa e banco de dados.
3. Implementar fila, estados de execução, tentativas e logs sem segredos.
4. Validar o fluxo ponta a ponta antes de liberar a geração real.


## Worker Playwright

O primeiro esqueleto da automação está em `worker/`. Consulte [worker/README.md](worker/README.md) para instalação, variáveis de ambiente, endpoints e limitações. A automação permanece desativada por padrão até a validação do fluxo real.
