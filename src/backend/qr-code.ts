import qrcode from 'qrcode-generator';

// 0 deixa a biblioteca escolher o menor tamanho de QR Code que comporta o texto.
const AUTO_TYPE_NUMBER = 0;
// Nível M recupera até ~15% de módulos danificados, o padrão para links.
const ERROR_CORRECTION = 'M';
const CELL_SIZE_PX = 8;

/** Gera o SVG do QR Code que codifica o texto. A margem padrão da biblioteca já tem os 4 módulos exigidos. */
export function createQrCodeSvg(text: string): string {
    const qr = qrcode(AUTO_TYPE_NUMBER, ERROR_CORRECTION);
    qr.addData(text);
    qr.make();
    return qr.createSvgTag(CELL_SIZE_PX);
}
