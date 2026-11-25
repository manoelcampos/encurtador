import { BlockList, isIP } from 'node:net';

const LOCALHOST = 'localhost';
const LOCALHOST_SUFFIX = `.${LOCALHOST}`;
const IPV6_BRACKETS = /^\[|\]$/g;
const TRAILING_DOT = /\.$/;
const IP_FAMILIES: Readonly<Record<number, 'ipv4' | 'ipv6'>> = { 4: 'ipv4', 6: 'ipv6' };

const IPV4_SUBNETS: ReadonlyArray<readonly [string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10], // CGNAT
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
];

const IPV6_SUBNETS: ReadonlyArray<readonly [string, number]> = [
    ['::', 128],
    ['::1', 128],
    ['fc00::', 7],
    ['fe80::', 10],
];

// O BlockList também casa IPv4 mapeado em IPv6 (ex.: ::ffff:7f00:1) com as faixas IPv4.
const PRIVATE_NETWORKS = new BlockList();
IPV4_SUBNETS.forEach(([address, prefix]) => PRIVATE_NETWORKS.addSubnet(address, prefix, 'ipv4'));
IPV6_SUBNETS.forEach(([address, prefix]) => PRIVATE_NETWORKS.addSubnet(address, prefix, 'ipv6'));

/**
 * Indica se o `hostname` de uma URL é de rede local ou privada.
 * O `URL` já converte formas como `2130706433` e `0x7f.1` em IPv4 decimal.
 * Não resolve DNS: um domínio público que aponta para um IP privado passa,
 * o que é aceitável porque o encurtador só redireciona e nunca acessa a URL.
 */
export function isPrivateNetworkHost(hostname: string): boolean {
    const host = hostname.replace(IPV6_BRACKETS, '').replace(TRAILING_DOT, '');
    if (host === LOCALHOST || host.endsWith(LOCALHOST_SUFFIX)) {
        return true;
    }

    const family = IP_FAMILIES[isIP(host)];
    return family !== undefined && PRIVATE_NETWORKS.check(host, family);
}
