// Gerenciamento de Clientes (cadastro, edição, exclusão e BUSCA)
const express = require('express');
const { pool, CHAVE } = require('../db');
const u = require('../util');

const router = express.Router();
router.param('id', u.validarId);

// Lista os clientes; se houver termo de busca, filtra por nome, e-mail, CPF ou telefone.
// CPF e telefone são descriptografados só dentro do banco, com a chave do .env.
async function listarClientes(busca = '') {
  const termo = busca.trim();
  const numeros = u.somenteNumeros(termo);
  const { rows } = await pool.query(
    `SELECT id_cliente, nome, email, data_nascimento,
            pgp_sym_decrypt(cpf, $3)      AS cpf,
            pgp_sym_decrypt(telefone, $3) AS telefone
       FROM clientes
      WHERE $1 = ''
         OR nome  ILIKE '%' || $1 || '%'
         OR email ILIKE '%' || $1 || '%'
         OR ($2 <> '' AND (
               pgp_sym_decrypt(cpf, $3) LIKE '%' || $2 || '%'
            OR regexp_replace(pgp_sym_decrypt(telefone, $3), '\\D', '', 'g') LIKE '%' || $2 || '%'))
      ORDER BY nome`,
    [termo, numeros, CHAVE()]
  );
  return rows;
}

// Lê e valida os campos do formulário
function lerFormulario(body) {
  const dados = {
    nome: String(body.nome || '').trim(),
    cpf: u.somenteNumeros(body.cpf),
    telefone: String(body.telefone || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    data_nascimento: body.data_nascimento || null
  };
  const erros = [];
  if (dados.nome.length < 3) erros.push('Informe o nome do cliente (mínimo 3 letras).');
  if (!u.cpfValido(dados.cpf)) erros.push('CPF inválido.');
  if (!u.telefoneValido(dados.telefone)) erros.push('Telefone inválido. Use DDD + número.');
  if (dados.email && !u.emailValido(dados.email)) erros.push('E-mail inválido.');
  if (dados.data_nascimento && dados.data_nascimento > new Date().toISOString().slice(0, 10)) {
    erros.push('A data de nascimento não pode ser no futuro.');
  }
  return { dados, erros };
}

async function renderizar(res, { busca = '', form = {}, erros = [], status = 200 } = {}) {
  const clientes = await listarClientes(busca);
  res.status(status).render('clientes', { clientes, busca, form, erros });
}

// LISTAR / BUSCAR  — /clientes?busca=termo
router.get('/', async (req, res, next) => {
  try {
    await renderizar(res, { busca: String(req.query.busca || '') });
  } catch (err) { next(err); }
});

// TELA DE EDIÇÃO
router.get('/:id/editar', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_cliente, nome, email, data_nascimento,
              pgp_sym_decrypt(cpf, $2) AS cpf, pgp_sym_decrypt(telefone, $2) AS telefone
         FROM clientes WHERE id_cliente = $1`,
      [req.params.id, CHAVE()]
    );
    if (!rows.length) {
      u.avisar(req, 'erro', 'Cliente não encontrado.');
      return res.redirect('/clientes');
    }
    rows[0].cpf = u.formatarCpf(rows[0].cpf);
    await renderizar(res, { form: rows[0] });
  } catch (err) { next(err); }
});

// SALVAR (novo ou edição)
async function salvar(req, res, next) {
  const id = req.params.id || null;
  const { dados, erros } = lerFormulario(req.body);
  const form = { ...req.body, id_cliente: id };
  try {
    if (erros.length) return await renderizar(res, { form, erros, status: 400 });

    const valores = [dados.nome, dados.cpf, dados.telefone, dados.email || null,
      dados.data_nascimento, CHAVE()];
    if (id) {
      await pool.query(
        `UPDATE clientes
            SET nome = $1, cpf = pgp_sym_encrypt($2, $6),
                cpf_hash = encode(hmac($2, $6, 'sha256'), 'hex'),
                telefone = pgp_sym_encrypt($3, $6), email = $4, data_nascimento = $5
          WHERE id_cliente = $7`,
        [...valores, id]
      );
      u.avisar(req, 'sucesso', 'Cliente atualizado com sucesso.');
    } else {
      await pool.query(
        `INSERT INTO clientes (nome, cpf, cpf_hash, telefone, email, data_nascimento)
         VALUES ($1, pgp_sym_encrypt($2, $6), encode(hmac($2, $6, 'sha256'), 'hex'),
                 pgp_sym_encrypt($3, $6), $4, $5)`,
        valores
      );
      u.avisar(req, 'sucesso', 'Cliente cadastrado com sucesso.');
    }
    res.redirect('/clientes');
  } catch (err) {
    if (err.code === '23505') {
      return renderizar(res, { form, erros: ['Já existe um cliente com este CPF.'], status: 400 })
        .catch(next);
    }
    next(err);
  }
}
router.post('/', salvar);
router.post('/:id', salvar);

// EXCLUIR
router.post('/:id/excluir', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM clientes WHERE id_cliente = $1', [req.params.id]);
    u.avisar(req, 'sucesso', 'Cliente excluído.');
  } catch (err) {
    if (err.code !== '23503') return next(err);
    u.avisar(req, 'erro', 'Não é possível excluir: este cliente possui agendamentos.');
  }
  res.redirect('/clientes');
});

module.exports = router;
