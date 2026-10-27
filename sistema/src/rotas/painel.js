// Funcionalidade principal: painel com nome do usuário, navegação e logout
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows: [totais] } = await pool.query(`
      SELECT (SELECT COUNT(*) FROM clientes)  AS clientes,
             (SELECT COUNT(*) FROM barbeiros) AS barbeiros,
             (SELECT COUNT(*) FROM servicos)  AS servicos,
             (SELECT COUNT(*) FROM agendamentos
               WHERE data_agendamento = CURRENT_DATE AND status = 'Agendado') AS hoje`);

    const { rows: proximos } = await pool.query(`
      SELECT a.data_agendamento, a.horario, c.nome AS cliente, s.nome AS servico, b.nome AS barbeiro
        FROM agendamentos a
        JOIN clientes  c ON c.id_cliente  = a.id_cliente
        JOIN servicos  s ON s.id_servico  = a.id_servico
        JOIN barbeiros b ON b.id_barbeiro = s.id_barbeiro
       WHERE a.status = 'Agendado' AND a.data_agendamento >= CURRENT_DATE
       ORDER BY a.data_agendamento, a.horario
       LIMIT 5`);

    res.render('painel', { totais, proximos });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
