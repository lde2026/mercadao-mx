<?php
/**
 * Plugin Name: Captapp
 * Description: Chat de captacao de leads com cupom unico por pessoa.
 * Version: 0.1.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * License: GPLv2 or later
 * Text Domain: capta
 *
 * O WooCommerce nao tem API de injecao de script porque quem manda no tema e o
 * WordPress. Este plugin e a resposta a isso, e de quebra vira canal de
 * distribuicao no repositorio oficial.
 */

if (!defined('ABSPATH')) {
    exit;
}

const CAPTA_OPCAO_CHAVE = 'capta_chave_loja';
const CAPTA_OPCAO_API = 'capta_url_api';
const CAPTA_API_PADRAO = 'https://captapp.lojadoecommerce.com.br';

/**
 * Os dois scripts entram no rodape e assincronos. O widget e baixado por todo
 * visitante da loja, entao segurar a renderizacao da pagina de venda de
 * alguem para carregar o nosso codigo nao esta em discussao.
 */
function capta_injetar_scripts()
{
    if (is_admin()) {
        return;
    }

    $chave = trim((string) get_option(CAPTA_OPCAO_CHAVE, ''));
    if ($chave === '') {
        return;
    }

    $api = untrailingslashit((string) get_option(CAPTA_OPCAO_API, CAPTA_API_PADRAO));
    $sufixo = '?k=' . rawurlencode($chave);

    // So o widget entra aqui. Ele carrega o rastreador sozinho quando o plano
    // da conta permite, entao a loja nao precisa de uma segunda tag.
    wp_enqueue_script('capta-widget', $api . '/widget.js' . $sufixo, array(), null, true);
}
add_action('wp_enqueue_scripts', 'capta_injetar_scripts');

// O WordPress nao aplica async sozinho, e sem isso o script bloqueia a
// renderizacao do tema do cliente.
function capta_marcar_async($tag, $handle)
{
    if ($handle === 'capta-widget') {
        return str_replace(' src=', ' async src=', $tag);
    }
    return $tag;
}
add_filter('script_loader_tag', 'capta_marcar_async', 10, 2);

// --------------------------------------------------------------- ajustes ---

function capta_menu()
{
    add_options_page(
        'Captapp',
        'Captapp',
        'manage_options',
        'capta',
        'capta_tela_ajustes'
    );
}
add_action('admin_menu', 'capta_menu');

function capta_registrar_ajustes()
{
    register_setting('capta', CAPTA_OPCAO_CHAVE, array(
        'type' => 'string',
        'sanitize_callback' => 'capta_limpar_chave',
        'default' => '',
    ));
    register_setting('capta', CAPTA_OPCAO_API, array(
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default' => CAPTA_API_PADRAO,
    ));
}
add_action('admin_init', 'capta_registrar_ajustes');

/** A chave tem formato conhecido, entao qualquer coisa fora dele e engano. */
function capta_limpar_chave($valor)
{
    $limpo = sanitize_text_field((string) $valor);
    if ($limpo !== '' && !preg_match('/^pk_[a-f0-9]{32}$/', $limpo)) {
        add_settings_error(
            CAPTA_OPCAO_CHAVE,
            'capta_chave_invalida',
            'A chave da loja nao confere. Ela comeca com pk_ e esta na tela de Integracoes do painel do Captapp.'
        );
        return (string) get_option(CAPTA_OPCAO_CHAVE, '');
    }
    return $limpo;
}

function capta_tela_ajustes()
{
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>Captapp</h1>
        <p>Cole aqui a chave da loja, que esta na tela de Integracoes do painel do Captapp.</p>
        <form action="options.php" method="post">
            <?php settings_fields('capta'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="capta_chave">Chave da loja</label></th>
                    <td>
                        <input type="text" id="capta_chave" class="regular-text code"
                               name="<?php echo esc_attr(CAPTA_OPCAO_CHAVE); ?>"
                               value="<?php echo esc_attr(get_option(CAPTA_OPCAO_CHAVE, '')); ?>"
                               placeholder="pk_...">
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="capta_api">Endereco da API</label></th>
                    <td>
                        <input type="url" id="capta_api" class="regular-text code"
                               name="<?php echo esc_attr(CAPTA_OPCAO_API); ?>"
                               value="<?php echo esc_attr(get_option(CAPTA_OPCAO_API, CAPTA_API_PADRAO)); ?>">
                        <p class="description">So mude isso se a equipe do Captapp pedir.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Salvar'); ?>
        </form>

        <h2>Como esta a instalacao</h2>
        <?php capta_diagnostico(); ?>
    </div>
    <?php
}

/**
 * O WooCommerce exige HTTPS e permalink em nome do post, senao /wp-json some e
 * toda chamada volta 404 como se a loja nao tivesse WooCommerce. Descobrir
 * isso aqui poupa um chamado de suporte por instalacao.
 */
function capta_diagnostico()
{
    $itens = array(
        array(
            'HTTPS ativo',
            is_ssl() || strpos(get_option('siteurl'), 'https://') === 0,
            'Sem HTTPS a API do WooCommerce nao autentica.',
        ),
        array(
            'Permalinks em nome do post',
            get_option('permalink_structure') !== '',
            'Com permalink simples o /wp-json deixa de existir. Ajuste em Configuracoes e Links permanentes.',
        ),
        array(
            'WooCommerce ativo',
            class_exists('WooCommerce'),
            'O cupom e criado pela API do WooCommerce.',
        ),
        array(
            'Chave da loja preenchida',
            trim((string) get_option(CAPTA_OPCAO_CHAVE, '')) !== '',
            'Sem a chave o widget nao carrega.',
        ),
    );

    echo '<table class="widefat striped" style="max-width:720px">';
    foreach ($itens as $item) {
        list($nome, $ok, $ajuda) = $item;
        echo '<tr><td style="width:32px">' . ($ok ? '&#10003;' : '&#10007;') . '</td>';
        echo '<td><strong>' . esc_html($nome) . '</strong>';
        if (!$ok) {
            echo '<br><span class="description">' . esc_html($ajuda) . '</span>';
        }
        echo '</td></tr>';
    }
    echo '</table>';
}

register_uninstall_hook(__FILE__, 'capta_desinstalar');

function capta_desinstalar()
{
    delete_option(CAPTA_OPCAO_CHAVE);
    delete_option(CAPTA_OPCAO_API);
}
