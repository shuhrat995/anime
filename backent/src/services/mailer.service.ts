import { env } from '../config/env.js';

/**
 * Mail delivery is pluggable: development prints the message (including verification links)
 * to the server console so the flow is testable without an SMTP server. Production wires a
 * real transport here — everything else in the app only ever calls sendVerificationEmail.
 */
export const sendVerificationEmail = async (to: string, token: string, displayName: string): Promise<void> => {
  const verifyUrl = `http://localhost:3001/verify-email?token=${token}`;
  const message = [
    '',
    '═════════════════════════════════════════════════════════════',
    `📧 DEV MAIL → ${to}`,
    `   Salom, ${displayName}!`,
    '   Emailingizni tasdiqlash uchun quyidagi havolani oching:',
    `   ${verifyUrl}`,
    `   (Yoki token: ${token})`,
    `   Havola 24 soat ichida amal qiladi.`,
    '═════════════════════════════════════════════════════════════',
    '',
  ].join('\n');
  process.stdout.write(message);
  void env;
};
