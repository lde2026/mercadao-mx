/**
 * Cliente HTTP comum dos adaptadores. Existe por dois motivos: prazo, porque
 * loja de terceiro fora do ar nao pode segurar nosso processo, e sigilo,
 * porque o corpo do erro pode conter credencial e nunca deve subir inteiro
 * para o log.
 */

export class ErroPlataforma extends Error {
  constructor(mensagem, { status = 0, plataforma, corpo = '' } = {}) {
    super(mensagem);
    this.name = 'ErroPlataforma';
    this.status = status;
    this.plataforma = plataforma;
    // Recortado de proposito: corpo de erro de API costuma ecoar o que foi
    // enviado, credencial inclusive.
    this.trecho = String(corpo).slice(0, 200);
  }
}

export async function pedir(url, opcoes = {}, { plataforma, prazo = 10_000 } = {}) {
  const abortador = AbortSignal.timeout(prazo);
  let resposta;
  try {
    resposta = await fetch(url, { ...opcoes, signal: abortador });
  } catch (erro) {
    throw new ErroPlataforma(`falha de rede: ${erro.name}`, { plataforma });
  }

  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new ErroPlataforma(`http ${resposta.status}`, {
      status: resposta.status, plataforma, corpo: texto,
    });
  }
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return texto;
  }
}
