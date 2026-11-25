// Textos da interface em português do Brasil. Os outros arquivos i18n-*.js têm as mesmas chaves.
const ptBR = {
    NOME_IDIOMA: 'Português (Brasil)',
    ROTULO_IDIOMA: 'Idioma',
    TITULO_PAGINA: 'Encurtador de URLs',
    ROTULO_URL: 'URL para encurtar',
    ROTULO_APELIDO: 'Apelido (opcional)',
    DICA_APELIDO: 'Letras, números e hífen, de 3 a 50 caracteres. Ex.: promo-natal',
    EXEMPLO_URL: 'https://exemplo.com/pagina',
    BOTAO_ENCURTAR: 'Encurtar',
    ROTULO_LINK_CURTO: 'Link curto:',
    BOTAO_COPIAR: 'Copiar link',
    BOTAO_BAIXAR_QRCODE: 'Baixar QR Code',
    BOTAO_COMPARTILHAR: 'Compartilhar',
    ROTULO_OPCOES_COMPARTILHAMENTO: 'Opções de compartilhamento',
    MENSAGEM_PADRAO: 'Não foi possível encurtar a URL.',
    MENSAGEM_URL_INVALIDA: 'Informe uma URL válida, começando com http:// ou https://.',
    MENSAGEM_URL_PROPRIO_ENCURTADOR: 'Este link já é do encurtador. Informe a URL original.',
    MENSAGEM_URL_REDE_LOCAL: 'Não é possível encurtar endereços de rede local ou privada.',
    MENSAGEM_URL_MALICIOSA: 'Esta URL pode ser perigosa e não pode ser encurtada. Aviso fornecido pelo Google.',
    MENSAGEM_APELIDO_INVALIDO: 'O apelido deve ter de 3 a 50 letras, números ou hífens, sem hífen no início ou no fim.',
    MENSAGEM_APELIDO_EM_USO: 'Este apelido já está em uso. Escolha outro.',
    MENSAGEM_CONEXAO: 'Falha de conexão com o servidor.',
    MENSAGEM_LIMITE_EXCEDIDO: 'Você fez muitas requisições. Aguarde um pouco e tente de novo.',
    MENSAGEM_LIMITE_EXCEDIDO_MINUTOS: 'Você fez muitas requisições. Tente de novo em {minutos} min.',
    AVISO_COPIADO: 'Copiado!',
    AVISO_FALHA_COPIA: 'Não foi possível copiar. O link foi selecionado para você copiar manualmente.',
    ALT_QRCODE: 'QR Code que abre o link curto',
    TITULO_COMPARTILHAMENTO: 'Link curto',
    AVISO_OPCOES_COMPARTILHAMENTO: 'Escolha abaixo onde compartilhar o link.',
    COMPARTILHAR_WHATSAPP: 'Compartilhar no WhatsApp',
    COMPARTILHAR_TELEGRAM: 'Compartilhar no Telegram',
    COMPARTILHAR_X: 'Compartilhar no X',
    COMPARTILHAR_EMAIL: 'Compartilhar por e-mail',
};

/** @typedef {typeof ptBR} Traducao */

export default Object.freeze(ptBR);
