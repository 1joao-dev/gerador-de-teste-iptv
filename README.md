# Gerador de Teste IPTV

Aplicação web mobile-first com uma interface de atendimento automatizado que se parece com uma conversa do WhatsApp. O cliente responde às perguntas por botões e recebe os dados do teste na própria conversa.

> A interface não abre o WhatsApp nem envia mensagens para ele. O chat é parte do próprio site.

## Fluxo implementado

1. O atendimento pergunta em qual aparelho o cliente deseja assistir.
2. Para Smart TV, pergunta a marca.
3. Para LG, apresenta o fluxo de instalação do Zuxo Player conforme a referência visual fornecida.
4. Pergunta se o aplicativo foi instalado.
5. Quando o cliente confirma, chama o endpoint configurado para gerar o teste.
6. Se o serviço retornar as credenciais, elas aparecem em uma mensagem dentro do chat, com opção de copiar.

As opções de aplicativo e os passos de outras marcas podem ser ajustados conforme o fluxo real de cada aparelho.

## Tecnologias

- React
- TypeScript
- Vite
- lucide-react
- CSS responsivo

## Executar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

## Integração com o gerador de testes

Configure `VITE_TEST_API_URL` com a URL completa do endpoint oficial que cria um teste.

O frontend envia uma requisição HTTP POST com este corpo:

```json
{
  "device": "Smart TV",
  "brand": "LG",
  "app": "Zuxo Player"
}
```

O endpoint deve responder com JSON contendo ao menos `username` e `password`. Os campos `code` e `duration` são opcionais:

```json
{
  "code": "CODIGO_FORNECIDO_PELO_PROVEDOR",
  "username": "USUARIO_GERADO",
  "password": "SENHA_GERADA",
  "duration": "6 horas"
}
```

As credenciais exibidas no chat vêm exclusivamente da resposta do endpoint. O frontend não inventa usuários, senhas ou códigos.

**Segurança:** não coloque tokens ou segredos privados em variáveis `VITE_*`, pois elas ficam disponíveis no navegador. Se o provedor exigir autenticação secreta, a chamada deve passar por um backend seguro.

## Scripts

- `npm run dev`: ambiente local
- `npm run build`: build de produção
- `npm run preview`: visualizar o build

## Próximas etapas

1. Receber a documentação ou URL da API oficial do provedor.
2. Adequar o corpo da requisição e o formato da resposta ao contrato real.
3. Completar os passos de instalação para Samsung, TCL, Sony, Philips, Panasonic, Philco, AOC, Roku e demais dispositivos.
4. Testar o fluxo completo em celular e desktop.
