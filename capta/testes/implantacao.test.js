import test from 'node:test';
import assert from 'node:assert/strict';

const {
  IMPLANTACAO, DESCONTO_AVISTA, PARCELAS_IMPLANTACAO,
  precoDaImplantacao, FORMAS_IMPLANTACAO,
} = await import('../src/billing/planos.js');

/**
 * Implantacao a vista ou parcelada.
 *
 * O erro que importa aqui nao e de codigo, e de propaganda enganosa: a
 * landing promete "6x sem juros" e "10% a vista", e a fatura precisa cobrar
 * exatamente isso. Centavo de diferenca por arredondamento vira reclamacao.
 */

test('a vista tem 10% de desconto sobre a tabela', () => {
  const p = precoDaImplantacao('avista');
  assert.equal(p.total, 629.1);
  assert.equal(p.economia, 69.9);
  assert.equal(p.parcelas, 1);
  assert.equal(p.desconto, DESCONTO_AVISTA);
});

test('sem juros quer dizer sem juros: as parcelas somam a tabela', () => {
  const p = precoDaImplantacao('parcelado');
  assert.equal(p.parcelas, PARCELAS_IMPLANTACAO);
  assert.equal(p.total, IMPLANTACAO);
  // Sem centavo sobrando nem faltando.
  assert.equal(Number((p.valorParcela * p.parcelas).toFixed(2)), IMPLANTACAO);
  assert.equal(p.valorParcela, 116.5);
});

test('parcelado custa mais que a vista, e a diferenca e o desconto', () => {
  const avista = precoDaImplantacao('avista');
  const parcelado = precoDaImplantacao('parcelado');
  // Arredondado na comparacao: em ponto flutuante 699 menos 629,10 da
  // 69,90000000000003, e o que o cliente ve e sempre o valor em centavos.
  assert.equal(Number((parcelado.total - avista.total).toFixed(2)), avista.economia);
});

test('forma desconhecida cai na a vista, nunca em preco zero', () => {
  // Fluxo antigo e chamada sem argumento continuam valendo, e o pior caso e
  // cobrar o preco com desconto, nunca deixar de cobrar.
  assert.equal(precoDaImplantacao().total, 629.1);
  assert.equal(precoDaImplantacao('inventada').total, 629.1);
  assert.deepEqual(FORMAS_IMPLANTACAO, ['avista', 'parcelado']);
});
