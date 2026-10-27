// Gerenciamento de Serviços / Cortes
// Regra de negócio: todo serviço OBRIGATORIAMENTE tem um barbeiro responsável já cadastrado.
const express = require('express');
const { pool } = require('../db');
const u = require('../util');

const router = express.Router();
router.param('id', u.validarId);

async function carregarDados() {
  const { rows: servicos } = await pool.query(
    `SELECT s.id_servico, s.nome, s.descricao, s.preco, s.duracao_min,
            b.id_barbeiro, b.nome AS barbeiro, b.ativo AS barbeiro_ativo
       FROM servicos s
       JOIN barbeiros b ON b.id_barbeiro = s.id_barbeiro
      ORDER BY s.nome`
  );
  const { rows: barbeiros } = await pool.query(
    'SELECT id_barbeiro, nome, especialidade, ativo FROM barbeiros ORDER BY nome'
  );
  return { servicos, barbeiros };
}

async function lerFormulario(body, idAtualBarbeiro) {
  const dados = {
    nome: String(body.nome || '').trim(),
    descricao: String(body.descricao || '').trim(),
    preco: Number(String(body.preco || '').replace(',', '.')),
    duracao_min: Number(body.duracao_min),
    id_barbeiro: Number(body.id_barbeiro)
  };
  const erros = [];
  if (dados.nome.length < 3) erros.push('Informe o nome do serviço (mínimo 3 letras).');
  if (!Number.isFinite(dados.preco) || dados.preco < 0 || body.preco === '') {
    erros.push('Informe um preço válido.');
  }
  if (!Number.isInteger(dados.duracao_min) || dados.duracao_min <= 0) {
    erros.push('Informe a duração em minutos.');
  }

  // Barbeiro responsável é obrigatório e precisa existir
  if (!dados.id_barbeiro) {
    erros.push('Selecione o barbeiro responsável pelo serviço.');
  } else {
    const { rows } = await pool.query(
      'SELECT ativo FROM barbeiros WHERE id_barbeiro = $1', [dados.id_barbeiro]
    );
    if (!rows.length) erros.push('O barbeiro selecionado não está cadastrado.');
    else if (!rows[0].ativo && dados.id_barbeiro !== idAtualBarbeiro) {
      erros.push('O barbeiro selecionado está inativo.');
    }
  }
  return { dados, erros };
}

async function renderizar(res, { form = {}, erros = [], status = 200 } = {}) {
  const { servicos, barbeiros } = await carregarDados();
  res.status(status).render('servicos', { servicos, barbeiros, form, erros });
}

router.get('/', async (req, res, next) => {
  try { await renderizar(res); } catch (err) { next(err); }
});

router.get('/:id/editar', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM servicos WHERE id_servico = $1', [req.params.id]);
    if (!rows.length) {
      u.avisar(req, 'erro', 'Serviço não encontrado.');
      return res.redirect('/servicos');
    }
    await renderizar(res, { form: rows[0] });
  } catch (err) { next(err); }
});

async function salvar(req, res, next) {
  const id = req.params.id || null;
  const form = { ...req.body, id_servico: id };
  try {
    // Na edição, permite manter um barbeiro que entretanto foi inativado
    let barbeiroAtual = null;
    if (id) {
      const { rows } = await pool.query('SELECT id_barbeiro FROM servicos WHERE id_servico = $1', [id]);
      if (!rows.length) {
        u.avisar(req, 'erro', 'Serviço não encontrado.');
        return res.redirect('/servicos');
      }
      barbeiroAtual = rows[0].id_barbeiro;
    }

    const { dados, erros } = await lerFormulario(req.body, barbeiroAtual);
    if (erros.length) return await renderizar(res, { form, erros, status: 400 });

    const valores = [dados.nome, dados.descricao || null, dados.preco, dados.duracao_min, dados.id_barbeiro];
    if (id) {
      await pool.query(
        `UPDATE servicos SET nome = $1, descricao = $2, preco = $3, duracao_min = $4, id_barbeiro = $5
          WHERE id_servico = $6`,
        [...valores, id]
      );
      u.avisar(req, 'sucesso', 'Serviço atualizado com sucesso.');
    } else {
      await pool.query(
        `INSERT INTO servicos (nome, descricao, preco, duracao_min, id_barbeiro)
         VALUES ($1, $2, $3, $4, $5)`,
        valores
      );
      u.avisar(req, 'sucesso', 'Serviço cadastrado com sucesso.');
    }
    res.redirect('/servicos');
  } catch (err) { next(err); }
}
router.post('/', salvar);
router.post('/:id', salvar);

router.post('/:id/excluir', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM servicos WHERE id_servico = $1', [req.params.id]);
    u.avisar(req, 'sucesso', 'Serviço excluído.');
  } catch (err) {
    if (err.code !== '23503') return next(err);
    u.avisar(req, 'erro', 'Não é possível excluir: este serviço possui agendamentos.');
  }
  res.redirect('/servicos');
});

module.exports = router;
