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

/** Nome de lead e resposta de chat sao texto digitado por visitante, entao entram no HTML escapados. */
function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
      `<p>Ola, ${escapar(nomeLead)}.</p>
       <p style="font:700 24px/1 ui-monospace,Menlo,monospace;letter-spacing:2px;padding:16px;border:2px dashed #111318;border-radius:10px;text-align:center">${escapar(codigo)}</p>
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
      `<p>Ola, ${escapar(nomeConta)}.</p><p>${escapar(aviso)}</p>
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
      `<p><strong>${escapar(nomeLead)}</strong> acabou de responder o chat.</p>
       <ul>${respostas.map((r) => `<li>${escapar(r.pergunta)} <strong>${escapar(r.resposta)}</strong></li>`).join('')}</ul>
       <p>WhatsApp: <strong>${escapar(telefone)}</strong></p>
       <p><a href="${urlPainel}">Abrir no painel</a></p>`),
  };
}

/** Para o operador do Captapp: algo que vira chamado se ninguem olhar. */
export function alertaOperador({ tipo, mensagem, nomeConta, dados, urlPainel }) {
  const detalhes = Object.entries(dados || {})
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`);
  return {
    assunto: `[Captapp] ${tipo}${nomeConta ? ` em ${nomeConta}` : ''}`,
    texto: `${mensagem}\n\n${detalhes.join('\n')}\n\nPainel do operador: ${urlPainel}`,
    html: moldura(`Alerta: ${tipo}`,
      `<p>${escapar(mensagem)}</p>
       ${nomeConta ? `<p>Conta: <strong>${escapar(nomeConta)}</strong></p>` : ''}
       ${detalhes.length ? `<ul>${detalhes.map((d) => `<li>${escapar(d)}</li>`).join('')}</ul>` : ''}
       <p><a href="${urlPainel}">Abrir o painel do operador</a></p>`),
  };
}

/** Recuperacao de senha. O link vale uma hora e uma vez so. */
export function recuperacaoSenha({ nomeConta, url }) {
  return {
    assunto: 'Redefinir sua senha do Captapp',
    texto: `Ola, ${nomeConta}.\n\nPara escolher uma senha nova, abra este link em ate uma hora:\n${url}\n\nSe voce nao pediu isso, ignore este e-mail. Sua senha continua a mesma.`,
    html: moldura('Redefinir sua senha',
      `<p>Ola, ${escapar(nomeConta)}.</p>
       <p>Para escolher uma senha nova, abra o link abaixo em ate uma hora.</p>
       <p><a href="${url}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Escolher senha nova</a></p>
       <p>Se voce nao pediu isso, ignore este e-mail. Sua senha continua a mesma.</p>`),
  };
}

/**
 * Lote de cupons acabando. E o unico e-mail que pede acao do lojista antes de
 * o problema acontecer: quando o lote zera, o proximo lead ouve a promessa e
 * nao recebe codigo nenhum.
 */
export function loteAcabando({ nomeConta, nomeLoja, disponiveis, urlPainel }) {
  const texto = `Ola, ${nomeConta}.\n\nO lote de cupons da ${nomeLoja} esta em ${disponiveis} codigo(s) disponivel(is).\n\nQuando ele zerar, quem responder o chat fica sem o cupom prometido. Cadastre novos codigos no painel da plataforma e cole em ${urlPainel}.`;
  return {
    assunto: `Lote de cupons acabando na ${nomeLoja}: ${disponiveis} restantes`,
    texto,
    html: moldura('Lote de cupons acabando',
      `<p>Ola, ${escapar(nomeConta)}.</p>
       <p>O lote de cupons da <strong>${escapar(nomeLoja)}</strong> esta em <strong>${escapar(disponiveis)}</strong> codigo(s) disponivel(is).</p>
       <p>Quando ele zerar, quem responder o chat fica sem o cupom prometido.</p>
       <p><a href="${urlPainel}">Repor o lote no painel</a></p>`),
  };
}
