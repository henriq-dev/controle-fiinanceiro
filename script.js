// ===== Estado da aplicação =====
// Cada pessoa que abrir este site em seu próprio navegador terá os
// seus próprios dados, guardados localmente no aparelho (localStorage).
// Ninguém mais tem acesso a essas informações.
const STORAGE_KEY = 'controle-financeiro-dados';

let dados = {
  tema: 'light',
  salario: 0,
  valorSemana: 0,
  valorSabado: 0,
  valorDomingo: 0,
  contas: [],          // <- começa vazia: cada pessoa cadastra as suas contas
  diasTrabalhados: {}  // "YYYY-M-D": true
};

const hojeInicial = new Date();
let mesExibido = { ano: hojeInicial.getFullYear(), mes: hojeInicial.getMonth() };

// ===== Utilitário: formata número para moeda brasileira =====
function formatarMoeda(v) {
  const num = Number(v) || 0;
  const abs = Math.abs(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (num < 0 ? '-R$ ' : 'R$ ') + abs;
}

// ===== Salvar / carregar (localStorage = guarda só neste navegador) =====
let saveTimeout = null;
function salvar() {
  const statusEl = document.getElementById('statusSalvo');
  // "Debounce": espera a pessoa parar de digitar por 400ms antes de salvar,
  // assim não gravamos a cada letra digitada.
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
      statusEl.textContent = 'Salvo ✓';
      setTimeout(() => { statusEl.textContent = ''; }, 1500);
    } catch (e) {
      statusEl.textContent = 'Não foi possível salvar agora.';
      console.error('Erro ao salvar:', e);
    }
  }, 400);
}

function carregar() {
  let temaSalvo = false;
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (bruto) {
      const salvos = JSON.parse(bruto);
      if (salvos && typeof salvos.tema === 'string') temaSalvo = true;
      dados = Object.assign(dados, salvos);
    }
  } catch (e) {
    console.log('Nada salvo ainda, usando dados iniciais.');
  }
  // Se a pessoa nunca escolheu um tema antes, segue a preferência do sistema.
  if (!temaSalvo && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    dados.tema = 'dark';
  }
}

// ===== Renderização da tabela de contas =====
function renderContas() {
  const tbody = document.getElementById('tabelaContas');
  const aviso = document.getElementById('avisoVazio');
  tbody.innerHTML = '';

  aviso.style.display = dados.contas.length === 0 ? 'block' : 'none';

  dados.contas.forEach((conta, i) => {
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    const inputNome = document.createElement('input');
    inputNome.type = 'text';
    inputNome.value = conta.nome;
    inputNome.placeholder = 'nome da conta';
    inputNome.addEventListener('input', e => { conta.nome = e.target.value; salvar(); });
    tdNome.appendChild(inputNome);

    const tdValor = document.createElement('td');
    const inputValor = document.createElement('input');
    inputValor.type = 'number';
    inputValor.step = '0.01';
    inputValor.min = '0';
    inputValor.value = conta.valor;
    inputValor.addEventListener('input', e => { conta.valor = parseFloat(e.target.value) || 0; salvar(); renderResumo(); });
    tdValor.appendChild(inputValor);

    const tdStatus = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'status ' + (conta.status === 'Pago' ? 'pago' : 'pendente');
    ['Pago', 'Pendente'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (conta.status === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', e => {
      conta.status = e.target.value;
      select.className = 'status ' + (conta.status === 'Pago' ? 'pago' : 'pendente');
      salvar(); renderResumo();
    });
    tdStatus.appendChild(select);

    const tdRemover = document.createElement('td');
    const btnRem = document.createElement('button');
    btnRem.className = 'btn-remover';
    btnRem.textContent = '✕';
    btnRem.setAttribute('aria-label', 'Remover conta');
    btnRem.addEventListener('click', () => {
      const nomeConta = conta.nome && conta.nome.trim() ? conta.nome : 'esta conta';
      if (!confirm(`Remover "${nomeConta}"?`)) return;
      dados.contas.splice(i, 1);
      salvar(); renderContas(); renderResumo();
    });
    tdRemover.appendChild(btnRem);

    tr.appendChild(tdNome);
    tr.appendChild(tdValor);
    tr.appendChild(tdStatus);
    tr.appendChild(tdRemover);
    tbody.appendChild(tr);
  });
}

// ===== Calendário de dias trabalhados =====
function diaSemanaIndex(ano, mes, dia) {
  return new Date(ano, mes, dia).getDay(); // 0=domingo ... 6=sábado
}

function valorDoDia(ano, mes, dia) {
  const idx = diaSemanaIndex(ano, mes, dia);
  if (idx === 0) return Number(dados.valorDomingo) || 0;
  if (idx === 6) return Number(dados.valorSabado) || 0;
  return Number(dados.valorSemana) || 0;
}

function renderCalendario() {
  const cal = document.getElementById('calendario');
  cal.innerHTML = '';
  const ano = mesExibido.ano;
  const mes = mesExibido.mes;

  const nomeMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('rotuloMes').textContent = nomeMes;

  ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(letra => {
    const div = document.createElement('div');
    div.className = 'cal-cabecalho';
    div.textContent = letra;
    cal.appendChild(div);
  });

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const div = document.createElement('div');
    div.className = 'dia vazio';
    cal.appendChild(div);
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const chave = `${ano}-${mes}-${dia}`;
    const trabalhado = !!dados.diasTrabalhados[chave];
    const valor = valorDoDia(ano, mes, dia);

    const div = document.createElement('div');
    div.className = 'dia' + (trabalhado ? ' trabalhado' : '');
    div.innerHTML = `<span class="num">${dia}</span><span class="val">${valor > 0 ? formatarMoeda(valor).replace('R$ ', '') : ''}</span>`;
    div.addEventListener('click', () => {
      dados.diasTrabalhados[chave] = !dados.diasTrabalhados[chave];
      salvar();
      renderCalendario();
      renderResumo();
    });
    cal.appendChild(div);
  }
}

function totalDiarias() {
  const ano = mesExibido.ano;
  const mes = mesExibido.mes;
  let total = 0;
  Object.keys(dados.diasTrabalhados).forEach(chave => {
    if (!dados.diasTrabalhados[chave]) return;
    const [a, m, d] = chave.split('-').map(Number);
    if (a === ano && m === mes) {
      total += valorDoDia(a, m, d);
    }
  });
  return total;
}

// ===== Resumo do mês =====
function renderResumo() {
  const totalContas = dados.contas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const faltaPagar = dados.contas.filter(c => c.status === 'Pendente').reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const totalReceber = salario + diarias;
  // "Sobra" usa o TOTAL das contas (pagas + pendentes), não só as pendentes.
  // Uma conta paga já saiu do bolso — marcar como "Pago" é só um controle de
  // status, não deve fazer esse dinheiro "voltar" para o valor que sobra.
  // Quem muda com o status é só o "Falta pagar" (acima).
  const sobra = totalReceber - totalContas;

  document.getElementById('totalDiarias').textContent = formatarMoeda(diarias);
  document.getElementById('totalContas').textContent = formatarMoeda(totalContas);
  document.getElementById('faltaPagar').textContent = formatarMoeda(faltaPagar);
  const elSobra = document.getElementById('sobra');
  elSobra.textContent = formatarMoeda(sobra);
  // Fica vermelho quando o orçamento estoura (sobra negativa) — assim
  // dá pra ver de longe que algo precisa de atenção, sem ler o número.
  elSobra.closest('.resumo-item').classList.toggle('negativo', sobra < 0);
  document.getElementById('totalGeralRodape').textContent = formatarMoeda(totalContas);
}

// ===== Eventos dos campos fixos =====
document.getElementById('salario').addEventListener('input', e => {
  dados.salario = parseFloat(e.target.value) || 0;
  salvar(); renderResumo();
});
document.getElementById('valorSemana').addEventListener('input', e => {
  dados.valorSemana = parseFloat(e.target.value) || 0;
  salvar(); renderCalendario(); renderResumo();
});
document.getElementById('valorSabado').addEventListener('input', e => {
  dados.valorSabado = parseFloat(e.target.value) || 0;
  salvar(); renderCalendario(); renderResumo();
});
document.getElementById('valorDomingo').addEventListener('input', e => {
  dados.valorDomingo = parseFloat(e.target.value) || 0;
  salvar(); renderCalendario(); renderResumo();
});
document.getElementById('btnAddConta').addEventListener('click', () => {
  dados.contas.push({ nome: '', valor: 0, status: 'Pendente' });
  salvar(); renderContas(); renderResumo();
  const linhas = document.querySelectorAll('#tabelaContas tr');
  const ultimaLinha = linhas[linhas.length - 1];
  if (ultimaLinha) {
    const primeiroInput = ultimaLinha.querySelector('input[type="text"]');
    if (primeiroInput) primeiroInput.focus();
  }
});

document.getElementById('btnMesAnterior').addEventListener('click', () => {
  mesExibido.mes -= 1;
  if (mesExibido.mes < 0) { mesExibido.mes = 11; mesExibido.ano -= 1; }
  renderCalendario(); renderResumo();
});
document.getElementById('btnMesProximo').addEventListener('click', () => {
  mesExibido.mes += 1;
  if (mesExibido.mes > 11) { mesExibido.mes = 0; mesExibido.ano += 1; }
  renderCalendario(); renderResumo();
});

// ===== Tema claro/escuro =====
function aplicarTema() {
  document.documentElement.setAttribute('data-theme', dados.tema);
  document.getElementById('btnTema').textContent = dados.tema === 'dark' ? '☀️' : '🌙';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', dados.tema === 'dark' ? '#14181f' : '#1f4e78');
}

document.getElementById('btnTema').addEventListener('click', () => {
  dados.tema = dados.tema === 'dark' ? 'light' : 'dark';
  aplicarTema();
  salvar();
});

// ===== Instalar como app (PWA) =====
// O navegador dispara "beforeinstallprompt" quando o site cumpre os requisitos
// de instalação (manifest.json + ícones + service worker). Guardamos esse
// evento para poder chamá-lo depois, no clique do nosso próprio botão.
let eventoInstalacao = null;
const modalInstalar = document.getElementById('modalInstalar');
const btnInstalarNativo = document.getElementById('btnInstalarNativo');
const secaoAndroid = document.getElementById('secaoAndroid');
const secaoIOS = document.getElementById('secaoIOS');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalacao = e;
  btnInstalarNativo.style.display = 'block';
  secaoAndroid.style.display = 'none';
});

const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (ehIOS) secaoAndroid.style.display = 'none';
if (!ehIOS && !eventoInstalacao) secaoIOS.style.display = 'none';

document.getElementById('btnInstalar').addEventListener('click', () => {
  modalInstalar.classList.add('aberto');
});
document.getElementById('btnFecharModal').addEventListener('click', () => {
  modalInstalar.classList.remove('aberto');
});
modalInstalar.addEventListener('click', (e) => {
  if (e.target === modalInstalar) modalInstalar.classList.remove('aberto');
});

btnInstalarNativo.addEventListener('click', async () => {
  if (!eventoInstalacao) return;
  eventoInstalacao.prompt();
  await eventoInstalacao.userChoice;
  eventoInstalacao = null;
  btnInstalarNativo.style.display = 'none';
  modalInstalar.classList.remove('aberto');
});

window.addEventListener('appinstalled', () => {
  btnInstalarNativo.style.display = 'none';
});

// Registra o service worker (necessário para o navegador oferecer instalação real)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('Service worker não registrado:', err);
    });
  });
}

// ===== Inicialização =====
function iniciar() {
  carregar();
  aplicarTema();
  document.getElementById('salario').value = dados.salario;
  document.getElementById('valorSemana').value = dados.valorSemana;
  document.getElementById('valorSabado').value = dados.valorSabado;
  document.getElementById('valorDomingo').value = dados.valorDomingo;
  renderContas();
  renderCalendario();
  renderResumo();
}

iniciar();