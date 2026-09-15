import { adaptador } from './adapters/index.js';
import { log } from './log.js';
import * as repo from './repositorio.js';

/**
 * Credenciais prontas para uso: decifradas e, na plataforma em que o token
 * vence, renovadas e gravadas de volta. Existe porque o mesmo cuidado era
 * preciso no cupom, na instalacao, no webhook e na varredura, e faltava em
 * tres deles.
 */
export async function credenciaisProntas(conexao) {
  const api = adaptador(conexao.plataforma);
  let credenciais = await repo.credenciaisDaConexao(conexao.conta_id, conexao.id);
  if (!credenciais) return null;

  if (api.tokenExpira && api.garantirToken) {
    const { credenciais: novas, renovou } = await api.garantirToken(credenciais);
    if (renovou) {
      await repo.salvarCredenciais(conexao.conta_id, conexao.id, novas);
      log.info('token.renovado', { conta_id: conexao.conta_id, conexao_id: conexao.id });
    }
    credenciais = novas;
  }
  return credenciais;
}
