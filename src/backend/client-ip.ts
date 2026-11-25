import type { IncomingMessage } from 'node:http';
import { isIPv6 } from 'node:net';

const UNKNOWN_IP = 'desconhecido';
const IPV6_GROUPS = 8;
/** Grupos de 16 bits do prefixo /64, que costuma ser entregue inteiro a um único cliente. */
const IPV6_PREFIX_GROUPS = 4;
const IPV6_PREFIX_SUFFIX = '::/64';
const IPV4_MAPPED_PREFIX = '::ffff:';
// Um IPv4 no fim do IPv6 (ex.: 64:ff9b::1.2.3.4) ocupa 2 grupos de 16 bits.
const IPV4_GROUPS_IN_IPV6 = 2;
const HEX = 16;

/**
 * Chave de limite do cliente que fez a requisição.
 * Sem proxy confiável, usa o IP da conexão, pois o header X-Forwarded-For pode ser forjado pelo cliente.
 * Com `trustProxy`, usa o último valor do X-Forwarded-For, que é o adicionado pelo proxy na frente da API.
 * Isso só funciona com um único proxy: com dois ou mais, o último valor é o IP de um proxy, e não do cliente.
 * Os valores anteriores vêm do cliente e podem ser falsos. Só ligue `trustProxy` se a API não puder
 * ser acessada sem passar pelo proxy, senão qualquer cliente escolhe o próprio IP.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
    return rateLimitKey(rawClientIp(req, trustProxy));
}

function rawClientIp(req: IncomingMessage, trustProxy: boolean): string {
    const socketIp = req.socket.remoteAddress ?? UNKNOWN_IP;
    if (!trustProxy) {
        return socketIp;
    }

    const lastForwarded = req.headers['x-forwarded-for']?.toString().split(',').at(-1)?.trim();
    return lastForwarded || socketIp;
}

/**
 * IPv6 vira o prefixo /64, pois um cliente costuma ter o bloco inteiro e poderia
 * trocar de endereço a cada requisição para burlar o limite. IPv4 (inclusive mapeado em IPv6) fica igual.
 */
export function rateLimitKey(ip: string): string {
    const address = ip.split('%')[0].toLowerCase();
    if (!isIPv6(address) || address.startsWith(IPV4_MAPPED_PREFIX) && address.includes('.')) {
        return ip;
    }

    const prefix = expandIpv6(address).slice(0, IPV6_PREFIX_GROUPS).map(group => parseInt(group, HEX).toString(HEX));
    return prefix.join(':') + IPV6_PREFIX_SUFFIX;
}

/** Grupos do IPv6 com o `::` expandido em zeros. */
function expandIpv6(address: string): string[] {
    const [head, tail = ''] = address.split('::');
    const groupsOf = (part: string) => part ? part.split(':') : [];
    const headGroups = groupsOf(head);
    const tailGroups = groupsOf(tail);
    const ipv4Extra = address.includes('.') ? IPV4_GROUPS_IN_IPV6 - 1 : 0;
    const missing = IPV6_GROUPS - headGroups.length - tailGroups.length - ipv4Extra;
    return [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups];
}
