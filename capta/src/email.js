import { log } from './log.js';

/**
 * Envio de e-mail por HTTP, sem dependencia. Os tres provedores que interessam
 * (Resend, Postmark, Brevo) aceitam um POST com JSON, entao um adaptador de
 * dez linhas evita um pacote a mais de superficie de ataque e manutencao.
 *
 * Sem EMAIL_PROVEDOR configurado, o envio vira linha de log e nada sai. Isso e
 * o que faz o ambiente local nao mandar e-mail para cliente de verdade por
 * acidente durante um teste.
 */

const PROVEDORES = {
  resend: {
    url: () => 'https://api.resend.com/emails',
    cabecalhos: () => ({
      Authorization: `Bearer ${process.env.EMAIL_CHAVE}`,
      'Content-Type': 'application/json',
    }),
    corpo: ({ para, assunto, texto, html }) => ({
      from: process.env.EMAIL_REMETENTE,
      to: [para], subject: assunto, text: texto, html,
    }),
  },
  postmark: {
    url: () => 'https://api.postmarkapp.com/email',
    cabecalhos: () => ({
      'X-Postmark-Server-Token': process.env.EMAIL_CHAVE,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
    corpo: ({ para, assunto, texto, html }) => ({
      From: process.env.EMAIL_REMETENTE,
      To: para, Subject: assunto, TextBody: texto, HtmlBody: html,
    }),
  },
};

export async function enviar({ para, assunto, texto, html, contaId }) {
  const escolhido = PROVEDORES[process.env.EMAIL_PROVEDOR];

  if (!escolhido) {
    // Nunca o destinatario, so a conta: o assunto de um e-mail de cupom nao
    // carrega dado pessoal, mas o endereco carrega.
    log.info('email.nao_enviado', { conta_id: contaId, assunto, motivo: 'provedor nao configurado' });
    return { enviado: false };
  }

  try {
    const resposta = await fetch(escolhido.url(), {
      method: 'POST',
      headers: escolhido.cabecalhos(),
      body: JSON.stringify(escolhido.corpo({ para, assunto, texto, html })),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) throw new Error(`http ${resposta.status}`);
    log.info('email.enviado', { conta_id: contaId, assunto });
    return { enviado: true };
  } catch (erro) {
    log.erro('email.falhou', { conta_id: contaId, assunto, motivo: erro.message });
    return { enviado: false, motivo: erro.message };
  }
}

function moldura(titulo, corpo) {
  return `<div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111318;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${titulo}</h1>${corpo}</div>`;
}

/**
 * Cupom que nao saiu na hora. E o e-mail mais importante dos tres: sem ele, a
 * pessoa deixou o contato, ouviu uma promessa e nao recebeu nada, e a
 * reclamacao vai direto para o lojista.
 */
export function cupomAtrasado({ nomeLead, nomeLoja, codigo, desconto }) {
  const texto = `Ola, ${nomeLead}.\n\nSeu cupom de ${desconto}% na ${nomeLoja} e ${codigo}.\n\nUse no carrinho. Ele e so seu e vale uma vez.`;
  return {
    assunto: `Seu cupom de ${desconto}% na ${nomeLoja}`,
    texto,
    html: moldura(`Seu cupom de ${desconto}% na ${nomeLoja}`,
      `<p>Ola, ${nomeLead}.</p>
       <p style="font:700 24px/1 ui-monospace,Menlo,monospace;letter-spacing:2px;padding:16px;border:2px dashed #111318;border-radius:10px;text-align:center">${codigo}</p>
       <p>Use no carrinho. Ele e so seu e vale uma vez.</p>`),
  };
}

/** Aviso de cobranca. O texto muda por degrau da regua, nao por vencimento. */
export function avisoDeCobranca({ nomeConta, aviso, diasAtraso }) {
  const texto = `Ola, ${nomeConta}.\n\n${aviso}\n\nSeus leads continuam guardados. Assim que o pagamento entrar, tudo volta no mesmo minuto, sem reimplantacao.`;
  return {
    assunto: diasAtraso >= 10
      ? 'Seu widget saiu do ar por pendencia financeira'
      : 'Fatura em aberto no Captapp',
    texto,
    html: moldura('Pendencia financeira',
      `<p>Ola, ${nomeConta}.</p><p>${aviso}</p>
       <p>Seus leads continuam guardados. Assim que o pagamento entrar, tudo volta no mesmo minuto, sem reimplantacao.</p>`),
  };
}

/** Lead quente: respondeu tudo e deixou WhatsApp. E o que o lojista precisa ligar hoje. */
export function leadQuente({ nomeConta, nomeLead, nomeLoja, telefone, respostas, urlPainel }) {
  const linhas = respostas.map((r) => `- ${r.pergunta} ${r.resposta}`).join('\n');
  return {
    assunto: `Lead novo na ${nomeLoja}: ${nomeLead}`,
    texto: `Ola, ${nomeConta}.\n\n${nomeLead} acabou de responder o chat na ${nomeLoja}.\n\n${linhas}\n\nWhatsApp: ${telefone}\n\nAbra no painel: ${urlPainel}`,
    html: moldura(`Lead novo na ${nomeLoja}`,
      `<p><strong>${nomeLead}</strong> acabou de responder o chat.</p>
       <ul>${respostas.map((r) => `<li>${r.pergunta} <strong>${r.resposta}</strong></li>`).join('')}</ul>
       <p>WhatsApp: <strong>${telefone}</strong></p>
       <p><a href="${urlPainel}">Abrir no painel</a></p>`),
  };
}
