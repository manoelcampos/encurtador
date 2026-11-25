/** Cliques de um dia (UTC). `date` está no formato YYYY-MM-DD. */
export interface DailyClicks {
    date: string;
    clicks: number;
}

/** Contrato da camada de acesso a dados para os cliques nos links curtos. */
export interface ClickRepository {
    /** Registra um clique no código. Só guarda o código e a data/hora, sem dados de quem clicou (LGPD). */
    addClick(code: string, clickedAt: Date): Promise<void>;

    /** Total de cliques do código desde que foi criado. */
    countClicks(code: string): Promise<number>;

    /** Cliques por dia (UTC) a partir de `since` (YYYY-MM-DD), em ordem de data. Dias sem cliques ficam de fora. */
    countClicksByDay(code: string, since: string): Promise<DailyClicks[]>;
}
