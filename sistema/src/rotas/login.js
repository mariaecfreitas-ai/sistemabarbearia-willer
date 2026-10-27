// Funcionalidade de Login / Logout
const express = require('express');
const { pool } = require('../db');
const { emailValido } = require('../util');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/painel');
  res.render('login', { email: '', saiu: req.query.saiu === '1' });
});

router.post('/login', async (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');

  const falhar = (texto) =>
    res.status(401).render('login', { email, mensagem: { tipo: 'erro', texto } });

  // Validação dos campos
  if (!email || !senha) return falhar('Preencha o e-mail e a senha.');
  if (!emailValido(email)) return falhar('Informe um e-mail válido.');

  try {
    // A senha é conferida pelo próprio PostgreSQL (pgcrypto/bcrypt):
    // crypt(senha_digitada, hash_salvo) só é igual ao hash se a senha estiver certa.
    const { rows } = await pool.query(
      `SELECT id_usuario, nome, email
         FROM usuarios
        WHERE email = $1 AND senha = crypt($2, senha)`,
      [email, senha]
    );

    // Mesma mensagem para usuário inexistente ou senha errada (não revela qual dos dois)
    if (rows.length === 0) return falhar('Usuário ou senha inválidos.');

    // Gera uma sessão nova para evitar fixação de sessão
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuario = { id: rows[0].id_usuario, nome: rows[0].nome, email: rows[0].email };
      req.session.mensagem = { tipo: 'sucesso', texto: `Bem-vindo(a), ${rows[0].nome}!` };
      res.redirect('/painel');
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('barbearia.sid');
    res.redirect('/login?saiu=1');
  });
});

module.exports = router;
