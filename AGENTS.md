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
- `src/data/`: acesso a dados (interfaces `UrlRepository` e `ClickRepository`, as duas implementadas por `SqliteUrlRepository`, que divide a conexão entre as tabelas `urls` e `clicks_daily`; o `main.ts` injeta a mesma instância nas duas dependências do `UrlShortenerService`). Um índice único com `COLLATE NOCASE` impede dois códigos iguais ignorando maiúsculas (veja "Apelidos"). O banco usa `journal_mode = WAL` e `synchronous = NORMAL`, para leituras não esperarem gravações e cada clique não esperar um `fsync`. As tabelas são criadas com `CREATE TABLE IF NOT EXISTS`, então bancos de versões anteriores ganham as tabelas novas ao abrir (há teste). Colunas novas em tabelas existentes (como `urls.expires_at` e `urls.manage_token_hash`) são adicionadas ao abrir, com `ALTER TABLE ... ADD COLUMN` só se o `PRAGMA table_info` mostrar que faltam (migração idempotente; há teste com o esquema anterior).
- `src/frontend/`: interface web, servida pelo backend. Só usa a API HTTP.
  - `home-page.ts`: HTML e CSS da página, servida na raiz `/`.
  - `static/`: JavaScript da página em módulos ES (`.js` puro, sem bundler), servido em `/static/`. Os tipos são checados por JSDoc (`checkJs`) e o `tsc` copia os arquivos para `dist/`.
    - `main.js`: só a ligação com o DOM; mantenha-o fino.
    - `api.js`: chamadas à API HTTP.
    - `logic.js`: regras sem DOM, testadas com `node --test`.
    - `my-links.js`: lista "Meus links" (links criados neste navegador, com o token de gestão) guardada no `localStorage`, com o armazenamento injetado; sem DOM e testada. Veja "Token de gestão".
    - `share.js`: regras de compartilhamento do link curto (Web Share API e redes alternativas), sem DOM e testadas.
    - `messages.js`: textos no idioma escolhido (`texto(chave)`) e escolha do idioma (salvo no `localStorage`, senão `navigator.languages`, senão inglês), sem DOM e testada.
    - `i18n-<idioma>.js` (`pt-BR`, `en`, `es`): um arquivo de tradução por idioma, todos com as mesmas chaves (há teste). Todo texto visível ou acessível da interface vem deles, inclusive o HTML de `home-page.ts`, que vem em pt-BR e é traduzido pelo `main.js` (atributos `data-i18n*`). Para um idioma novo, crie o arquivo e registre-o em `TRADUCOES`. As mensagens de erro da API ainda vêm só em português; para `400`, `409`, `429`, o `503` de `ALIAS_UNAVAILABLE` e os `401`/`403` do token de gestão, o frontend mostra a mensagem traduzida.
  - `static-files.ts`: rota, pasta e tipos de conteúdo permitidos dos arquivos estáticos.
  - `preview-page.ts`: HTML da página de pré-visualização (`/{code}+`), montado pelo servidor e sem JS. Veja "Pré-visualização".
- `test/`: testes automatizados.

## API

API pública e aberta, sem contas, com CORS liberado para qualquer origem (inclusive `DELETE` e o header `Authorization`). Só apagar um link exige o token de gestão (veja "Token de gestão").

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/urls` | Corpo `{"url": "https://...", "alias": "opcional", "expiresIn": "opcional", "removeTracking": false}`. Devolve `201` com `{"code", "shortUrl", "url", "expiresAt", "manageToken"}` (`url` é o destino gravado). Veja "Apelidos", "Prazo de validade", "Parâmetros de rastreamento" e "Token de gestão". |
| `DELETE` | `/api/urls/{code}` | Apaga o link e os cliques com o header `Authorization: Bearer <manageToken>`. `204`, `401`, `403` ou `404`. Veja "Token de gestão". |
| `GET`, `HEAD` | `/api/urls/{code}/qrcode` | QR Code do link curto em SVG (`image/svg+xml`), `404`, ou `410` se o link expirou. |
| `GET`, `HEAD` | `/` | Interface web para encurtar URLs. |
| `GET`, `HEAD` | `/static/:arquivo` | JavaScript da interface web (só arquivos da pasta `src/frontend/static/`). |
| `GET`, `HEAD` | `/api/urls/{code}/stats` | Estatísticas de cliques em JSON: `{"code", "totalClicks", "clicksByDay": [{"date": "YYYY-MM-DD", "clicks"}]}`, ou `404`. Veja "Contagem de cliques". |
| `GET`, `HEAD` | `/:code` | Redireciona (`302`) para a URL original, `404`, ou `410` se o link expirou. Só `GET` conta como clique. |
| `GET`, `HEAD` | `/:code+` | Página HTML com o destino do link, sem redirecionar e sem contar clique, `404`, ou `410` se o link expirou. Veja "Pré-visualização". |
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
- Não diferencia maiúsculas: o apelido é gravado em minúsculas, para `Promo` e `promo` não virarem links diferentes. Os códigos gerados continuam diferenciando maiúsculas; por isso, `/:code`, `/qrcode` e `/stats` buscam primeiro o código exato e, só se não acharem e o código em minúsculas tiver formato de apelido, buscam em minúsculas. Cliques, estatísticas e o QR Code usam o código gravado.
- Não existem dois códigos iguais ignorando maiúsculas: o índice único `urls_code_nocase` (`code COLLATE NOCASE`) faz o `add` falhar em conflito, de forma atômica. Assim um apelido não imita um código gerado (ex.: `xk7pq2rt9` contra `Xk7Pq2Rt9`) para quem digita o link com outra caixa: o apelido recebe `409`, e o código gerado que colidir é trocado por outro (laço de tentativas).
- Bancos antigos podem ter códigos que só diferem em maiúsculas; aí o índice não é criado, a API inicia mesmo assim com um aviso no log (`uniqueIgnoringCase = false` no repositório) e novos apelidos são recusados com `503` e `ALIAS_UNAVAILABLE`. Os códigos gerados continuam funcionando, pois não dependem do índice para ser exatos.
- Palavras reservadas (`RESERVED_ALIASES`): o primeiro segmento de cada rota da aplicação (derivado de `api-paths.ts` e `static-files.ts`, ex.: `api` e `static`; um teste percorre as constantes de rota e garante que todas estão reservadas) e alguns nomes que confundiriam quem recebe o link (`admin`, `www` etc.).
- Apelido em uso ou reservado: `409` com `code` `ALIAS_TAKEN` (reservado é tratado como "já usado pela aplicação"). Formato inválido: `400` com `INVALID_ALIAS`. A gravação usa o `add` do repositório, que falha se o código já existir, então dois pedidos simultâneos com o mesmo apelido dão um `201` e um `409`.

### Prazo de validade

- O campo opcional `expiresIn` do `POST /api/urls` aceita só os valores de `EXPIRATION_OPTIONS` em `expiration.ts` (`1h`, `1d`, `7d`, `30d`). Uma lista fixa evita problemas de fuso e datas absurdas; por isso não há campo com data absoluta. Outro valor (inclusive texto vazio) dá `400` com `INVALID_EXPIRATION`. Sem o campo (ou `null`), o link não expira.
- O prazo é convertido em `expires_at` (ISO 8601 em UTC, coluna `TEXT NULL` em `urls`) pelo relógio injetado no `UrlShortenerService` (opção `now`). A resposta traz `expiresAt` (ou `null`).
- A partir de `expires_at`, `GET`/`HEAD /:code` e o QR Code respondem `410 Gone` com `{"error", "code": "LINK_EXPIRED"}`, e nenhum clique é contado. `/stats` continua funcionando, para o dono ver os números depois do prazo.
- O apelido de um link expirado continua ocupado (`409`): o link não é apagado nem reaproveitado automaticamente. Só o dono, com o token de gestão, pode apagá-lo e liberar o apelido.
- O `<select>` "Validade" da interface é montado em `home-page.ts` com as chaves de `EXPIRATION_OPTIONS`; cada opção tem a tradução `VALIDADE_<VALOR>` (há teste). A data de expiração aparece abaixo do link curto, formatada no idioma atual com `Intl.DateTimeFormat`.

### Parâmetros de rastreamento

- O campo opcional `removeTracking` do `POST /api/urls` (boolean, padrão `false` para não mudar o comportamento de quem já usa a API) remove da URL os parâmetros de rastreamento antes de gravar. Outro tipo (inclusive `"true"`) dá `400` com `INVALID_REMOVE_TRACKING`; `null` vale como ausente.
- A lista fica só em `tracking-params.ts`: prefixos (`TRACKING_PARAM_PREFIXES`, ex.: `utm_`) e nomes exatos (`TRACKING_PARAM_NAMES`, ex.: `fbclid`, `gclid`, `msclkid`, `_hsenc`). A comparação não diferencia maiúsculas. Só entram parâmetros que não mudam o conteúdo da página.
- `removeTrackingParams` mantém os outros parâmetros na mesma ordem e com o texto original (a query é remontada a partir dos pares crus, pois o `URLSearchParams` trocaria `%20` por `+`), mantém o fragmento e não deixa `?` sobrando.
- Ordem: a limpeza vem logo depois da checagem de formato e tamanho de `validateUrl` (ela só encurta a URL) e antes de `PRIVATE_NETWORK`, `OWN_DOMAIN` e do `UrlThreatChecker`, que veem a URL gravada.
- A resposta traz `url`, o destino gravado. A interface tem a opção "Remover parâmetros de rastreamento", marcada por padrão, e mostra o destino gravado quando ele difere da URL digitada (`destinoAlterado` em `logic.js`).

### Pré-visualização

- O código seguido de `PREVIEW_SUFFIX` (`+`, em `api-paths.ts`), como `/AbC234xYz+`, mostra uma página com o domínio de destino em destaque, a URL completa, um link "Continuar" (`rel="noopener noreferrer"`) e um link para a página inicial. A forma codificada (`/AbC234xYz%2B`) também funciona. O `+` não cabe no `CODE_PATTERN`, então não conflita com códigos nem apelidos.
- Usa a mesma busca do redirecionamento (`resolve`): apelido sem diferenciar maiúsculas, `404` para código inexistente e `410` (`LINK_EXPIRED`) para link expirado, em JSON como nas outras rotas. Não conta clique. `HEAD` funciona.
- Segurança: todo valor interpolado no HTML passa por `escapeHtml`; só URLs `http`/`https` viram link (outras ficam com `href="#"`), sem confiar só na validação da criação. A resposta envia `Content-Security-Policy` sem scripts (`default-src 'none'`, só CSS embutido, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` e `X-Content-Type-Options: nosniff`.
- Idioma: escolhido pelo header `Accept-Language` (`languagesFromHeader` em `accept-language.ts`, ordenado por `q`), com a mesma `escolherIdioma` do frontend e os textos dos arquivos `i18n-*.js`.
- **Decisão:** a página não busca o título da página de destino. Fazer o servidor acessar URLs de terceiros abriria risco de SSRF (DNS que aponta para a rede interna, redirecionamentos, respostas enormes) e custo; mostrar o destino já atende ao objetivo. O encurtador continua sem nunca acessar as URLs.
- Depois de encurtar, a página inicial mostra a dica `DICA_PREVIA` (o texto cita o `+`; há teste que confere o sufixo nos três idiomas).

### Token de gestão

Como não há contas, quem cria o link recebe um token secreto que permite apagá-lo (`manage-token.ts`).

- Na criação, o `UrlShortenerService` gera o token com `crypto.randomBytes` (256 bits, em base64url) e o `POST` o devolve uma única vez, em `manageToken`. Não há como recuperá-lo depois.
- O banco guarda só o hash SHA-256 do token (coluna `urls.manage_token_hash`), para quem ler o banco não conseguir apagar links. SHA-256 simples basta porque o token é aleatório e longo: não há dicionário a testar, e funções lentas (bcrypt, scrypt) só fazem sentido para senhas fracas.
- `DELETE /api/urls/{code}` recebe o token no header padrão `Authorization: Bearer <token>`. A comparação é feita sobre os hashes, com `crypto.timingSafeEqual` (tempo constante). Respostas: `204` apagado; `401` com `MANAGE_TOKEN_REQUIRED` e `WWW-Authenticate: Bearer` se o header faltar ou não for `Bearer`; `404` se o código não existir; `403` com `INVALID_MANAGE_TOKEN` se o token não conferir.
- **Decisão:** o `404` revela se o código existe, o que é aceitável porque os links já são públicos (o redirecionamento e `/stats` também dão `404`).
- O código segue a mesma busca do resto (apelido sem diferenciar maiúsculas) e funciona com o link expirado.
- Apagar remove a linha de `urls` e os cliques de `clicks_daily`, numa transação (a chave estrangeira não tem `ON DELETE CASCADE`, e mudar isso no SQLite exigiria recriar a tabela). **Decisão:** o código ou apelido fica livre para ser usado de novo.
- Links criados antes do token têm `manage_token_hash` `NULL` e não podem ser apagados pela API (`403`).
- O `DELETE` conta no limite de acesso (`ACCESS_RATE_LIMIT`). Tentar adivinhar tokens é inviável com 256 bits; o limite por IP só reduz o ruído.
- `/stats` continua pública, sem token.
- Frontend: depois de encurtar, `{code, shortUrl, manageToken, expiresAt, createdAt}` vai para o `localStorage` (`my-links.js`). A seção "Meus links" da página inicial lista esses links, do mais novo para o mais antigo, com links para as estatísticas e a pré-visualização e o botão "Apagar". O primeiro clique troca o botão por "Confirmar exclusão" e avisa pela região `role="status"`; o segundo apaga (sem `window.confirm`); sair do botão cancela. Um `404` ao apagar também tira o link da lista, e um `403` com `INVALID_MANAGE_TOKEN` também (com um aviso de que a chave não confere), pois esse link nunca poderá ser apagado (`avisoAoEsquecer` em `my-links.js`). Os itens guardados são validados ao ler: só `shortUrl` `http`/`https` e `expiresAt` ausente, `null` ou data válida. Se o `localStorage` estiver bloqueado, a lista fica vazia e a página avisa que o link não foi guardado. Um texto avisa que o token fica só neste navegador e que limpar os dados do navegador perde o acesso.

### URLs recusadas

O `POST /api/urls` responde `400` com `{"error": "...", "code": "..."}` (ou `409` para `ALIAS_TAKEN` e `503` para `ALIAS_UNAVAILABLE`). O `code` é estável e o frontend escolhe a mensagem traduzida por ele (`CHAVES_DOS_CODIGOS_DE_ERRO` em `logic.js`, em sincronia com `UrlErrorCode` do backend; há teste):

| `code` | Motivo |
|--------|--------|
| `INVALID_URL` | URL ausente, malformada, longa demais ou sem `http`/`https`. |
| `PRIVATE_NETWORK` | `localhost`, `*.localhost` ou IP de loopback, privado, link-local, `0.0.0.0/8`, CGNAT, `::/96` (inclui `::`, `::1` e IPv4-compatible), NAT64 `64:ff9b::/96`, `fc00::/7`, `fe80::/10`, `fec0::/10` (inclusive IPv4 mapeado em IPv6 e formas como `2130706433`, que o `URL` normaliza). Só olha o host literal, sem resolver DNS: um domínio público que aponta para IP privado passa, o que é aceitável porque o encurtador só redireciona e nunca acessa a URL. Vem antes de `OWN_DOMAIN`, para que `http://localhost:8080` em desenvolvimento dê este código. |
| `OWN_DOMAIN` | Mesmo host da `BASE_URL` (minúsculas, sem ponto final, qualquer porta, com ou sem `www.`). Evita loops de redirecionamento. Outros subdomínios são aceitos. |
| `MALICIOUS_URL` | Marcada como possivelmente perigosa pelo `UrlThreatChecker` injetado no `UrlShortenerService`. |
| `INVALID_ALIAS` | Apelido fora do formato (veja "Apelidos"). |
| `ALIAS_TAKEN` | Apelido em uso (ignorando maiúsculas) ou reservado. Status `409`. |
| `ALIAS_UNAVAILABLE` | Apelidos desativados porque o banco tem códigos antigos que só diferem em maiúsculas. Status `503`. |
| `INVALID_EXPIRATION` | `expiresIn` fora da lista aceita (veja "Prazo de validade"). |
| `INVALID_REMOVE_TRACKING` | `removeTracking` que não é boolean (veja "Parâmetros de rastreamento"). |
| `LINK_EXPIRED` | Não vem do `POST`: é a resposta `410` de `/:code`, de `/:code+` e do QR Code de um link expirado. |
| `MANAGE_TOKEN_REQUIRED` | Não vem do `POST`: `DELETE` sem o header `Authorization: Bearer`. Status `401`. |
| `INVALID_MANAGE_TOKEN` | Não vem do `POST`: `DELETE` com token errado, ou de link antigo sem token. Status `403`. |

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
| `ACCESS_RATE_LIMIT` | `300` | Outras requisições (redirecionamento, página, QR Code, estatísticas, `DELETE` etc.) por IP em cada janela. |
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
