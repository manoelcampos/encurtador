import { randomBytes } from 'node:crypto';

const CODE_BYTES = 6; // 6 bytes viram 8 caracteres em base64url

/** Formato aceito para códigos curtos (base64url). */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type CodeGenerator = () => string;

export const generateRandomCode: CodeGenerator = () => randomBytes(CODE_BYTES).toString('base64url');
