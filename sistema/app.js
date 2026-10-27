// Sistema de Gestão e Agendamento para Barbearia
// Node.js + Express + EJS + PostgreSQL
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { exigirLogin } = require('./src/autenticacao');
const { criarBanco } = require('./src/criarBanco');
const util = require('./src/util');

const app = express();
const PORTA = Number(process.env.PORTA || 3000);
const EXPIRA_MIN = Number(process.env.SESSION_EXPIRA_MIN || 30);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Funções de formatação disponíveis em todas as telas
app.locals.formatarData = util.formatarData;
app.locals.formatarHora = util.formatarHora;
app.locals.formatarMoeda = util.formatarMoeda;
app.locals.mascararCpf = util.mascararCpf;
app.locals.formatarCpf = util.formatarCpf;
app.locals.EXPIRA_MIN = EXPIRA_MIN;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessão com tempo de expiração: depois de EXPIRA_MIN minutos sem uso,
// o cookie expira e o usuário precisa fazer login de novo.
app.use(session({
  name: 'barbearia.sid',
  secret: process.env.SESSION_SECRET || 'troque-este-segredo',
  resave: false,
  saveUninitialized: false,
  rolling: true, // cada requisição renova o prazo
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: EXPIRA_MIN * 60 * 1000 }
}));

// Disponibiliza usuário logado e mensagem de aviso para as telas
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.mensagem = req.session.mensagem || null;
  delete req.session.mensagem;
  res.locals.paginaAtual = req.path.split('/')[1] || '';
  next();
});

// Rotas públicas
app.use('/', require('./src/rotas/login'));

// Rotas protegidas
app.use('/painel', exigirLogin, require('./src/rotas/painel'));
app.use('/clientes', exigirLogin, require('./src/rotas/clientes'));
app.use('/barbeiros', exigirLogin, require('./src/rotas/barbeiros'));
app.use('/servicos', exigirLogin, require('./src/rotas/servicos'));
app.use('/agendamentos', exigirLogin, require('./src/rotas/agendamentos'));

app.get('/', (req, res) => res.redirect(req.session.usuario ? '/painel' : '/login'));

// 404
app.use((req, res) => {
  res.status(404).render('erro', {
    titulo: 'Página não encontrada',
    detalhe: 'O endereço acessado não existe.'
  });
});

// Erros gerais
app.use((err, req, res, next) => {
  console.error(err);
  let detalhe = 'Ocorreu um erro inesperado. Tente novamente.';
  if (['ECONNREFUSED', '28P01', '3D000', '42P01'].includes(err.code)) {
    detalhe = 'Não foi possível acessar o banco de dados. Confira se o PostgreSQL está ligado, '
      + 'se usuário e senha em src/db.js (ou no .env) estão certos.';
  }
  res.status(500).render('erro', { titulo: 'Erro no sistema', detalhe });
});

// Antes de ligar o servidor, cria o banco e as tabelas (se ainda não existirem)
criarBanco()
  .then(() => {
    app.listen(PORTA, () => {
      console.log(`Sistema da barbearia rodando em http://localhost:${PORTA}`);
      console.log(`A sessão expira após ${EXPIRA_MIN} minutos sem uso.`);
    });
  })
  .catch((err) => {
    console.error('\nNão foi possível preparar o banco de dados:', err.message);
    console.error('Confira se o PostgreSQL está ligado e se usuário/senha em src/db.js (ou no .env) estão certos.\n');
    process.exit(1);
  });
