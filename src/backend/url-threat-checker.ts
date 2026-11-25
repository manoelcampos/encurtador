/** Contrato de um provedor que diz se uma URL é maliciosa (phishing, malware etc.). */
export interface UrlThreatChecker {
    isMalicious(url: string): Promise<boolean>;
}

/** Usado quando nenhum provedor está configurado: nenhuma URL é considerada maliciosa. */
export const NO_THREAT_CHECKER: UrlThreatChecker = { isMalicious: async () => false };
