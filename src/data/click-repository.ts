/** Cliques de um dia (UTC). `date` está no formato YYYY-MM-DD. */
export interface DailyClicks {
    date: string;
    clicks: number;
}

/** Contrato da camada de acesso a dados para os cliques nos links curtos. */
export interface ClickRepository {
    /**
     * Soma um clique ao contador do código no dia `date` (YYYY-MM-DD, UTC).
     * Só guarda o total por dia, sem dados de quem clicou nem a hora (LGPD).
     */
    addClick(code: string, date: string): Promise<void>;

    /** Total de cliques do código desde que foi criado. */
    countClicks(code: string): Promise<number>;

    /** Cliques por dia a partir de `since` (YYYY-MM-DD), em ordem de data. Dias sem cliques ficam de fora. */
    countClicksByDay(code: string, since: string): Promise<DailyClicks[]>;
}

/** Usado quando nenhum repositório de cliques é injetado: não registra nada e não há cliques. */
export const NO_CLICK_REPOSITORY: ClickRepository = {
    addClick: async () => {},
    countClicks: async () => 0,
    countClicksByDay: async () => [],
};
