# AGENTS.md

Instruções para agentes de IA que trabalham neste repositório.

## Projeto

Encurtador de URLs: recebe uma URL longa, gera um código curto e redireciona quem acessa o código para a URL original.

## Stack

- TypeScript (modo `strict`) rodando em Node.js (versão LTS atual).
- Gerenciador de pacotes: npm.
- Banco de dados: SQLite, pelo módulo nativo `node:sqlite` (sem dependência externa).
- QR Code: [`qrcode-generator`](https://www.npmjs.com/package/qrcode-generator) (sem dependências, com tipos próprios), usado só em `src/backend/qr-code.ts`.
- O Node executa os arquivos `.ts` direto; o `tsc` só checa tipos e gera o build em `dist/`.
- Não adicione dependências para resolver o que a biblioteca padrão do Node já resolve em poucas linhas.

## Comandos

Os scripts abaixo devem existir no `package.json`. Atualize esta seção se mudarem.

| Ação | Comando |
|------|---------|
| Instalar dependências | `npm install` |
| Rodar em desenvolvimento | `npm run dev` |
| Build | `npm run build` |
| Testes | `npm test` |
| Lint (por enquanto, só checagem de tipos) | `npm run lint` |
| Rodar o build | `npm start` |

Antes de concluir uma tarefa, rode testes, lint e build, e corrija o que falhar.
O CI (`.github/workflows/ci.yml`) roda `npm ci`, lint, testes e build em todo push para `main` e em todo pull request, com a versão do Node definida em `engines` no `package.json`.

## Estrutura

- `src/backend/`: API HTTP e regras de negócio (`main.ts` é o ponto de entrada).
- `src/data/`: acesso a dados (interfaces `UrlRepository` e `ClickRepository`, as duas implementadas por `SqliteUrlRepository`, que divide a conexão entre as tabelas `urls` e `clicks_daily`; o `main.ts` injeta a mesma instância nas duas dependências do `UrlShortenerService`). O banco usa `journal_mode = WAL` e `synchronous = NORMAL`, para leituras não esperarem gravações e cada clique não esperar um `fsync`. As tabelas são criadas com `CREATE TABLE IF NOT EXISTS`, então bancos de versões anteriores ganham as tabelas novas ao abrir (há teste).
- `src/frontend/`: interface web, servida pelo backend. Só usa a API HTTP.
  - `home-page.ts`: HTML e CSS da página, servida na raiz `/`.
  - `static/`: JavaScript da página em módulos ES (`.js` puro, sem bundler), servido em `/static/`. Os tipos são checados por JSDoc (`checkJs`) e o `tsc` copia os arquivos para `dist/`.
    - `main.js`: só a ligação com o DOM; mantenha-o fino.
    - `api.js`: chamadas à API HTTP.
    - `logic.js`: regras sem DOM, testadas com `node --test`.
    - `share.js`: regras de compartilhamento do link curto (Web Share API e redes alternativas), sem DOM e testadas.
    - `messages.js`: textos no idioma escolhido (`texto(chave)`) e escolha do idioma (salvo no `localStorage`, senão `navigator.languages`, senão inglês), sem DOM e testada.
    - `i18n-<idioma>.js` (`pt-BR`, `en`, `es`): um arquivo de tradução por idioma, todos com as mesmas chaves (há teste). Todo texto visível ou acessível da interface vem deles, inclusive o HTML de `home-page.ts`, que vem em pt-BR e é traduzido pelo `main.js` (atributos `data-i18n*`). Para um idioma novo, crie o arquivo e registre-o em `TRADUCOES`. As mensagens de erro da API ainda vêm só em português; para `400`, `409` e `429`, o frontend mostra a mensagem traduzida.
  - `static-files.ts`: rota, pasta e tipos de conteúdo permitidos dos arquivos estáticos.
- `test/`: testes automatizados.

## API

API pública e aberta, sem autenticação, com CORS liberado para qualquer origem.

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/urls` | Corpo `{"url": "https://...", "alias": "opcional"}`. Devolve `201` com `{"code", "shortUrl"}`. Veja "Apelidos". |
| `GET`, `HEAD` | `/api/urls/{code}/qrcode` | QR Code do link curto em SVG (`image/svg+xml`), ou `404`. |
| `GET`, `HEAD` | `/` | Interface web para encurtar URLs. |
| `GET`, `HEAD` | `/static/:arquivo` | JavaScript da interface web (só arquivos da pasta `src/frontend/static/`). |
| `GET`, `HEAD` | `/api/urls/{code}/stats` | Estatísticas de cliques em JSON: `{"code", "totalClicks", "clicksByDay": [{"date": "YYYY-MM-DD", "clicks"}]}`, ou `404`. Veja "Contagem de cliques". |
| `GET`, `HEAD` | `/:code` | Redireciona (`302`) para a URL original, ou `404`. Só `GET` conta como clique. |
| `GET` | `/api/docs` | Swagger UI. |
| `GET` | `/api/openapi.json` | Especificação OpenAPI. Mantenha `src/backend/openapi.ts` em sincronia com as rotas. |

Variáveis de ambiente: `PORT` (padrão `3000`), `BASE_URL` (padrão `http://localhost:PORT`), `DB_PATH` (padrão `encurtador.db`) e `SAFE_BROWSING_API_KEY` (veja abaixo).

### Contagem de cliques

- Cada `GET /:code` que redireciona soma 1 ao contador do código no dia (UTC) na tabela `clicks_daily(code, date, clicks)`, com UPSERT. Não guarda hora, IP nem user agent (LGPD), e `/stats` lê no máximo uma linha por dia, por mais cliques que haja.
- `HEAD` não conta: é usado por robôs e prévias de link, não por pessoas.
- Se a gravação do clique falhar, o erro vai para o log e o redirecionamento acontece mesmo assim.
- `totalClicks` conta todo o período. `clicksByDay` mostra só os últimos `STATS_DAYS` (30) dias em UTC, contando hoje, em ordem de data, e omite os dias sem cliques.
- A data vem do relógio injetado no `UrlShortenerService` (opção `now`), para os testes controlarem as datas. O `ClickRepository` é injetado pela opção `clicks`; sem ela, nenhum clique é registrado (`NO_CLICK_REPOSITORY`).

### Apelidos

- O campo opcional `alias` do `POST /api/urls` vira o código do link (ex.: `/promo-natal`). Sem ele, o código é gerado.
- Formato (`ALIAS_PATTERN` em `alias-validator.ts`): de `ALIAS_MIN_LENGTH` (3) a `ALIAS_MAX_LENGTH` (50) letras, números e hífens, sem hífen no início ou no fim. Cabe no `CODE_PATTERN` da rota `/:code` (há teste).
- Não diferencia maiúsculas: o apelido é gravado em minúsculas, para `Promo` e `promo` não virarem links diferentes. Os códigos gerados continuam diferenciando maiúsculas; por isso, `/:code`, `/qrcode` e `/stats` buscam primeiro o código exato e, só se não acharem e o código em minúsculas tiver formato de apelido, buscam em minúsculas. Cliques e estatísticas vão para o código gravado.
- Palavras reservadas (`RESERVED_ALIASES`): o primeiro segmento de cada rota da aplicação (derivado de `api-paths.ts` e `static-files.ts`, ex.: `api` e `static`) e alguns nomes que confundiriam quem recebe o link (`admin`, `www` etc.).
- Apelido em uso ou reservado: `409` com `code` `ALIAS_TAKEN` (reservado é tratado como "já usado pela aplicação"). Formato inválido: `400` com `INVALID_ALIAS`. A gravação usa o `add` do repositório, que falha se o código já existir, então dois pedidos simultâneos com o mesmo apelido dão um `201` e um `409`.

### URLs recusadas

O `POST /api/urls` responde `400` com `{"error": "...", "code": "..."}` (ou `409` para `ALIAS_TAKEN`). O `code` é estável e o frontend escolhe a mensagem traduzida por ele (`CHAVES_DOS_CODIGOS_DE_ERRO` em `logic.js`, em sincronia com `UrlErrorCode` do backend; há teste):

| `code` | Motivo |
|--------|--------|
| `INVALID_URL` | URL ausente, malformada, longa demais ou sem `http`/`https`. |
| `PRIVATE_NETWORK` | `localhost`, `*.localhost` ou IP de loopback, privado, link-local, `0.0.0.0/8`, CGNAT, `::/96` (inclui `::`, `::1` e IPv4-compatible), NAT64 `64:ff9b::/96`, `fc00::/7`, `fe80::/10`, `fec0::/10` (inclusive IPv4 mapeado em IPv6 e formas como `2130706433`, que o `URL` normaliza). Só olha o host literal, sem resolver DNS: um domínio público que aponta para IP privado passa, o que é aceitável porque o encurtador só redireciona e nunca acessa a URL. Vem antes de `OWN_DOMAIN`, para que `http://localhost:8080` em desenvolvimento dê este código. |
| `OWN_DOMAIN` | Mesmo host da `BASE_URL` (minúsculas, sem ponto final, qualquer porta, com ou sem `www.`). Evita loops de redirecionamento. Outros subdomínios são aceitos. |
| `MALICIOUS_URL` | Marcada como possivelmente perigosa pelo `UrlThreatChecker` injetado no `UrlShortenerService`. |
| `INVALID_ALIAS` | Apelido fora do formato (veja "Apelidos"). |
| `ALIAS_TAKEN` | Apelido em uso ou reservado. Única recusa com status `409`. |

O `UrlThreatChecker` só é consultado depois das outras regras. Com `SAFE_BROWSING_API_KEY` definida, usa o `SafeBrowsingThreatChecker` (Lookup API v4 do Google Safe Browsing, com timeout curto); sem ela, nenhuma URL é considerada maliciosa (`NO_THREAT_CHECKER`).
Em erro ou timeout do Google, a URL é aceita e o problema vai para o log (fail-open), para o encurtador não parar se o Google cair. Nos testes, use checkers e `fetch` falsos, nunca o serviço real.
Termos do Safe Browsing: a API é só para uso não comercial (para uso comercial, o Google indica a [Web Risk API](https://cloud.google.com/web-risk)). A mensagem mostrada ao usuário deve ser não categórica ("pode ser perigosa") e trazer a atribuição "Aviso fornecido pelo Google".

### Limite de requisições por IP

Ao passar do limite, a API responde `429` com o header `Retry-After` (segundos) e corpo `{"error": "..."}`.
Os limites usam janela fixa, em memória (`FixedWindowRateLimiter`, atrás da interface `RateLimiter`), então não são compartilhados entre várias instâncias.
Valor inválido nestas variáveis impede a API de iniciar, com uma mensagem que diz qual variável está errada.

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `CREATE_RATE_LIMIT` | `30` | Criações (`POST /api/urls`) por IP em cada janela. |
| `CREATE_RATE_WINDOW_SECONDS` | `3600` | Duração da janela de criação, em segundos. |
| `ACCESS_RATE_LIMIT` | `300` | Outras requisições (redirecionamento, página, QR Code, estatísticas etc.) por IP em cada janela. |
| `ACCESS_RATE_WINDOW_SECONDS` | `60` | Duração da janela de acesso, em segundos. |
| `TRUST_PROXY` | `false` | Com `true`, o IP do cliente é o **último** valor do header `X-Forwarded-For`. Isso só serve para **um único** proxy confiável na frente da API: com dois ou mais, o último valor é o IP de um proxy, e todos os clientes dividem o mesmo limite. Só ligue se a API não puder ser acessada sem passar pelo proxy, senão qualquer cliente forja o próprio IP. Com `false`, usa o IP da conexão. |

IPv4 (inclusive mapeado em IPv6, como `::ffff:203.0.113.1`) é limitado por endereço. IPv6 é limitado pelo prefixo `/64`, pois um cliente costuma ter o bloco inteiro e poderia trocar de endereço para burlar o limite.

## Princípios de engenharia

- **SOLID:**
  - **SRP (Responsabilidade Única):** cada módulo, classe ou função tem um único motivo para mudar.
  - **OCP (Aberto/Fechado):** adicione comportamento com novas implementações, sem alterar código que já funciona (ex.: padrão Strategy).
  - **LSP (Substituição de Liskov):** toda implementação de um contrato pode substituir outra sem quebrar quem a usa.
  - **ISP (Segregação de Interfaces):** prefira interfaces pequenas e específicas a uma interface grande.
  - **DIP (Inversão de Dependência):** dependa de interfaces, não de implementações concretas, e injete as dependências (ex.: o armazenamento das URLs).
- **KISS e YAGNI:** escreva a solução mais simples que resolve o problema e não crie código "para depois".
- **DRY:** evite duplicar comportamento. Extraia funções reutilizáveis.
- **Composição em vez de herança.**
- **Design by Contract:** quando houver mais de uma implementação de um recurso, defina o contrato com uma interface.
- **Alta coesão:** mantenha junto o que muda junto e separe o que não está relacionado.
- **Separação em camadas:** o projeto é dividido em três camadas, cada uma só conversa com a camada vizinha:
  - **Frontend:** interface com o usuário. Só acessa o backend pela API HTTP, nunca os dados diretamente.
  - **Backend:** regras de negócio (validação de URLs, geração de códigos, redirecionamento) e a API HTTP.
  - **Acesso a dados:** leitura e gravação das URLs, exposta ao backend por meio de interfaces (DIP).

## Regras de código

- Funções pequenas, com uma única responsabilidade e fáceis de testar.
- Prefira `const` e dados imutáveis. Evite números e strings mágicas: use constantes.
- Declare variáveis e constantes perto de onde são usadas.
- Reaproveite código existente antes de escrever código novo.
- Deixe uma linha em branco entre blocos de código com mais de 3 linhas.
- Comentários só para explicar o porquê, não o quê.

## Segurança

- Valide toda URL recebida: aceite apenas `http` e `https` e rejeite entradas malformadas, links do próprio encurtador, de rede local e maliciosos (veja "URLs recusadas").
- Gere códigos curtos com `crypto` (não use `Math.random`).
- Nunca registre em log nem faça commit de segredos (`.env`, tokens, credenciais).

## Testes

- Toda lógica nova não trivial (validação, geração de código, redirecionamento) precisa de testes.
- Correções de bug vêm com um teste que reproduz o problema.

## Git

- Faça commit só quando pedido. Nunca faça push sem pedido explícito.
- Integre PRs só com rebase ou squash, nunca com merge commit.
