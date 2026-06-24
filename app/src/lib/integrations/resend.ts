import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "dashboard@opticalia-boavista.pt";

export async function sendInviteEmail(to: string, code: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Convite para o Dashboard Óptica Boavista",
      html: `
        <h2>Foste convidado para o Dashboard Óptica Boavista</h2>
        <p>Usa o seguinte código de convite para te registares:</p>
        <h1 style="font-family:monospace;letter-spacing:4px;">${code}</h1>
        <p>Este código expira em 48 horas.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/register">Registar aqui</a></p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendApprovalEmail(to: string, name: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "A tua conta foi aprovada — Dashboard Opticalia",
      html: `
        <h2>Olá ${name}!</h2>
        <p>A tua conta no Dashboard Óptica Boavista foi aprovada.</p>
        <p>Podes fazer login em <a href="${process.env.NEXT_PUBLIC_APP_URL}/login">aqui</a>.</p>
        <p>Será pedida a configuração de autenticação de dois fatores no primeiro acesso.</p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendRejectionEmail(to: string, name: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Pedido de registo — Dashboard Opticalia",
      html: `
        <h2>Olá ${name},</h2>
        <p>O teu pedido de registo no Dashboard Óptica Boavista não foi aprovado.</p>
        <p>Contacta o administrador para mais informações.</p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}
