import type { IncomingMessage } from 'node:http';

const UNKNOWN_IP = 'desconhecido';

/**
 * IP do cliente que fez a requisição.
 * Sem proxy confiável, usa o IP da conexão, pois o header X-Forwarded-For pode ser forjado pelo cliente.
 * Com proxy confiável, usa o último valor do X-Forwarded-For: é o que o proxy na frente da API adicionou.
 * Os valores anteriores vêm do cliente e podem ser falsos. Só ligue `trustProxy` se a API não puder
 * ser acessada sem passar pelo proxy, senão qualquer cliente escolhe o próprio IP.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
    const socketIp = req.socket.remoteAddress ?? UNKNOWN_IP;
    if (!trustProxy) {
        return socketIp;
    }

    const lastForwarded = req.headers['x-forwarded-for']?.toString().split(',').at(-1)?.trim();
    return lastForwarded || socketIp;
}
