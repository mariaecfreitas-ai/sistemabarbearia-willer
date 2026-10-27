// Funções auxiliares de validação e formatação

const somenteNumeros = (valor) => String(valor || '').replace(/\D/g, '');

// Valida CPF pelos dígitos verificadores
function cpfValido(cpf) {
  const n = somenteNumeros(cpf);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(n[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(n[t])) return false;
  }
  return true;
}

const formatarCpf = (cpf) =>
  somenteNumeros(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

// LGPD: na listagem o CPF aparece mascarado
function mascararCpf(cpf) {
  const n = somenteNumeros(cpf);
  return n.length === 11 ? `***.${n.slice(3, 6)}.${n.slice(6, 9)}-**` : '***';
}

const telefoneValido = (tel) => [10, 11].includes(somenteNumeros(tel).length);
const emailValido = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));

const formatarData = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const formatarHora = (h) => (h ? String(h).slice(0, 5) : '');
const formatarMoeda = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Mensagem que aparece uma única vez na próxima tela
function avisar(req, tipo, texto) {
  req.session.mensagem = { tipo, texto };
}

// router.param: garante que :id seja um número inteiro (senão, 404)
function validarId(req, res, next, id) {
  if (/^\d{1,9}$/.test(id)) return next();
  return res.status(404).render('erro', {
    titulo: 'Registro não encontrado',
    detalhe: 'O código informado é inválido.'
  });
}

module.exports = {
  validarId,
  somenteNumeros, cpfValido, formatarCpf, mascararCpf, telefoneValido, emailValido,
  formatarData, formatarHora, formatarMoeda, avisar
};
