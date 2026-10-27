// Gerenciamento de Barbeiros
const express = require('express');
const { pool, CHAVE } = require('../db');
const u = require('../util');

const router = express.Router();
router.param('id', u.validarId);

async function listarBarbeiros() {
  const { rows } = await pool.query(
    `SELECT b.id_barbeiro, b.nome, b.especialidade, b.ativo,
            pgp_sym_decrypt(b.cpf, $1)      AS cpf,
            pgp_sym_decrypt(b.telefone, $1) AS telefone,
            (SELECT COUNT(*) FROM servicos s WHERE s.id_barbeiro = b.id_barbeiro) AS qtd_servicos
       FROM barbeiros b
      ORDER BY b.nome`,
    [CHAVE()]
  );
  return rows;
}

function lerFormulario(body) {
  const dados = {
    nome: String(body.nome || '').trim(),
    cpf: u.somenteNumeros(body.cpf),
    telefone: String(body.telefone || '').trim(),
    especialidade: String(body.especialidade || '').trim(),
    ativo: body.ativo === 'on' || body.ativo === 'true'
  };
  const erros = [];
  if (dados.nome.length < 3) erros.push('Informe o nome do barbeiro (mínimo 3 letras).');
  if (!u.cpfValido(dados.cpf)) erros.push('CPF inválido.');
  if (!u.telefoneValido(dados.telefone)) erros.push('Telefone inválido. Use DDD + número.');
  return { dados, erros };
}

async function renderizar(res, { form = { ativo: true }, erros = [], status = 200 } = {}) {
  const barbeiros = await listarBarbeiros();
  res.status(status).render('barbeiros', { barbeiros, form, erros });
}

router.get('/', async (req, res, next) => {
  try { await renderizar(res); } catch (err) { next(err); }
});

router.get('/:id/editar', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_barbeiro, nome, especialidade, ativo,
              pgp_sym_decrypt(cpf, $2) AS cpf, pgp_sym_decrypt(telefone, $2) AS telefone
         FROM barbeiros WHERE id_barbeiro = $1`,
      [req.params.id, CHAVE()]
    );
    if (!rows.length) {
      u.avisar(req, 'erro', 'Barbeiro não encontrado.');
      return res.redirect('/barbeiros');
    }
    rows[0].cpf = u.formatarCpf(rows[0].cpf);
    await renderizar(res, { form: rows[0] });
  } catch (err) { next(err); }
});

async function salvar(req, res, next) {
  const id = req.params.id || null;
  const { dados, erros } = lerFormulario(req.body);
  const form = { ...req.body, ativo: dados.ativo, id_barbeiro: id };
  try {
    if (erros.length) return await renderizar(res, { form, erros, status: 400 });

    const valores = [dados.nome, dados.cpf, dados.telefone, dados.especialidade || null,
      dados.ativo, CHAVE()];
    if (id) {
      await pool.query(
        `UPDATE barbeiros
            SET nome = $1, cpf = pgp_sym_encrypt($2, $6),
                cpf_hash = encode(hmac($2, $6, 'sha256'), 'hex'),
                telefone = pgp_sym_encrypt($3, $6), especialidade = $4, ativo = $5
          WHERE id_barbeiro = $7`,
        [...valores, id]
      );
      u.avisar(req, 'sucesso', 'Barbeiro atualizado com sucesso.');
    } else {
      await pool.query(
        `INSERT INTO barbeiros (nome, cpf, cpf_hash, telefone, especialidade, ativo)
         VALUES ($1, pgp_sym_encrypt($2, $6), encode(hmac($2, $6, 'sha256'), 'hex'),
                 pgp_sym_encrypt($3, $6), $4, $5)`,
        valores
      );
      u.avisar(req, 'sucesso', 'Barbeiro cadastrado com sucesso.');
    }
    res.redirect('/barbeiros');
  } catch (err) {
    if (err.code === '23505') {
      return renderizar(res, { form, erros: ['Já existe um barbeiro com este CPF.'], status: 400 })
        .catch(next);
    }
    next(err);
  }
}
router.post('/', salvar);
router.post('/:id', salvar);

router.post('/:id/excluir', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM barbeiros WHERE id_barbeiro = $1', [req.params.id]);
    u.avisar(req, 'sucesso', 'Barbeiro excluído.');
  } catch (err) {
    if (err.code !== '23503') return next(err);
    u.avisar(req, 'erro',
      'Não é possível excluir: este barbeiro é responsável por serviços. Você pode marcá-lo como inativo.');
  }
  res.redirect('/barbeiros');
});

module.exports = router;
