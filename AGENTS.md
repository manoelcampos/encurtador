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
- `src/data/`: acesso a dados (interface `UrlRepository` e implementação SQLite).
- `src/frontend/`: interface web, servida pelo backend. Só usa a API HTTP.
  - `home-page.ts`: HTML e CSS da página, servida na raiz `/`.
  - `static/`: JavaScript da página em módulos ES (`.js` puro, sem bundler), servido em `/static/`. Os tipos são checados por JSDoc (`checkJs`) e o `tsc` copia os arquivos para `dist/`.
    - `main.js`: só a ligação com o DOM; mantenha-o fino.
    - `api.js`: chamadas à API HTTP.
    - `logic.js`: regras sem DOM, testadas com `node --test`.
    - `share.js`: regras de compartilhamento do link curto (Web Share API e redes alternativas), sem DOM e testadas.
    - `messages.js`: textos no idioma escolhido (`texto(chave)`) e escolha do idioma (salvo no `localStorage`, senão `navigator.languages`, senão inglês), sem DOM e testada.
    - `i18n-<idioma>.js` (`pt-BR`, `en`, `es`): um arquivo de tradução por idioma, todos com as mesmas chaves (há teste). Todo texto visível ou acessível da interface vem deles, inclusive o HTML de `home-page.ts`, que vem em pt-BR e é traduzido pelo `main.js` (atributos `data-i18n*`). Para um idioma novo, crie o arquivo e registre-o em `TRADUCOES`. As mensagens de erro da API ainda vêm só em português.
  - `static-files.ts`: rota, pasta e tipos de conteúdo permitidos dos arquivos estáticos.
- `test/`: testes automatizados.

## API

API pública e aberta, sem autenticação, com CORS liberado para qualquer origem.

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/urls` | Corpo `{"url": "https://..."}`. Devolve `201` com `{"code", "shortUrl"}`. |
| `GET`, `HEAD` | `/api/urls/{code}/qrcode` | QR Code do link curto em SVG (`image/svg+xml`), ou `404`. |
| `GET`, `HEAD` | `/` | Interface web para encurtar URLs. |
| `GET`, `HEAD` | `/static/:arquivo` | JavaScript da interface web (só arquivos da pasta `src/frontend/static/`). |
| `GET` | `/:code` | Redireciona (`302`) para a URL original, ou `404`. |
| `GET` | `/api/docs` | Swagger UI. |
| `GET` | `/api/openapi.json` | Especificação OpenAPI. Mantenha `src/backend/openapi.ts` em sincronia com as rotas. |

Variáveis de ambiente: `PORT` (padrão `3000`), `BASE_URL` (padrão `http://localhost:PORT`) e `DB_PATH` (padrão `encurtador.db`).

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

- Valide toda URL recebida: aceite apenas `http` e `https` e rejeite entradas malformadas.
- Gere códigos curtos com `crypto` (não use `Math.random`).
- Nunca registre em log nem faça commit de segredos (`.env`, tokens, credenciais).

## Testes

- Toda lógica nova não trivial (validação, geração de código, redirecionamento) precisa de testes.
- Correções de bug vêm com um teste que reproduz o problema.

## Git

- Faça commit só quando pedido. Nunca faça push sem pedido explícito.
- Integre PRs só com rebase ou squash, nunca com merge commit.
