# Encurtador de URLs

Recebe uma URL longa, gera um código curto (ou usa um apelido escolhido) e redireciona quem acessa o código para a URL original.
Tem interface web, API HTTP pública com documentação OpenAPI, QR Code, estatísticas de cliques, prazo de validade, limite de acessos e um token para o dono apagar o link.

Feito em TypeScript, rodando em Node.js, com SQLite pelo módulo nativo `node:sqlite`.

## Desenvolvimento

Requer Node.js 24 ou mais novo (veja `engines` no `package.json`).

```bash
npm install
npm run dev        # sobe a API em http://localhost:3000 e reinicia a cada mudança
```

O Node executa os arquivos `.ts` direto. O banco é criado no arquivo `encurtador.db` (mude com `DB_PATH`).

| Ação | Comando |
|------|---------|
| Testes | `npm test` |
| Lint (checagem de tipos) | `npm run lint` |
| Build (gera `dist/`) | `npm run build` |
| Rodar o build | `npm start` |

## Docker

```bash
docker build -t encurtador .
docker run -d --name encurtador -p 3000:3000 \
  -v encurtador-data:/data \
  -e BASE_URL=https://seu-dominio.exemplo \
  encurtador
```

- O banco fica no volume `/data` (`DB_PATH=/data/encurtador.db`). Com o mesmo volume, os links continuam existindo depois de recriar o container.
- O container roda como o usuário `node` (não root).
- O `HEALTHCHECK` da imagem chama `GET /api/health`. No Podman, construa com `podman build --format docker`, senão o healthcheck é ignorado.
- `docker stop` envia `SIGTERM`: a API para de aceitar conexões e fecha o banco, gravando o WAL no arquivo principal.
- Defina `BASE_URL` com o endereço público, pois é com ela que as URLs curtas são montadas.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta HTTP. |
| `BASE_URL` | `http://localhost:PORT` | Endereço público do encurtador, usado nas URLs curtas e para recusar links para ele mesmo. |
| `DB_PATH` | `encurtador.db` (`/data/encurtador.db` no Docker) | Arquivo do banco SQLite. Os arquivos `-wal` e `-shm` ficam ao lado. |
| `SAFE_BROWSING_API_KEY` | (sem) | Chave do Google Safe Browsing para recusar URLs maliciosas. Sem ela, essa checagem não é feita. |
| `CREATE_RATE_LIMIT` | `30` | Criações (`POST /api/urls`) por IP em cada janela. |
| `CREATE_RATE_WINDOW_SECONDS` | `3600` | Duração da janela de criação, em segundos. |
| `ACCESS_RATE_LIMIT` | `300` | Outras requisições (redirecionamento, página, QR Code, estatísticas, `DELETE` etc.) por IP em cada janela. `OPTIONS` e `/api/health` não contam. |
| `ACCESS_RATE_WINDOW_SECONDS` | `60` | Duração da janela de acesso, em segundos. |
| `TRUST_PROXY` | `false` | Com `true`, o IP do cliente é o **último** valor do header `X-Forwarded-For`. Isso só serve para **um único** proxy confiável na frente da API: com dois ou mais, o último valor é o IP de um proxy, e todos os clientes dividem o mesmo limite. Só ligue se a API não puder ser acessada sem passar pelo proxy, senão qualquer cliente forja o próprio IP. Com `false`, usa o IP da conexão. |

Valor inválido nas variáveis de limite impede a API de iniciar, com uma mensagem que diz qual variável está errada.

## Rotas principais

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/` | Interface web. |
| `POST` | `/api/urls` | Encurta uma URL. |
| `GET` | `/{code}` | Redireciona para a URL original. |
| `GET` | `/{code}+` | Mostra o destino sem redirecionar. |
| `GET` | `/api/urls/{code}/stats` | Estatísticas de cliques. |
| `GET` | `/api/urls/{code}/qrcode` | QR Code em SVG. |
| `DELETE` | `/api/urls/{code}` | Apaga o link com o token de gestão. |
| `GET` | `/api/health` | Saúde da aplicação: `200 {"status":"ok"}` se o banco responde, senão `503`. |

A documentação completa da API fica em [`/api/docs`](http://localhost:3000/api/docs) (Swagger UI), com a especificação em `/api/openapi.json`.
