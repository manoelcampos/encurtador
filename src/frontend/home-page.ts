import { SHORTEN_PATH } from '../backend/api-paths.ts';

// A página só fala com o backend pela API HTTP (POST em SHORTEN_PATH).
export const HOME_PAGE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Encurtador de URLs</title>
    <style>
        :root { font-family: system-ui, sans-serif; color: #1f2328; background: #ffffff; }
        body { margin: 0 auto; max-width: 40rem; padding: 2rem 1rem; line-height: 1.5; }
        label { display: block; font-weight: 600; margin-bottom: .25rem; }
        .row { display: flex; flex-wrap: wrap; gap: .5rem; }
        input { flex: 1 1 16rem; min-width: 0; font-size: 1rem; padding: .6rem; border: 1px solid #57606a; border-radius: 6px; }
        input[aria-invalid="true"] { border-color: #b42318; }
        button { font-size: 1rem; padding: .6rem 1.2rem; border: 0; border-radius: 6px; background: #1a56db; color: #ffffff; cursor: pointer; }
        button:disabled { opacity: .7; cursor: wait; }
        input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid #0b3d91; outline-offset: 2px; }
        #erro { color: #b42318; margin: .5rem 0 0; min-height: 1.5em; }
        #resultado { margin-top: 1rem; word-break: break-all; }
        a { color: #0b3d91; }
    </style>
</head>
<body>
    <main>
        <h1>Encurtador de URLs</h1>
        <form id="form" novalidate>
            <label for="url">URL para encurtar</label>
            <div class="row">
                <input id="url" name="url" type="url" inputmode="url" autocomplete="url" required
                    placeholder="https://exemplo.com/pagina" aria-describedby="erro">
                <button type="submit">Encurtar</button>
            </div>
            <p id="erro" role="alert"></p>
        </form>
        <p id="resultado" aria-live="polite" hidden>Link curto: <a id="link"></a></p>
    </main>
    <script>
        const form = document.getElementById('form');
        const input = document.getElementById('url');
        const button = form.querySelector('button');
        const erro = document.getElementById('erro');
        const resultado = document.getElementById('resultado');
        const link = document.getElementById('link');

        function mostrarErro(mensagem) {
            erro.textContent = mensagem;
            input.setAttribute('aria-invalid', 'true');
            resultado.hidden = true;
            input.focus();
        }

        function mostrarLink(shortUrl) {
            erro.textContent = '';
            input.removeAttribute('aria-invalid');
            link.href = shortUrl;
            link.textContent = shortUrl;
            resultado.hidden = false;
        }

        async function encurtar(url) {
            const res = await fetch('${SHORTEN_PATH}', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const dados = await res.json();
            if (!res.ok) {
                throw new Error(dados.error ?? 'Não foi possível encurtar a URL.');
            }

            return dados.shortUrl;
        }

        form.addEventListener('submit', async event => {
            event.preventDefault();
            button.disabled = true;
            try {
                mostrarLink(await encurtar(input.value.trim()));
            } catch (error) {
                mostrarErro(error instanceof TypeError ? 'Falha de conexão com o servidor.' : error.message);
            } finally {
                button.disabled = false;
            }
        });
    </script>
</body>
</html>`;
