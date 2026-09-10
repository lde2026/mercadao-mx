import { nuvemshop } from './nuvemshop.js';
import { woocommerce } from './woocommerce.js';
import { tray } from './tray.js';
import { lojaIntegrada } from './loja-integrada.js';

const POR_PLATAFORMA = {
  nuvemshop,
  woocommerce,
  tray,
  loja_integrada: lojaIntegrada,
};

export function adaptador(plataforma) {
  const escolhido = POR_PLATAFORMA[plataforma];
  if (!escolhido) throw new Error(`plataforma desconhecida: ${plataforma}`);
  return escolhido;
}

export const PLATAFORMAS = Object.keys(POR_PLATAFORMA);
export { nuvemshop, woocommerce, tray, lojaIntegrada };
