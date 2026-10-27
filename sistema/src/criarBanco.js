// Cria o banco de dados automaticamente pelo código.
// 1) Se o banco "saep_db" não existir, cria.
// 2) Se as tabelas não existirem, executa o saep_db.sql (tabelas + dados iniciais).
// Assim não é preciso abrir o pgAdmin e rodar o script na mão.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { config } = require('./db');

// Procura o saep_db.sql na raiz do projeto ou dentro de sistema/
function lerScript() {
  const caminhos = [
    path.join(__dirname, '..', '..', 'saep_db.sql'),
    path.join(__dirname, '..', 'saep_db.sql')
  ];
  const arquivo = caminhos.find((c) => fs.existsSync(c));
  if (!arquivo) throw new Error('Arquivo saep_db.sql não encontrado.');
  return fs.readFileSync(arquivo, 'utf8');
}

async function criarBanco({ recriar = false } = {}) {
  // Conecta no banco padrão "postgres" para poder criar o saep_db
  const admin = new Client({ ...config, database: 'postgres' });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1', [config.database]
    );
    if (rowCount === 0) {
      // Nome de banco não aceita parâmetro ($1); por isso só letras/números/_
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.database)) {
        throw new Error('Nome de banco inválido: ' + config.database);
      }
      await admin.query(`CREATE DATABASE ${config.database}`);
      console.log(`Banco "${config.database}" criado.`);
    }
  } finally {
    await admin.end();
  }

  // Conecta no saep_db e cria as tabelas se ainda não existirem
  const banco = new Client(config);
  await banco.connect();
  try {
    const { rows } = await banco.query("SELECT to_regclass('public.usuarios') AS tabela");
    if (recriar || !rows[0].tabela) {
      await banco.query(lerScript()); // executa o script inteiro
      console.log('Tabelas criadas e dados iniciais inseridos (saep_db.sql).');
    } else {
      console.log('Banco de dados já está pronto.');
    }
  } finally {
    await banco.end();
  }
}

// "npm run banco" -> apaga e recria tudo do zero
if (require.main === module) {
  require('dotenv').config();
  criarBanco({ recriar: true })
    .then(() => console.log('Pronto!'))
    .catch((err) => { console.error('Erro ao criar o banco:', err.message); process.exit(1); });
}

module.exports = { criarBanco };
