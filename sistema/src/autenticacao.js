// Middleware que protege as rotas: só passa quem está logado.
// Quando a sessão expira, o cookie deixa de valer e o usuário volta ao login.
function exigirLogin(req, res, next) {
  if (req.session && req.session.usuario) return next();
  req.session.mensagem = {
    tipo: 'erro',
    texto: 'Sua sessão expirou ou você não está logado. Faça login novamente.'
  };
  return res.redirect('/login');
}

module.exports = { exigirLogin };
