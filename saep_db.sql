-- =====================================================================
--  SAEP - Sistema de Gestão e Agendamento para Barbearia
--  Script de criação e população do banco de dados (PostgreSQL)
-- ---------------------------------------------------------------------
--  COMO USAR NO pgADMIN:
--   1. Crie o banco:  botão direito em "Databases" > Create > Database
--      Nome: saep_db   (ou rode:  CREATE DATABASE saep_db;)
--   2. Clique no banco saep_db > Query Tool
--   3. Abra este arquivo e execute tudo (F5)
--
--  SEGURANÇA / LGPD (extensão pgcrypto):
--   - Senha ......: hash bcrypt  -> crypt(senha, gen_salt('bf'))  (irreversível)
--   - CPF/Telefone: criptografia simétrica -> pgp_sym_encrypt(valor, chave)
--   - cpf_hash ...: HMAC-SHA256 do CPF, só para impedir CPF duplicado
--                   sem precisar guardar o CPF aberto.
--   A chave abaixo ('barbearia_saep_2026') precisa ser IGUAL à variável
--   CHAVE_CRIPTO do arquivo sistema/.env
--
--  O script pode ser executado várias vezes (ele apaga e recria tudo).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS agendamentos CASCADE;
DROP TABLE IF EXISTS servicos     CASCADE;
DROP TABLE IF EXISTS barbeiros    CASCADE;
DROP TABLE IF EXISTS clientes     CASCADE;
DROP TABLE IF EXISTS usuarios     CASCADE;

-- ---------------------------------------------------------------------
-- USUÁRIOS (quem acessa o sistema)
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario  SERIAL       PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    email       VARCHAR(100) NOT NULL UNIQUE,
    senha       TEXT         NOT NULL,               -- hash bcrypt
    criado_em   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
    id_cliente       SERIAL       PRIMARY KEY,
    nome             VARCHAR(100) NOT NULL,
    cpf              BYTEA        NOT NULL,          -- criptografado
    cpf_hash         CHAR(64)     NOT NULL UNIQUE,   -- HMAC p/ evitar duplicidade
    telefone         BYTEA        NOT NULL,          -- criptografado
    email            VARCHAR(100),
    data_nascimento  DATE,
    criado_em        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- BARBEIROS
-- ---------------------------------------------------------------------
CREATE TABLE barbeiros (
    id_barbeiro    SERIAL       PRIMARY KEY,
    nome           VARCHAR(100) NOT NULL,
    cpf            BYTEA        NOT NULL,            -- criptografado
    cpf_hash       CHAR(64)     NOT NULL UNIQUE,
    telefone       BYTEA        NOT NULL,            -- criptografado
    especialidade  VARCHAR(100),
    ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- SERVIÇOS / CORTES (todo serviço tem um barbeiro responsável)
-- ---------------------------------------------------------------------
CREATE TABLE servicos (
    id_servico   SERIAL        PRIMARY KEY,
    nome         VARCHAR(100)  NOT NULL,
    descricao    VARCHAR(255),
    preco        NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
    duracao_min  INTEGER       NOT NULL CHECK (duracao_min > 0),
    id_barbeiro  INTEGER       NOT NULL
                 REFERENCES barbeiros (id_barbeiro) ON DELETE RESTRICT
);

-- ---------------------------------------------------------------------
-- AGENDAMENTOS
-- ---------------------------------------------------------------------
CREATE TABLE agendamentos (
    id_agendamento    SERIAL      PRIMARY KEY,
    id_cliente        INTEGER     NOT NULL
                      REFERENCES clientes (id_cliente) ON DELETE RESTRICT,
    id_servico        INTEGER     NOT NULL
                      REFERENCES servicos (id_servico) ON DELETE RESTRICT,
    data_agendamento  DATE        NOT NULL,
    horario           TIME        NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'Agendado'
                      CHECK (status IN ('Agendado', 'Concluído', 'Cancelado')),
    observacao        VARCHAR(255),
    criado_em         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agendamentos_data ON agendamentos (data_agendamento, horario);

-- =====================================================================
-- MASSA DE DADOS INICIAL
-- =====================================================================

-- Usuários (senha de todos: 123456)
INSERT INTO usuarios (nome, email, senha) VALUES
    ('Administrador',  'admin@barbearia.com',    crypt('123456', gen_salt('bf'))),
    ('Carla Recepção', 'carla@barbearia.com',    crypt('123456', gen_salt('bf'))),
    ('Marcos Gerente', 'marcos@barbearia.com',   crypt('123456', gen_salt('bf')));

-- Clientes (CPF e telefone criptografados com a chave do .env)
INSERT INTO clientes (nome, cpf, cpf_hash, telefone, email, data_nascimento)
SELECT v.nome,
       pgp_sym_encrypt(v.cpf, k.chave),
       encode(hmac(v.cpf, k.chave, 'sha256'), 'hex'),
       pgp_sym_encrypt(v.telefone, k.chave),
       v.email,
       v.nascimento::DATE
FROM (VALUES
    ('João Pereira',     '52601815906', '(48) 99811-2233', 'joao.pereira@email.com', '1995-03-12'),
    ('Lucas Andrade',    '08301661305', '(48) 99722-4455', 'lucas.andrade@email.com', '1988-07-25'),
    ('Rafael Souza',     '18609139034', '(48) 99633-6677', 'rafael.souza@email.com',  '2001-11-02'),
    ('Pedro Henrique',   '99603082430', '(48) 99544-8899', 'pedro.h@email.com',       '1999-01-18')
) AS v (nome, cpf, telefone, email, nascimento)
CROSS JOIN (SELECT 'barbearia_saep_2026'::TEXT AS chave) AS k;

-- Barbeiros
INSERT INTO barbeiros (nome, cpf, cpf_hash, telefone, especialidade)
SELECT v.nome,
       pgp_sym_encrypt(v.cpf, k.chave),
       encode(hmac(v.cpf, k.chave, 'sha256'), 'hex'),
       pgp_sym_encrypt(v.telefone, k.chave),
       v.especialidade
FROM (VALUES
    ('Carlos "Navalha" Silva', '62819482112', '(48) 98811-1001', 'Barba e navalha'),
    ('André Costa',            '99351819019', '(48) 98822-2002', 'Degradê e cortes modernos'),
    ('Bruno Oliveira',         '93786579741', '(48) 98833-3003', 'Cortes clássicos'),
    ('Diego Martins',          '54323194897', '(48) 98844-4004', 'Coloração e platinado')
) AS v (nome, cpf, telefone, especialidade)
CROSS JOIN (SELECT 'barbearia_saep_2026'::TEXT AS chave) AS k;

-- Serviços (cada um vinculado a um barbeiro já cadastrado)
INSERT INTO servicos (nome, descricao, preco, duracao_min, id_barbeiro) VALUES
    ('Barba completa',   'Barba com toalha quente e navalha',     35.00, 30, 1),
    ('Corte degradê',    'Degradê na máquina com acabamento',     45.00, 40, 2),
    ('Corte social',     'Corte clássico na tesoura',             40.00, 30, 3),
    ('Corte + barba',    'Combo corte degradê e barba',           70.00, 60, 2),
    ('Platinado',        'Descoloração e matização',             120.00, 90, 4);

-- Agendamentos (datas relativas a hoje, para sempre aparecerem no painel)
INSERT INTO agendamentos (id_cliente, id_servico, data_agendamento, horario, status, observacao) VALUES
    (1, 2, CURRENT_DATE,     '09:00', 'Agendado',  'Cliente prefere máquina 1 nas laterais'),
    (2, 1, CURRENT_DATE,     '10:30', 'Agendado',  NULL),
    (3, 3, CURRENT_DATE + 1, '14:00', 'Agendado',  NULL),
    (4, 4, CURRENT_DATE + 1, '16:00', 'Agendado',  'Primeira visita'),
    (1, 5, CURRENT_DATE + 2, '11:00', 'Agendado',  NULL),
    (2, 3, CURRENT_DATE - 1, '15:00', 'Concluído', NULL);

-- Conferência rápida (descriptografando com a chave):
-- SELECT nome, pgp_sym_decrypt(cpf, 'barbearia_saep_2026') AS cpf,
--        pgp_sym_decrypt(telefone, 'barbearia_saep_2026') AS telefone
-- FROM clientes;
