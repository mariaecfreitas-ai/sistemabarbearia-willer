// Conexão com o PostgreSQL (pool de conexões)
const { Pool, types } = require('pg');

// Devolve DATE como texto 'AAAA-MM-DD' (evita o JavaScript mudar o dia por causa do fuso)
types.setTypeParser(1082, (valor) => valor);

// ================================================================
//  CONFIGURAÇÃO DO BANCO — coloque aqui os dados do SEU PostgreSQL
//  (os mesmos que você usa para entrar no pgAdmin).
//  Se existir um arquivo .env, os valores dele têm prioridade.
// ================================================================
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORTA || 5432),
  user: process.env.DB_USUARIO || 'postgres',
  password: process.env.DB_SENHA || 'senai',   // <- troque pela sua senha
  database: process.env.DB_NOME || 'saep_db'
};

const pool = new Pool(config);

// Chave usada pelo pgcrypto para criptografar CPF e telefone
// (precisa ser a mesma do saep_db.sql)
const CHAVE = () => process.env.CHAVE_CRIPTO || 'barbearia_saep_2026';

module.exports = { pool, config, CHAVE };
