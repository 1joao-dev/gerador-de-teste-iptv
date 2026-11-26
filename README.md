# Gerador de Teste IPTV

Aplicação web mobile-first para receber solicitações de teste IPTV e encaminhá-las ao atendimento pelo WhatsApp.

## Status

Primeira versão em desenvolvimento. O formulário prepara uma mensagem com os dados do cliente; a liberação das credenciais deve ser feita por um provedor autorizado ou por uma integração oficial de API.

## Tecnologias

- React
- TypeScript
- Vite
- CSS responsivo

## Executar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

Configure no arquivo `.env` o número de WhatsApp do atendimento:

```env
VITE_WHATSAPP_NUMBER=55DDDNUMERO
```

Use somente números, incluindo código do país e DDD. Exemplo de formato: `5511999999999`.

## Scripts

- `npm run dev`: ambiente local
- `npm run build`: build de produção
- `npm run preview`: visualizar o build

## Próximas etapas

1. Configurar o WhatsApp oficial do atendimento.
2. Validar o fluxo de solicitação em celular.
3. Integrar, se disponível, a API autorizada do provedor para liberação automática de testes.
4. Adicionar painel administrativo e persistência de solicitações.
