/* Entrar com a biometria do aparelho (digital, rosto, Windows Hello) — passkey
   (WebAuthn) nativa do Supabase Auth. A digital/rosto nunca sai do aparelho:
   ele guarda uma chave privada e o Supabase só a chave pública; é o Supabase
   quem confere a assinatura e devolve a sessão (nada disso é feito aqui).

   O sistema fala com o Supabase direto (fetch), sem a biblioteca oficial;
   as passkeys só existem nela (@supabase/supabase-js, "experimental"), então
   ela é baixada só quando a biometria é usada, num cliente à parte que não
   guarda sessão nem renova token (quem cuida da sessão é js/admin-auth.js).

   Precisa estar ligado no painel do Supabase: Authentication → Passkeys
   (Relying Party ID iadoagro.github.io, origem https://iadoagro.github.io).

   window.BIOMETRIA:
     suportado()            — o navegador tem WebAuthn (e a página é https)
     disponivelNoAparelho() — Promise<bool>: há leitor de digital/rosto/PIN do aparelho
     temNoAparelho()        — este aparelho já cadastrou (mostra "Entrar com biometria")
     entrar()               — pede a biometria e abre a sessão do sistema
     cadastrar()            — cadastra a biometria deste aparelho na conta logada */
(function () {
  'use strict';
  var cfg = window.BANCO_CONFIG || {};
  var auth = window.ADMIN_AUTH;
  var VERSAO = '2.117.1';   // fixa: a API de passkey ainda é experimental e pode mudar
  var URL_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@' + VERSAO + '/dist/umd/supabase.js';
  var CHAVE_APARELHO = 'seagri-biometria-aparelho';

  function suportado() {
    return Boolean(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  }
  function disponivelNoAparelho() {
    if (!suportado() || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
  }
  function temNoAparelho() { try { return localStorage.getItem(CHAVE_APARELHO) === '1'; } catch (e) { return false; } }
  function marcarAparelho() { try { localStorage.setItem(CHAVE_APARELHO, '1'); } catch (e) { /* modo privado */ } }

  var cliente = null;
  function carregar() {
    if (cliente) return cliente;
    cliente = new Promise(function (ok, falhou) {
      function criar() {
        ok(window.supabase.createClient(cfg.url, cfg.chavePublica, {
          auth: { experimental: { passkey: true }, persistSession: false, autoRefreshToken: false,
            detectSessionInUrl: false, storageKey: 'seagri-biometria' }
        }));
      }
      if (window.supabase && window.supabase.createClient) return criar();
      var js = document.createElement('script');
      js.src = URL_LIB;
      js.crossOrigin = 'anonymous';
      js.onload = criar;
      js.onerror = function () { cliente = null; falhou(new Error('Não foi possível carregar a biometria. Confira a internet e tente de novo.')); };
      document.head.appendChild(js);
    });
    return cliente;
  }

  function erroLegivel(e) {
    var cod = (e && (e.code || e.name)) || '';
    var texto = (e && e.message) || '';
    if (cod === 'passkey_disabled' || /passkey.*disabled/i.test(texto)) return 'A entrada por biometria ainda não foi ligada no sistema. Avise o responsável.';
    if (cod === 'NotAllowedError' || /not allowed|cancel|abort|timed out/i.test(texto)) return 'A biometria foi cancelada ou o tempo acabou. Tente de novo.';
    if (cod === 'webauthn_credential_exists') return 'Este aparelho já tem biometria cadastrada nesta conta.';
    if (cod === 'webauthn_credential_not_found') return 'Esta biometria não está mais cadastrada. Entre com senha ou PIN e cadastre de novo.';
    if (cod === 'too_many_passkeys') return 'Esta conta já tem o máximo de aparelhos com biometria.';
    if (cod === 'webauthn_challenge_expired' || cod === 'webauthn_challenge_not_found') return 'A biometria demorou demais. Tente de novo.';
    if (cod === 'webauthn_verification_failed') return 'Não foi possível confirmar a biometria. Tente de novo.';
    return texto || 'Não foi possível usar a biometria.';
  }
  function falha(e) { var x = new Error(erroLegivel(e)); x.causa = e; return x; }

  // nome do aparelho na lista de passkeys da conta ("Samsung SM-A546E · Android 14 · Chrome")
  function nomeDoAparelho() {
    var a = window.AMBIENTE_CLIENTE && window.AMBIENTE_CLIENTE.coletar();
    return (a && a.aparelho_desc) || 'Aparelho';
  }

  async function entrar() {
    var sb = await carregar();
    var r = await sb.auth.signInWithPasskey();
    if (r.error) throw falha(r.error);
    var s = r.data && (r.data.session || r.data);
    await auth.entrarComSessao(s);
    marcarAparelho();
  }

  async function cadastrar() {
    var s = auth.sessaoAtual && auth.sessaoAtual();
    if (!s) throw new Error('Entre primeiro com senha ou PIN.');
    // token perto de vencer: renova pelo sistema antes (se o cliente à parte
    // renovasse, o refresh_token do sistema deixaria de valer)
    if (s.expires_at * 1000 - Date.now() < 5 * 60 * 1000 && auth.renovarSessao) {
      await auth.renovarSessao();
      s = auth.sessaoAtual();
    }
    var sb = await carregar();
    // O cliente à parte usa a sessão do sistema só pra este cadastro (sem renovar o token).
    var set = await sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    if (set.error) throw falha(set.error);
    var r = await sb.auth.registerPasskey();
    if (r.error) throw falha(r.error);
    marcarAparelho();
    var id = r.data && r.data.id;
    if (id && sb.auth.passkey && sb.auth.passkey.update) {
      try { await sb.auth.passkey.update({ passkeyId: id, friendlyName: nomeDoAparelho().slice(0, 120) }); } catch (e) { /* só o nome */ }
    }
    if (auth.registrarEvento) auth.registrarEvento('criar', 'acesso', 'Cadastrou a biometria deste aparelho (' + nomeDoAparelho() + ')', { metodo: 'biometria' });
  }

  window.BIOMETRIA = {
    suportado: suportado, disponivelNoAparelho: disponivelNoAparelho, temNoAparelho: temNoAparelho,
    entrar: entrar, cadastrar: cadastrar
  };
})();
