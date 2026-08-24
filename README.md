# Demo: HubSpot dentro do Zoom Contact Center

Painel lateral (Zoom App) que aparece no Agent Desktop do Zoom Contact Center e
mostra automaticamente o contato, pedidos e chamados do HubSpot referentes ao
cliente do atendimento em andamento — sem o agente trocar de aba. O agente
também consegue **editar telefone/cidade do contato** e **registrar uma nota
do atendimento** direto no HubSpot, sem sair do painel.

Feito para demo: sem OAuth, sem autenticação forte, sem branding corporativo.
O token do HubSpot fica só no backend (nunca no navegador).

## Como funciona

1. O app roda como um "Zoom App" carregado dentro do Contact Center (painel na
   Agent Desktop).
2. No load, ele chama `zoomSdk.config()` pedindo as capabilities de
   engagement: `getEngagementContext`, `getEngagementStatus`,
   `onEngagementContextChange`, `onEngagementStatusChange`.
3. Quando o agente assume um atendimento, o Zoom entrega o `engagementContext`
   (inclui o `engagementId` e, dependendo do canal, e-mail/telefone do
   cliente).
4. O front chama `GET /api/customer?email=...&phone=...` no backend.
5. O backend busca o contato no HubSpot (`/crm/v3/objects/contacts/search`) e
   os negócios/tickets associados, e devolve um JSON enxuto.
6. O painel troca de conteúdo automaticamente a cada novo atendimento
   (`onEngagementContextChange`) e limpa ao encerrar (`onEngagementStatusChange`
   com `state === 'end'`).

Fora do Zoom (ex.: abrindo o `index.html` direto no navegador para testar
visual), o app cai em "modo de pré-visualização" com dados fictícios.

## Rodando localmente

```bash
cd zoom-hubspot-cc-app
npm install
cp env-example.txt .env
# edite o .env e cole o HUBSPOT_TOKEN (private app do HubSpot, já usado no
# MCP/ZVA da Mooz serve se tiver escopo de leitura em contacts/deals/tickets)
npm start
```

Isso sobe o servidor em `http://localhost:3000`. Abra essa URL no navegador
para ver o modo de pré-visualização.

Para carregar dentro do Zoom, você precisa de uma URL HTTPS pública. Duas opções:

**Opção A — ngrok (rápido, mas exige seu computador ligado)**

```bash
npx ngrok http 3000
```

Copie a URL HTTPS gerada (algo como `https://xxxx.ngrok-free.app`). Ela muda
a cada restart do ngrok (no plano grátis), então é preciso atualizar Home URL
e Domain Allow List no Marketplace toda vez.

**Opção B — Render (recomendado: URL fixa, não depende da sua máquina)**

1. Suba a pasta `zoom-hubspot-cc-app` para um repositório no GitHub (pode ser
   público — não tem segredo nenhum no código, o token fica só em variável de
   ambiente no Render, nunca no repo).
2. Em [render.com](https://render.com), crie uma conta grátis (sem cartão) e
   clique em **New > Web Service**.
3. Conecte o repositório (ou, se preferir não conectar sua conta GitHub ao
   Render, use **New > Blueprint** apontando pro repo — ele lê o
   `render.yaml` já incluído neste projeto).
4. Configurações do Web Service (se for criar manualmente, sem o blueprint):
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Em **Environment**, adicione as variáveis `HUBSPOT_TOKEN` e
   `HUBSPOT_PORTAL_ID` (os mesmos valores que iriam no `.env` local — ver
   `env-example.txt`). Não é preciso setar `PORT`, o Render define
   automaticamente e o `server.js` já respeita `process.env.PORT`.
6. Deploy. Ao terminar, o Render te dá uma URL fixa tipo
   `https://zoom-hubspot-cc-app.onrender.com` — essa é a URL que entra no
   Home URL / Domain Allow List do Marketplace, e não muda mais.

**Atenção (plano free do Render):** o serviço "dorme" depois de ~15 min sem
tráfego, e a primeira requisição depois disso demora uns 30-50s pra acordar
(cold start). Numa demo ao vivo, vale abrir o painel manualmente uns minutos
antes pra "acordar" o servidor, ou considerar o plano pago se isso for um
problema.

## Cadastrando o app no Zoom Marketplace

Já confirmamos que você tem acesso ao dev portal
(`marketplace.zoom.us/develop/create`, logado como leandro.martini@me.com).
Os passos abaixo seguem o material oficial "Zoom Apps for ZCC Developer
Overview" (Zoom, mar/2026):

1. **Develop > Build App > General App.**
2. Na aba **Production > Basic Information**, selecione **User-Managed app**
   — é obrigatório para o app renderizar dentro da Agent Desktop do ZCC.
3. Em **OAuth Information**, configure o endpoint OAuth do seu backend
   (usado quando o app é instalado na conta).
4. Em **Features > Surface**, marque **Zoom Contact Center** como produto
   suportado. Em **Home URL**, cole a URL do ngrok (ex.:
   `https://xxxx.ngrok-free.app`). Em **Domain Allow List**, adicione o
   domínio do ngrok (sem `https://`) e `appssdk.zoom.us`.
5. Ainda em **Surface > In-client App Features**, ative o **Zoom Apps SDK**
   e clique **+ Add APIs** para declarar exatamente as APIs/eventos abaixo
   (lista recomendada pela Zoom para ZCC — já são as mesmas declaradas no
   `index.html`):

   | | APIs | Eventos |
   |---|---|---|
   | **Core** | `getSupportedJsApis`, `getRunningContext`, `expandApp`, `authorize`, `promptAuthorize`, `getAppContext`, `appPopout` | `onAppPopout`, `onExpandApp`, `onAuthorized`, `onRunningContextChange` |
   | **Zoom Contact Center** | `getEngagementContext`, `getEngagementStatus`, `getAppVariableList`, `getEngagementVariableValue` | `onEngagementContextChange`, `onEngagementStatusChange`, `onEngagementVariableValueChange` |

6. Na aba **Scopes**, adicione os escopos que o Marketplace associar
   automaticamente às capabilities acima. Para uma demo não é necessário
   `user:read:user` (usado para identificar o agente via OAuth) — dá pra
   pular já que não vamos fazer autenticação forte.
7. Continue até **App Listing** (nome + ícone do app — aparece pro agente na
   Contact Center Desktop) e depois **Beta Test**. Clique em **Preview Your
   App Listing Page** para instalar o app na sua própria conta.
8. **App privado (recomendado para essa demo):** como o app só será usado
   internamente, não é preciso publicar no Marketplace nem passar pelo
   processo de revisão — apps privados só podem ser instalados na conta onde
   foram criados, o que é suficiente aqui.
9. Depois de instalado, ainda faltam dois passos de admin fora do dev
   portal, também descritos no material: **assign the app aos usuários do
   Contact Center** (Marketplace > Manage) e **assign the app à(s)
   Queue(s)** (Contact Center Management). Esse último passo **requer a
   feature flag de conta "Enable ZCC Zoom Apps Integration"** — se ela não
   aparecer disponível em Contact Center Management, provavelmente precisa
   ser habilitada pelo suporte/CSM da Zoom antes de continuar. **Vale
   confirmar isso primeiro**, antes de investir tempo no resto — é o maior
   risco de bloqueio que identifiquei até agora.
10. Abra o Zoom Contact Center Agent Desktop, fique disponível e receba (ou
    simule) um atendimento de um contato que exista no HubSpot com o mesmo
    e-mail/telefone. O painel aparece à direita do engagement.

**Sobre onde o painel aparece:** hoje o app é exibido como painel lateral à
direita do engagement (isso já resolve o problema de trocar de aba). Existe
também um "Agent Workspace" novo — painel cheio, dedicado — mas ele depende
do Zoom Workplace App client 7.2, previsto para 20/set/2026; não é pré-
requisito para essa demo.

**Ponto de atenção sobre identificar o cliente:** o formato exato de
`EngagementContext`/`EngagementStatus` (onde vem e-mail/telefone do
consumidor) pode variar por canal (chat vs. voz vs. vídeo) — a documentação
de referência não detalha o schema campo a campo. O `index.html` já tenta
`engagementContext` e `engagementStatus`, e cai para `getEngagementVariableValue`
(variáveis do Flow do ZCC) como último recurso — útil se o Flow já captura
e-mail/telefone do cliente via IVR/formulário antes de rotear pro agente.
Na primeira sessão real, vale abrir o DevTools do painel (se disponível no
client) e conferir o payload pra ajustar os nomes de campo em
`extractIdentifier()`.

## Escrevendo de volta no HubSpot (edição de contato + nota do atendimento)

Sim, dá pra atualizar dados no HubSpot a partir do painel — o Zoom App é só
uma página web rodando dentro do client, então qualquer chamada que o
JavaScript da página faça (para o seu próprio backend, que por sua vez chama
a API do HubSpot) funciona normalmente durante a chamada.

O demo já inclui dois fluxos de escrita:

- **Editar telefone/cidade do contato** — `PATCH /api/customer/:contactId` →
  `PATCH /crm/v3/objects/contacts/{id}` no HubSpot.
- **Registrar nota do atendimento** — `POST /api/customer/:contactId/notes` →
  cria um objeto Note no HubSpot e associa ao contato (a nota já vem
  prefixada com o `engagementId`, pra rastrear de qual atendimento ela veio).

Pra isso funcionar, o token do HubSpot (private app) precisa ter os escopos
de escrita `crm.objects.contacts.write` e `crm.objects.notes.write`, além dos
escopos de leitura já usados na consulta (ver `env-example.txt`).

**Dá pra ir além, se fizer sentido pro fluxo:** mesmo padrão serve para
atualizar negócios (`crm.objects.deals.write` — ex.: mudar estágio do pedido
durante a ligação), tickets (`crm.objects.tickets.write` — ex.: fechar ou
reabrir o chamado), ou criar um novo negócio/ticket na hora. É só adicionar
outro endpoint no `server.js` seguindo o mesmo modelo.

## Limitações conhecidas (aceitáveis para demo)

- Sem cache — cada troca de atendimento dispara uma nova busca no HubSpot.
- Sem paginação — mostra só os últimos negócios/tickets associados (limite de
  10).
- **Sem autenticação entre o front e o backend.** O token HubSpot fica seguro
  no servidor, mas qualquer um com acesso à URL do ngrok pode chamar os
  endpoints — inclusive os de escrita (`PATCH`/`POST`). Pra uma demo interna
  atrás de uma URL não divulgada, o risco é baixo; antes de usar com dados
  reais de clientes ou deixar rodando por mais tempo, vale adicionar alguma
  verificação (checar o `x-zoom-app-context` que o Zoom envia, ou um token
  simples compartilhado entre o front e o backend).
- Sem confirmação/undo nas escritas — o clique salva direto, sem tela de
  "tem certeza?". Fine para demo; num fluxo real valeria um retorno visual
  mais claro de sucesso/erro (já tem uma mensagem simples abaixo do botão).
- ngrok grátis muda de URL a cada restart — é preciso atualizar Home URL e
  Domain Allow List no Marketplace toda vez (ou usar ngrok pago com subdomínio
  fixo). Usando Render (ver seção acima) esse problema não existe.
- No plano free do Render, o servidor "dorme" após ~15 min sem tráfego e a
  primeira chamada depois disso tem um delay de 30-50s (cold start).
