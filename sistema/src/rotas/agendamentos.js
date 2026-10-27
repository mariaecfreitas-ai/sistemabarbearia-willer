// Gerenciamento de Agendamentos
// Lista todos os atendimentos ordenados por dia e horário, com os dados completos
// do cliente, do serviço contratado e do barbeiro designado.
const express = require('express');
const { pool, CHAVE } = require('../db');
const u = require('../util');

const router = express.Router();
router.param('id', u.validarId);

const STATUS = ['Agendado', 'Concluído', 'Cancelado'];

async function listarAgendamentos(filtro) {
  const { rows } = await pool.query(
    `SELECT a.id_agendamento, a.data_agendamento, a.horario, a.status, a.observacao,
            (a.horario + make_interval(mins => s.duracao_min))::TIME AS horario_fim,
            c.id_cliente, c.nome AS cliente_nome, c.email AS cliente_email,
            pgp_sym_decrypt(c.cpf, $3)      AS cliente_cpf,
            pgp_sym_decrypt(c.telefone, $3) AS cliente_telefone,
            s.id_servico, s.nome AS servico_nome, s.preco, s.duracao_min,
            b.id_barbeiro, b.nome AS barbeiro_nome, b.especialidade AS barbeiro_especialidade,
            pgp_sym_decrypt(b.telefone, $3) AS barbeiro_telefone
       FROM agendamentos a
       JOIN clientes  c ON c.id_cliente  = a.id_cliente
       JOIN servicos  s ON s.id_servico  = a.id_servico
       JOIN barbeiros b ON b.id_barbeiro = s.id_barbeiro
      WHERE ($1 = '' OR a.data_agendamento = NULLIF($1, '')::DATE)
        AND ($2 = '' OR a.status = $2)
      ORDER BY a.data_agendamento, a.horario`,
    [filtro.data || '', filtro.status || '', CHAVE()]
  );
  return rows;
}

async function carregarOpcoes() {
  const { rows: clientes } = await pool.query('SELECT id_cliente, nome FROM clientes ORDER BY nome');
  const { rows: servicos } = await pool.query(
    `SELECT s.id_servico, s.nome, s.preco, s.duracao_min, b.nome AS barbeiro, b.ativo
       FROM servicos s JOIN barbeiros b ON b.id_barbeiro = s.id_barbeiro
      ORDER BY s.nome`
  );
  return { clientes, servicos };
}

async function renderizar(res, req, { form = {}, erros = [], status = 200 } = {}) {
  const filtro = {
    data: /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : '',
    status: STATUS.includes(req.query.status) ? req.query.status : ''
  };
  const [agendamentos, opcoes] = await Promise.all([listarAgendamentos(filtro), carregarOpcoes()]);
  res.status(status).render('agendamentos', {
    agendamentos, ...opcoes, form, erros, filtro, STATUS
  });
}

// Valida os dados e verifica choque de horário do barbeiro
async function validar(body, idAgendamento) {
  const dados = {
    id_cliente: Number(body.id_cliente),
    id_servico: Number(body.id_servico),
    data_agendamento: String(body.data_agendamento || ''),
    horario: String(body.horario || ''),
    status: STATUS.includes(body.status) ? body.status : 'Agendado',
    observacao: String(body.observacao || '').trim()
  };
  const erros = [];
  if (!dados.id_cliente) erros.push('Selecione o cliente.');
  if (!dados.id_servico) erros.push('Selecione o serviço.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data_agendamento)) erros.push('Informe a data.');
  if (!/^\d{2}:\d{2}$/.test(dados.horario.slice(0, 5))) erros.push('Informe o horário.');
  if (erros.length) return { dados, erros };

  const { rows: [ref] } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM clientes WHERE id_cliente = $1) AS cliente,
            (SELECT id_barbeiro FROM servicos WHERE id_servico = $2) AS id_barbeiro,
            ($3::DATE + $4::TIME) < LOCALTIMESTAMP AS passado`,
    [dados.id_cliente, dados.id_servico, dados.data_agendamento, dados.horario]
  );
  if (Number(ref.cliente) === 0) erros.push('Cliente não encontrado.');
  if (!ref.id_barbeiro) erros.push('Serviço não encontrado.');
  if (!idAgendamento && ref.passado) erros.push('Não é possível agendar em data/horário que já passou.');

  // Choque de horário: o mesmo barbeiro não pode ter dois atendimentos sobrepostos
  if (!erros.length && dados.status === 'Agendado') {
    const { rows: choque } = await pool.query(
      `SELECT c.nome AS cliente, a.horario
         FROM agendamentos a
         JOIN servicos s ON s.id_servico = a.id_servico
         JOIN clientes c ON c.id_cliente = a.id_cliente
         JOIN servicos novo ON novo.id_servico = $2
        WHERE s.id_barbeiro = novo.id_barbeiro
          AND a.status = 'Agendado'
          AND a.data_agendamento = $3::DATE
          AND a.id_agendamento <> COALESCE($1, 0)
          AND a.horario < ($4::TIME + make_interval(mins => novo.duracao_min))
          AND $4::TIME < (a.horario + make_interval(mins => s.duracao_min))
        LIMIT 1`,
      [idAgendamento, dados.id_servico, dados.data_agendamento, dados.horario]
    );
    if (choque.length) {
      erros.push(`Choque de horário: o barbeiro já atende ${choque[0].cliente} às `
        + `${u.formatarHora(choque[0].horario)} nesse dia.`);
    }
  }
  return { dados, erros };
}

router.get('/', async (req, res, next) => {
  try { await renderizar(res, req); } catch (err) { next(err); }
});

router.get('/:id/editar', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM agendamentos WHERE id_agendamento = $1', [req.params.id]
    );
    if (!rows.length) {
      u.avisar(req, 'erro', 'Agendamento não encontrado.');
      return res.redirect('/agendamentos');
    }
    rows[0].horario = u.formatarHora(rows[0].horario);
    await renderizar(res, req, { form: rows[0] });
  } catch (err) { next(err); }
});

async function salvar(req, res, next) {
  const id = req.params.id ? Number(req.params.id) : null;
  const form = { ...req.body, id_agendamento: id };
  try {
    const { dados, erros } = await validar(req.body, id);
    if (erros.length) return await renderizar(res, req, { form, erros, status: 400 });

    const valores = [dados.id_cliente, dados.id_servico, dados.data_agendamento,
      dados.horario, dados.status, dados.observacao || null];
    if (id) {
      const r = await pool.query(
        `UPDATE agendamentos
            SET id_cliente = $1, id_servico = $2, data_agendamento = $3, horario = $4,
                status = $5, observacao = $6
          WHERE id_agendamento = $7`,
        [...valores, id]
      );
      u.avisar(req, r.rowCount ? 'sucesso' : 'erro',
        r.rowCount ? 'Agendamento atualizado com sucesso.' : 'Agendamento não encontrado.');
    } else {
      await pool.query(
        `INSERT INTO agendamentos (id_cliente, id_servico, data_agendamento, horario, status, observacao)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        valores
      );
      u.avisar(req, 'sucesso', 'Agendamento cadastrado com sucesso.');
    }
    res.redirect('/agendamentos');
  } catch (err) { next(err); }
}
router.post('/', salvar);
router.post('/:id', salvar);

// Atalho para concluir/cancelar direto da listagem
router.post('/:id/status', async (req, res, next) => {
  try {
    // Só conclui ou cancela; voltar para "Agendado" passa pela edição (que checa choque de horário)
    if (!['Concluído', 'Cancelado'].includes(req.body.status)) {
      u.avisar(req, 'erro', 'Status inválido.');
    } else {
      await pool.query('UPDATE agendamentos SET status = $1 WHERE id_agendamento = $2',
        [req.body.status, req.params.id]);
      u.avisar(req, 'sucesso', `Agendamento marcado como ${req.body.status}.`);
    }
    res.redirect('/agendamentos');
  } catch (err) { next(err); }
});

router.post('/:id/excluir', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM agendamentos WHERE id_agendamento = $1', [req.params.id]);
    u.avisar(req, 'sucesso', 'Agendamento excluído.');
    res.redirect('/agendamentos');
  } catch (err) { next(err); }
});

module.exports = router;
