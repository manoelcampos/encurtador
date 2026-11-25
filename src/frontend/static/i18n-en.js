// Textos da interface em inglês.
/** @type {import('./i18n-pt-BR.js').Traducao} */
const en = {
    NOME_IDIOMA: 'English',
    ROTULO_IDIOMA: 'Language',
    TITULO_PAGINA: 'URL Shortener',
    ROTULO_URL: 'URL to shorten',
    EXEMPLO_URL: 'https://example.com/page',
    BOTAO_ENCURTAR: 'Shorten',
    ROTULO_LINK_CURTO: 'Short link:',
    BOTAO_COPIAR: 'Copy link',
    BOTAO_BAIXAR_QRCODE: 'Download QR Code',
    BOTAO_COMPARTILHAR: 'Share',
    ROTULO_OPCOES_COMPARTILHAMENTO: 'Sharing options',
    MENSAGEM_PADRAO: 'Could not shorten the URL.',
    MENSAGEM_URL_INVALIDA: 'Enter a valid URL starting with http:// or https://.',
    MENSAGEM_URL_PROPRIO_ENCURTADOR: 'This link is already from this shortener. Enter the original URL.',
    MENSAGEM_URL_REDE_LOCAL: 'Local or private network addresses cannot be shortened.',
    MENSAGEM_URL_MALICIOSA: 'This URL was flagged as malicious (phishing or malware) and cannot be shortened.',
    MENSAGEM_CONEXAO: 'Could not connect to the server.',
    MENSAGEM_LIMITE_EXCEDIDO: 'Too many requests. Please wait a moment and try again.',
    MENSAGEM_LIMITE_EXCEDIDO_MINUTOS: 'Too many requests. Try again in {minutos} min.',
    AVISO_COPIADO: 'Copied!',
    AVISO_FALHA_COPIA: 'Could not copy. The link was selected so you can copy it manually.',
    ALT_QRCODE: 'QR Code that opens the short link',
    TITULO_COMPARTILHAMENTO: 'Short link',
    AVISO_OPCOES_COMPARTILHAMENTO: 'Choose below where to share the link.',
    COMPARTILHAR_WHATSAPP: 'Share on WhatsApp',
    COMPARTILHAR_TELEGRAM: 'Share on Telegram',
    COMPARTILHAR_X: 'Share on X',
    COMPARTILHAR_EMAIL: 'Share by email',
};

export default Object.freeze(en);
