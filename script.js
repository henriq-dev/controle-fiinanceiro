// ===== Firebase: login e sincronização na nuvem =====
// IMPORTANTE: carregamos o Firebase SOB DEMANDA (só quando a pessoa clica em
// "Conta" ou tenta logar), não no topo do arquivo. Se colocássemos um
// "import" fixo aqui em cima e o Firebase não respondesse (sem internet,
// bloqueador de anúncios, CDN fora do ar), o app INTEIRO travaria — nem as
// funções que não têm nada a ver com login funcionariam. Carregando por
// demanda, com um limite de tempo, o resto do app nunca depende disso.
const firebaseConfig = {
  apiKey: "AIzaSyBVKTehsMqtBaHoOk_1UPGDMBqDKgKcWQo",
  authDomain: "controle-financeiro-46381.firebaseapp.com",
  projectId: "controle-financeiro-46381",
  storageBucket: "controle-financeiro-46381.firebasestorage.app",
  messagingSenderId: "87406858270",
  appId: "1:87406858270:web:eb991ce038179ab0c2de0f"
};

let _firebasePromise = null;
// Corre uma promessa contra um cronômetro: se o Firebase não responder dentro
// do tempo, desistimos (rejeitamos) em vez de ficar esperando pra sempre.
function comLimiteDeTempo(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('tempo esgotado')), ms))
  ]);
}

function carregarFirebase() {
  if (_firebasePromise) return _firebasePromise; // já carregado (ou carregando) — reaproveita
  _firebasePromise = (async () => {
    const [appMod, authMod, storeMod] = await comLimiteDeTempo(Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]), 8000);

    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = storeMod.getFirestore(app);
    return { auth, db, authMod, storeMod };
  })();
  // Se der erro, "esquece" a tentativa — assim um próximo clique tenta de novo
  // (em vez de ficar preso num erro antigo pra sempre).
  _firebasePromise.catch(() => { _firebasePromise = null; });
  return _firebasePromise;
}

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
  contas: [],                // <- começa vazia: cada pessoa cadastra as suas contas
  diasTrabalhados: {},        // "YYYY-M-D": true
  valoresPersonalizados: {},  // "YYYY-M-D": valor específico daquele dia (sobrescreve o padrão)
  historicoMeses: [],         // meses já fechados, com o resumo e a lista de contas de cada um
  ordenarContasPor: 'vencimento' // 'vencimento' | 'valor' | 'nome' — lembrado entre sessões
};

const hojeInicial = new Date();
let mesExibido = { ano: hojeInicial.getFullYear(), mes: hojeInicial.getMonth() };

// Deixa só a primeira letra maiúscula (não usamos CSS text-transform aqui
// porque "capitalize" deixaria toda palavra maiúscula, incluindo o "de"
// de "agosto de 2026" — viraria "Agosto De 2026", errado em português).
function capitalizarPrimeira(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===== Utilitário: formata número para moeda brasileira =====
function formatarMoeda(v) {
  const num = Number(v) || 0;
  const abs = Math.abs(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (num < 0 ? '-R$ ' : 'R$ ') + abs;
}

// ===== Leitura segura de valores monetários =====
// Corrige um bug real: o teclado numérico do Android às vezes entrega
// "12,50" (vírgula) para o campo, e parseFloat('12,50') retorna 12 — o
// resto do valor simplesmente some. Aqui aceitamos tanto ponto quanto
// vírgula como separador decimal, e rejeitamos "1e6" (notação científica
// que o input number aceita, mas que não faz sentido em dinheiro).
// Trabalhamos internamente em CENTAVOS (inteiros) para evitar erros de
// arredondamento de ponto flutuante (ex: 0,10 + 0,20 != 0,30 em binário),
// e só convertemos de volta pra reais na hora de guardar/mostrar.
function lerMoeda(valor) {
  // Valor já numérico (ex: vindo de um backup importado, onde o JSON
  // guarda number, não texto digitado) — só valida faixa, sem regex de texto.
  if (typeof valor === 'number') {
    return (Number.isFinite(valor) && valor >= 0) ? Math.round(valor * 100) / 100 : 0;
  }
  if (valor === '' || valor === null || valor === undefined) return 0;
  // Remove separador de milhar (ponto) e troca a vírgula decimal por ponto
  // — aceita tanto "1234.56" (formato "cru") quanto "1.234,56" (formato
  // que a máscara ao vivo do campo gera enquanto a pessoa digita).
  const normalizado = String(valor).trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return 0;
  const centavos = Math.round(Number(normalizado) * 100);
  return Number.isFinite(centavos) ? centavos / 100 : 0;
}

// Formata um número pra exibir dentro de um CAMPO editável de moeda — igual
// ao formatarMoeda, mas sem o "R$" na frente (o campo já deixa claro pelo
// rótulo ao lado que é dinheiro; o prefixo dentro do campo atrapalharia o
// cursor ao editar).
function formatarMoedaInput(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ===== Máscara de moeda ao vivo =====
// Técnica de "calculadora": cada dígito novo entra sempre pela direita,
// empurrando os centavos já digitados pra esquerda — é assim que apps de
// banco formatam valor enquanto a pessoa digita, sem precisar controlar
// manualmente a posição do cursor (o que é bem mais frágil de acertar).
// Chamado a cada tecla, ANTES de ler o valor pra guardar nos dados.
function aplicarMascaraMoeda(input) {
  const digitos = input.value.replace(/\D/g, '');
  input.value = digitos === '' ? '' : formatarMoedaInput(parseInt(digitos, 10) / 100);
}

// Soma valores monetários passando por centavos inteiros, evitando que o
// ponto flutuante acumule erro de arredondamento em listas grandes.
function somarMoeda(lista, seletor) {
  const centavos = lista.reduce((total, item) => total + Math.round((Number(seletor(item)) || 0) * 100), 0);
  return centavos / 100;
}

// Vibração curta como feedback tátil (ex: ao pagar uma conta). A API
// navigator.vibrate não existe no Safari/iOS — por isso sempre checamos
// se ela existe antes de chamar, senão o app quebraria em iPhone.
function vibrarSeSuportado(ms) {
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (e) { /* silencioso: vibração é só um extra */ }
  }
}

// Escapa texto antes de inserir via innerHTML. Necessário porque strings
// como "categoria" ou "mesLabel" podem vir de um backup/nuvem importado
// (não digitado pela própria pessoa nesta tela) — sem isso, um arquivo de
// backup adulterado poderia injetar HTML/JS na tela (XSS).
function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

// Identifica um mês de forma única (ano-mês), independente do rótulo em
// português — usado para impedir fechar o mesmo período duas vezes.
function chaveMes(ano, mes) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

// ===== Validação de backup importado =====
// JSON.parse dar certo só garante que o TEXTO é JSON válido — não garante
// que o FORMATO é o que o app espera. Um arquivo de backup corrompido,
// editado à mão ou de uma versão muito diferente do app pode ter, por
// exemplo, "contas" como texto em vez de lista. Sem essa validação, o
// app aceitava qualquer coisa e quebrava na hora de desenhar a tela
// (ex: dados.contas.forEach não existe se contas não for um array).
// Aqui, cada campo é conferido e, se estiver errado, cai num valor padrão
// seguro em vez de derrubar a importação inteira.
function normalizarBackup(bruto) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new Error('O arquivo não tem o formato esperado de um backup deste app.');
  }

  const normalizado = {
    tema: TEMAS_VALIDOS.includes(bruto.tema) ? bruto.tema : 'light',
    salario: lerMoeda(bruto.salario),
    valorSemana: lerMoeda(bruto.valorSemana),
    valorSabado: lerMoeda(bruto.valorSabado),
    valorDomingo: lerMoeda(bruto.valorDomingo),
    ordenarContasPor: ['vencimento', 'valor', 'nome'].includes(bruto.ordenarContasPor) ? bruto.ordenarContasPor : 'vencimento',
    contas: [],
    diasTrabalhados: {},
    valoresPersonalizados: {},
    historicoMeses: []
  };

  if (Array.isArray(bruto.contas)) {
    normalizado.contas = bruto.contas
      .filter(c => c && typeof c === 'object')
      .map(c => ({
        nome: typeof c.nome === 'string' ? c.nome.slice(0, 200) : '',
        valor: lerMoeda(c.valor),
        categoria: typeof c.categoria === 'string' ? c.categoria.slice(0, 60) : '',
        vencimento: (typeof c.vencimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) ? c.vencimento : '',
        status: (c.status === 'Pago') ? 'Pago' : 'Pendente'
      }));
  }

  if (bruto.diasTrabalhados && typeof bruto.diasTrabalhados === 'object' && !Array.isArray(bruto.diasTrabalhados)) {
    Object.entries(bruto.diasTrabalhados).forEach(([chave, valor]) => {
      if (/^\d+-\d+-\d+$/.test(chave) && valor === true) normalizado.diasTrabalhados[chave] = true;
    });
  }

  if (bruto.valoresPersonalizados && typeof bruto.valoresPersonalizados === 'object' && !Array.isArray(bruto.valoresPersonalizados)) {
    Object.entries(bruto.valoresPersonalizados).forEach(([chave, valor]) => {
      if (/^\d+-\d+-\d+$/.test(chave)) normalizado.valoresPersonalizados[chave] = lerMoeda(valor);
    });
  }

  if (Array.isArray(bruto.historicoMeses)) {
    normalizado.historicoMeses = bruto.historicoMeses
      .filter(m => m && typeof m === 'object')
      .map(m => ({
        mesLabel: typeof m.mesLabel === 'string' ? m.mesLabel.slice(0, 60) : '',
        // ano/mes são novos (adicionados junto com o filtro do histórico) —
        // um backup de antes disso não vai ter esses campos. Usamos null
        // em vez de 0, pra o filtro conseguir separar "não sei o ano" de
        // "fechado no ano 0", que não existe.
        ano: Number.isInteger(m.ano) ? m.ano : null,
        mes: (Number.isInteger(m.mes) && m.mes >= 0 && m.mes <= 11) ? m.mes : null,
        fechadoEm: typeof m.fechadoEm === 'string' ? m.fechadoEm : '',
        totalContas: lerMoeda(m.totalContas),
        diarias: lerMoeda(m.diarias),
        salario: lerMoeda(m.salario),
        sobra: (typeof m.sobra === 'number' && Number.isFinite(m.sobra)) ? Math.round(m.sobra * 100) / 100 : 0,
        // Sem isso, um "contas" ausente ou malformado dentro de um mês do
        // histórico quebraria renderHistorico inteiro na hora de fazer
        // mes.contas.length (TypeError: Cannot read length of undefined).
        contas: Array.isArray(m.contas) ? m.contas.filter(c => c && typeof c === 'object') : []
      }));
  }

  return normalizado;
}

// ===== Modal de confirmação/alerta (substitui confirm()/alert() nativos) =====
// window.confirm() e window.alert() são bloqueados ou simplesmente ignorados
// em vários PWAs instalados no iOS e em WebViews Android (o app "trava"
// esperando um clique que nunca acontece de verdade). Além disso, são caixas
// cinzas do sistema operacional que destoam do resto da interface. Este
// modal resolve os dois problemas, e como abrir um modal é sempre
// assíncrono (a pessoa precisa clicar em algo), a função devolve uma
// Promise — por isso todo lugar que chamava confirm()/alert() agora usa
// "await".
let _confirmacaoResolver = null;

function _fecharModalConfirmacao(resultado) {
  const modal = document.getElementById('modalConfirmacao');
  modal.classList.remove('aberto');
  document.removeEventListener('keydown', _confirmacaoTeclado);
  if (_confirmacaoFocoAnterior && typeof _confirmacaoFocoAnterior.focus === 'function') {
    _confirmacaoFocoAnterior.focus();
  }
  const resolver = _confirmacaoResolver;
  _confirmacaoResolver = null;
  if (resolver) resolver(resultado);
}

let _confirmacaoFocoAnterior = null;

function _confirmacaoTeclado(e) {
  const modal = document.getElementById('modalConfirmacao');
  if (!modal.classList.contains('aberto')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    _fecharModalConfirmacao(false);
    return;
  }
  // Prende o foco em Tab/Shift+Tab entre os dois botões (acessibilidade —
  // sem isso, Tab escaparia pro resto da página com o modal ainda aberto).
  if (e.key === 'Tab') {
    const focaveis = modal.querySelectorAll('button');
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault(); ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault(); primeiro.focus();
    }
  }
}

// Mostra o modal com um botão "Cancelar" e um botão de confirmação.
// Resolve com true (confirmou) ou false (cancelou/Esc/clicou fora).
function confirmarModal({ titulo = 'Confirmar', mensagem, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', perigo = false }) {
  return new Promise(resolve => {
    const modal = document.getElementById('modalConfirmacao');
    document.getElementById('confirmacaoTitulo').textContent = titulo;
    document.getElementById('confirmacaoMensagem').textContent = mensagem;

    const btnCancelar = document.getElementById('confirmacaoBtnCancelar');
    const btnConfirmar = document.getElementById('confirmacaoBtnConfirmar');
    btnCancelar.style.display = textoCancelar ? '' : 'none';
    btnCancelar.textContent = textoCancelar;
    btnConfirmar.textContent = textoConfirmar;
    btnConfirmar.className = perigo ? 'btn-perigo' : 'btn-add';

    _confirmacaoFocoAnterior = document.activeElement;
    _confirmacaoResolver = resolve;

    // Clona os botões pra descartar handlers de uma chamada anterior do
    // modal (evita "vazar" um segundo clique acumulado de outra tela).
    const novoCancelar = btnCancelar.cloneNode(true);
    const novoConfirmar = btnConfirmar.cloneNode(true);
    btnCancelar.replaceWith(novoCancelar);
    btnConfirmar.replaceWith(novoConfirmar);
    novoCancelar.addEventListener('click', () => _fecharModalConfirmacao(false));
    novoConfirmar.addEventListener('click', () => _fecharModalConfirmacao(true));

    modal.classList.add('aberto');
    document.addEventListener('keydown', _confirmacaoTeclado);
    setTimeout(() => novoConfirmar.focus(), 0);
  });
}

// Mesmo padrão dos outros modais do app: clicar fora da caixa fecha.
document.getElementById('modalConfirmacao').addEventListener('click', (e) => {
  if (e.target.id === 'modalConfirmacao') _fecharModalConfirmacao(false);
});

// Mostra o modal só com um botão "Entendi" (equivalente ao alert() nativo).
function alertarModal(mensagem, titulo = 'Aviso') {
  return confirmarModal({ titulo, mensagem, textoConfirmar: 'Entendi', textoCancelar: '' })
    .then(() => {});
}

// ===== Salvar / carregar (localStorage = guarda só neste navegador) =====
// Guarda quem está logado agora (null = ninguém, app funciona só localmente).
let usuarioAtual = null;

let saveTimeout = null;
let cloudSaveTimeout = null;

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
    saveTimeout = null;
  }, 400);

  // Sincronização com a nuvem tem um debounce PRÓPRIO e mais longo (1,5s),
  // separado do salvamento local (400ms) de propósito. Antes os dois
  // dividiam o mesmo timer, então cada pequena pausa de digitação já
  // disparava uma escrita no Firestore — em uma sessão de edição corrida
  // (várias contas, vários campos), isso vira dezenas de escritas em
  // poucos minutos, arriscando limite de taxa da conta gratuita e gastando
  // dado móvel à toa. Salvar local continua rápido (a pessoa vê "Salvo"
  // na hora); só a nuvem espera a digitação realmente parar por mais tempo.
  if (usuarioAtual) {
    clearTimeout(cloudSaveTimeout);
    cloudSaveTimeout = setTimeout(() => {
      const { fb, uid } = usuarioAtual;
      fb.storeMod.setDoc(fb.storeMod.doc(fb.db, 'usuarios', uid), dados)
        .then(() => {
          statusEl.textContent = 'Sincronizado ✓';
          setTimeout(() => { statusEl.textContent = ''; }, 1500);
        })
        .catch(e => console.error('Erro ao sincronizar com a nuvem:', e));
      cloudSaveTimeout = null;
    }, 1500);
  }
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
    // JSON corrompido/de versão antiga, ou o navegador bloqueando
    // localStorage por alguma política (WebView restrita, extensão de
    // privacidade, etc). Sem esse catch, o erro sobe e a tela inteira
    // fica em branco — melhor avisar a pessoa e seguir com os dados em
    // branco do que travar o app.
    console.log('Não foi possível ler os dados salvos, começando do zero.', e);
    const statusEl = document.getElementById('statusSalvo');
    if (statusEl) {
      statusEl.textContent = '⚠️ Não foi possível carregar dados salvos neste navegador. Começando do zero.';
      setTimeout(() => { statusEl.textContent = ''; }, 6000);
    }
  }
  // Se a pessoa nunca escolheu um tema antes, segue a preferência do sistema.
  if (!temaSalvo && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    dados.tema = 'dark';
  }
}

// ===== Vencimento das contas =====
// Retorna 'atrasada', 'proxima' (até 3 dias) ou 'ok', com base na data de hoje.
// Só faz sentido avaliar isso para contas ainda Pendentes.
function statusVencimento(vencStr) {
  if (!vencStr) return null;
  const [y, m, d] = vencStr.split('-').map(Number);
  const dataVenc = new Date(y, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diffDias = Math.round((dataVenc - hoje) / 86400000);
  if (diffDias < 0) return 'atrasada';
  if (diffDias <= 3) return 'proxima';
  return 'ok';
}

// Categorias fixas, cada uma com uma cor própria (definida no CSS via
// data-categoria). "Sem categoria" fica de fora do dropdown como padrão vazio.
const CATEGORIAS = ['Moradia', 'Transporte', 'Alimentação', 'Saúde', 'Lazer', 'Educação', 'Outros'];

// ===== Badge de contas vencendo/atrasadas =====
// Reaproveita o mesmo statusVencimento() que já colore a bolinha de cada
// linha da tabela — assim os dois lugares nunca podem "discordar" sobre o
// que está atrasado ou vencendo.
function atualizarBadgeVencendo() {
  const badge = document.getElementById('badgeVencendo');
  let atrasadas = 0, proximas = 0;
  dados.contas.forEach(c => {
    if (c.status !== 'Pendente') return;
    const sit = statusVencimento(c.vencimento);
    if (sit === 'atrasada') atrasadas++;
    else if (sit === 'proxima') proximas++;
  });

  if (atrasadas > 0) {
    badge.textContent = atrasadas === 1 ? '1 conta atrasada' : `${atrasadas} contas atrasadas`;
    badge.className = 'badge-vencendo atrasada';
    badge.style.display = '';
  } else if (proximas > 0) {
    badge.textContent = proximas === 1
      ? '1 conta vence nos próximos 3 dias'
      : `${proximas} contas vencem nos próximos 3 dias`;
    badge.className = 'badge-vencendo proxima';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ===== Renderização da tabela de contas =====
function renderContas() {
  const tbody = document.getElementById('tabelaContas');
  const aviso = document.getElementById('avisoVazio');
  tbody.innerHTML = '';

  aviso.style.display = dados.contas.length === 0 ? 'block' : 'none';

  // Mostra as contas ordenadas pelo critério escolhido na tela (vencimento,
  // valor ou nome). O array original (dados.contas) não muda de ordem — só
  // a exibição. Por isso usamos indexOf para achar a posição real ao
  // editar/duplicar/remover.
  const criterio = dados.ordenarContasPor || 'vencimento';
  const contasOrdenadas = [...dados.contas].sort((a, b) => {
    if (criterio === 'valor') {
      return (Number(b.valor) || 0) - (Number(a.valor) || 0); // maior valor primeiro
    }
    if (criterio === 'nome') {
      return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
    }
    // 'vencimento' (padrão): mais próximas primeiro, sem data fica por último.
    if (!a.vencimento && !b.vencimento) return 0;
    if (!a.vencimento) return 1;
    if (!b.vencimento) return -1;
    return a.vencimento.localeCompare(b.vencimento);
  });

  contasOrdenadas.forEach((conta) => {
    const tr = document.createElement('tr');

    const tdNome = document.createElement('td');
    tdNome.dataset.label = 'Conta';
    const inputNome = document.createElement('input');
    inputNome.type = 'text';
    inputNome.value = conta.nome;
    inputNome.placeholder = 'nome da conta';
    inputNome.addEventListener('input', e => { conta.nome = e.target.value; salvar(); });
    tdNome.appendChild(inputNome);

    const tdValor = document.createElement('td');
    tdValor.dataset.label = 'Valor';
    const inputValor = document.createElement('input');
    inputValor.type = 'text';
    inputValor.inputMode = 'decimal';
    inputValor.placeholder = '0,00';
    inputValor.value = (Number(conta.valor) === 0) ? '' : formatarMoedaInput(conta.valor);
    inputValor.addEventListener('input', e => { aplicarMascaraMoeda(e.target); conta.valor = lerMoeda(e.target.value); salvar(); renderResumo(); });
    tdValor.appendChild(inputValor);

    const tdCategoria = document.createElement('td');
    tdCategoria.dataset.label = 'Categoria';
    const selectCat = document.createElement('select');
    selectCat.className = 'categoria-select';
    selectCat.dataset.categoria = conta.categoria || '';
    const optVazia = document.createElement('option');
    optVazia.value = ''; optVazia.textContent = 'Sem categoria';
    if (!conta.categoria) optVazia.selected = true;
    selectCat.appendChild(optVazia);
    CATEGORIAS.forEach(cat => {
      const o = document.createElement('option');
      o.value = cat; o.textContent = cat;
      if (conta.categoria === cat) o.selected = true;
      selectCat.appendChild(o);
    });
    selectCat.addEventListener('change', e => {
      conta.categoria = e.target.value;
      selectCat.dataset.categoria = conta.categoria;
      salvar(); renderResumo();
    });
    tdCategoria.appendChild(selectCat);

    const tdVencimento = document.createElement('td');
    tdVencimento.dataset.label = 'Vencimento';
    const wrapVenc = document.createElement('div');
    wrapVenc.className = 'venc-wrap';
    const bolinha = document.createElement('span');
    const sitVenc = conta.status === 'Pendente' ? statusVencimento(conta.vencimento) : null;
    bolinha.className = 'venc-bolinha' + (sitVenc ? ' ' + sitVenc : '');
    if (sitVenc === 'atrasada') bolinha.title = 'Vencida';
    else if (sitVenc === 'proxima') bolinha.title = 'Vence em breve';
    const inputVenc = document.createElement('input');
    inputVenc.type = 'date';
    inputVenc.value = conta.vencimento || '';
    inputVenc.addEventListener('change', e => {
      conta.vencimento = e.target.value;
      salvar(); renderContas(); renderResumo(); renderCalendario();
    });
    wrapVenc.appendChild(bolinha);
    wrapVenc.appendChild(inputVenc);
    tdVencimento.appendChild(wrapVenc);

    const tdStatus = document.createElement('td');
    tdStatus.dataset.label = 'Status';
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
      if (conta.status === 'Pago') vibrarSeSuportado(10);
      salvar(); renderContas(); renderResumo(); renderCalendario();
    });
    tdStatus.appendChild(select);

    const tdAcoes = document.createElement('td');
    const acoesWrap = document.createElement('div');
    acoesWrap.className = 'acoes-conta';

    const btnDup = document.createElement('button');
    btnDup.className = 'btn-duplicar';
    btnDup.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16V5a1 1 0 0 1 1-1h11"></path></svg>';
    btnDup.setAttribute('aria-label', 'Duplicar conta');
    btnDup.title = 'Duplicar conta';
    btnDup.addEventListener('click', () => {
      // Cria uma cópia logo abaixo da conta original, com "(cópia)" no nome
      // pra ficar claro que é uma duplicata — útil pra contas fixas que se
      // repetem todo mês, como aluguel ou luz.
      const posicaoReal = dados.contas.indexOf(conta);
      const copia = {
        nome: conta.nome ? conta.nome + ' (cópia)' : '',
        valor: conta.valor,
        status: conta.status,
        vencimento: conta.vencimento || '',
        categoria: conta.categoria || ''
      };
      dados.contas.splice(posicaoReal + 1, 0, copia);
      salvar(); renderContas(); renderResumo(); renderCalendario();
    });

    const btnRem = document.createElement('button');
    btnRem.className = 'btn-remover';
    btnRem.textContent = '✕';
    btnRem.setAttribute('aria-label', 'Remover conta');
    btnRem.addEventListener('click', async () => {
      const nomeConta = conta.nome && conta.nome.trim() ? conta.nome : 'esta conta';
      const ok = await confirmarModal({
        titulo: 'Remover conta',
        mensagem: `Remover "${nomeConta}"? Essa ação não pode ser desfeita.`,
        textoConfirmar: 'Remover',
        perigo: true
      });
      if (!ok) return;
      const posicaoReal = dados.contas.indexOf(conta);
      dados.contas.splice(posicaoReal, 1);
      salvar(); renderContas(); renderResumo(); renderCalendario();
    });

    acoesWrap.appendChild(btnDup);
    acoesWrap.appendChild(btnRem);
    tdAcoes.appendChild(acoesWrap);

    tr.appendChild(tdNome);
    tr.appendChild(tdValor);
    tr.appendChild(tdCategoria);
    tr.appendChild(tdVencimento);
    tr.appendChild(tdStatus);
    tr.appendChild(tdAcoes);
    tbody.appendChild(tr);
  });

  atualizarBadgeVencendo();
}

// ===== Calendário de dias trabalhados =====
function diaSemanaIndex(ano, mes, dia) {
  return new Date(ano, mes, dia).getDay(); // 0=domingo ... 6=sábado
}

function valorDoDia(ano, mes, dia) {
  const chave = `${ano}-${mes}-${dia}`;
  // Se esse dia tem um valor personalizado (ex: um bico que pagou diferente
  // do normal), ele tem prioridade sobre o valor padrão do dia da semana.
  if (dados.valoresPersonalizados[chave] !== undefined) {
    return Number(dados.valoresPersonalizados[chave]) || 0;
  }
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
  // Pega a data atual toda vez que o calendário é desenhado (não guardamos
  // isso em variável fixa), assim o destaque do dia de hoje sempre bate,
  // mesmo que a pessoa deixe o app aberto e passe da meia-noite.
  const hojeReal = new Date();

  const nomeMes = capitalizarPrimeira(new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
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

  // Mapeia cada dia do mês exibido às contas que vencem nele — é aqui que
  // o calendário e as contas finalmente "se falam" (antes eram dois
  // sistemas totalmente separados). Reaproveita o mesmo texto ISO
  // (YYYY-MM-DD) que a conta já guarda, sem precisar de nenhuma conversão.
  const contasPorDia = {};
  dados.contas.forEach(conta => {
    if (!conta.vencimento) return;
    const [vAno, vMes, vDia] = conta.vencimento.split('-').map(Number);
    if (vAno === ano && (vMes - 1) === mes) {
      if (!contasPorDia[vDia]) contasPorDia[vDia] = [];
      contasPorDia[vDia].push(conta);
    }
  });

  for (let dia = 1; dia <= totalDias; dia++) {
    const chave = `${ano}-${mes}-${dia}`;
    const trabalhado = !!dados.diasTrabalhados[chave];
    const valor = valorDoDia(ano, mes, dia);
    const ehHoje = ano === hojeReal.getFullYear() && mes === hojeReal.getMonth() && dia === hojeReal.getDate();
    const personalizado = dados.valoresPersonalizados[chave] !== undefined;
    const contasDoDia = contasPorDia[dia] || [];

    const div = document.createElement('div');
    div.className = 'dia' + (trabalhado ? ' trabalhado' : '') + (ehHoje ? ' hoje' : '') + (personalizado ? ' personalizado' : '');
    if (ehHoje) div.title = 'Hoje';
    div.innerHTML = `<span class="num">${dia}</span><span class="val">${valor > 0 ? formatarMoeda(valor).replace('R$ ', '') : ''}</span>`;
    div.addEventListener('click', () => {
      dados.diasTrabalhados[chave] = !dados.diasTrabalhados[chave];
      salvar();
      renderCalendario();
      renderResumo();
    });

    if (contasDoDia.length > 0) {
      const temPendente = contasDoDia.some(c => c.status === 'Pendente');
      const bolinha = document.createElement('button');
      bolinha.className = 'dia-venc-bolinha' + (temPendente ? '' : ' paga');
      bolinha.type = 'button';
      // Monta o texto na hora do clique (não aqui na renderização) — assim,
      // se o valor ou status da conta mudar sem o calendário ser redesenhado
      // de novo, o popup ainda mostra o dado certo (contasDoDia guarda os
      // OBJETOS de verdade das contas, não uma cópia).
      const montarResumo = () => contasDoDia
        .map(c => `${c.nome && c.nome.trim() ? c.nome : 'Conta sem nome'}: ${formatarMoeda(c.valor)} (${c.status})`)
        .join('\n');
      bolinha.setAttribute('aria-label', `Vencimento em ${dia}/${mes + 1}`);
      bolinha.title = montarResumo();
      // stopPropagation: clicar no pontinho não pode também contar como
      // clique no dia (que marcaria/desmarcaria "trabalhado" sem querer).
      bolinha.addEventListener('click', async (e) => {
        e.stopPropagation();
        await alertarModal(montarResumo(), `Vencimento em ${dia}/${String(mes + 1).padStart(2, '0')}`);
      });
      div.appendChild(bolinha);
    }

    cal.appendChild(div);
  }
}

function totalDiarias() {
  const ano = mesExibido.ano;
  const mes = mesExibido.mes;
  let centavos = 0;
  Object.keys(dados.diasTrabalhados).forEach(chave => {
    if (!dados.diasTrabalhados[chave]) return;
    const [a, m, d] = chave.split('-').map(Number);
    if (a === ano && m === mes) {
      centavos += Math.round(valorDoDia(a, m, d) * 100);
    }
  });
  return centavos / 100;
}

// ===== Resumo do mês =====
function renderResumo() {
  const totalContas = somarMoeda(dados.contas, c => c.valor);
  const faltaPagar = somarMoeda(dados.contas.filter(c => c.status === 'Pendente'), c => c.valor);
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const totalReceber = somarMoeda([{ v: salario }, { v: diarias }], i => i.v);
  // "Sobra" usa o TOTAL das contas (pagas + pendentes), não só as pendentes.
  // Uma conta paga já saiu do bolso — marcar como "Pago" é só um controle de
  // status, não deve fazer esse dinheiro "voltar" para o valor que sobra.
  // Quem muda com o status é só o "Falta pagar" (acima).
  // A subtração final também passa por centavos inteiros (mesma razão do
  // somarMoeda: evitar que 0.1 + 0.2 vire 0.30000000000000004 na tela).
  const sobra = (Math.round(totalReceber * 100) - Math.round(totalContas * 100)) / 100;

  document.getElementById('totalDiarias').textContent = formatarMoeda(diarias);
  document.getElementById('totalContas').textContent = formatarMoeda(totalContas);
  document.getElementById('faltaPagar').textContent = formatarMoeda(faltaPagar);
  const elSobra = document.getElementById('sobra');
  elSobra.textContent = formatarMoeda(sobra);
  // Fica vermelho quando o orçamento estoura (sobra negativa) — assim
  // dá pra ver de longe que algo precisa de atenção, sem ler o número.
  elSobra.closest('.resumo-item').classList.toggle('negativo', sobra < 0);
  document.getElementById('totalGeralRodape').textContent = formatarMoeda(totalContas);
  renderResumoCategorias();
  renderGrafico();
}

// ===== Gráfico: entradas vs. gastos vs. sobra =====
// Barras simples, na mesma linguagem visual do resumo por categoria.
// Não usa nenhuma biblioteca de gráficos — é só HTML/CSS com a largura da
// barra calculada em proporção ao maior valor dos três.
function renderGrafico() {
  const totalContas = somarMoeda(dados.contas, c => c.valor);
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const entradas = Math.round((salario + diarias) * 100) / 100;
  const sobra = (Math.round(entradas * 100) - Math.round(totalContas * 100)) / 100;

  const container = document.getElementById('graficoResumo');
  const aviso = document.getElementById('avisoGraficoVazio');

  if (entradas === 0 && totalContas === 0) {
    container.innerHTML = '';
    aviso.style.display = 'block';
    return;
  }
  aviso.style.display = 'none';

  const maior = Math.max(entradas, totalContas, Math.abs(sobra), 1);
  const linhas = [
    { label: 'Entradas', valor: entradas, classe: 'graf-entradas' },
    { label: 'Gastos', valor: totalContas, classe: 'graf-gastos' },
    { label: 'Sobra', valor: sobra, classe: sobra < 0 ? 'graf-sobra-negativa' : 'graf-sobra' }
  ];

  container.innerHTML = linhas.map(l => `
    <div class="graf-barra-linha">
      <span class="graf-barra-label">${l.label}</span>
      <div class="graf-barra-trilho">
        <div class="graf-barra-preenchida ${l.classe}" style="width:${Math.min(100, (Math.abs(l.valor) / maior) * 100)}%"></div>
      </div>
      <span class="graf-barra-valor">${formatarMoeda(l.valor)}</span>
    </div>
  `).join('');
}

// ===== Resumo por categoria =====
// Mostra o total gasto em cada categoria usada, com uma barrinha proporcional
// ao maior valor — só aparece quando pelo menos uma conta tem categoria.
// Mesma paleta usada nas bordas do <select> de categoria — assim a pizza e
// o seletor de categoria falam a "mesma língua" de cores no app inteiro.
const CATEGORIA_CORES = {
  'Moradia': '#4c78d9', 'Transporte': '#9b6bd6', 'Alimentação': '#e08a2c',
  'Saúde': '#e05c6f', 'Lazer': '#3aa65c', 'Educação': '#2ea8a8', 'Outros': '#999999'
};

// Converte um ângulo (em graus, 0° = direita, sentido horário) num ponto
// (x,y) sobre um círculo de raio r centrado em (cx,cy). Usado pra desenhar
// cada fatia da pizza como um <path> de arco SVG.
function pontoNoCirculo(cx, cy, r, anguloGraus) {
  const rad = (anguloGraus * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function construirGraficoPizza(entradas, total) {
  const raio = 60, centro = 70;
  let anguloAtual = -90; // começa no topo (12h) em vez da direita (0°), como todo gráfico de pizza costuma começar
  const partes = entradas.map(([cat, valor]) => {
    const fracao = total > 0 ? valor / total : 0;
    const cor = CATEGORIA_CORES[cat] || '#999999';
    let path;
    if (fracao >= 0.999) {
      // Uma única categoria com 100%: um arco de 360° degenera (início e
      // fim caem no mesmo ponto e nada aparece) — desenha um círculo cheio.
      path = `<circle cx="${centro}" cy="${centro}" r="${raio}" fill="${cor}"><title>${escaparHTML(cat)}: ${formatarMoeda(valor)}</title></circle>`;
    } else {
      const anguloFim = anguloAtual + fracao * 360;
      const grandeArco = (anguloFim - anguloAtual) > 180 ? 1 : 0;
      const [x1, y1] = pontoNoCirculo(centro, centro, raio, anguloAtual);
      const [x2, y2] = pontoNoCirculo(centro, centro, raio, anguloFim);
      path = `<path d="M ${centro} ${centro} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${raio} ${raio} 0 ${grandeArco} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${cor}"><title>${escaparHTML(cat)}: ${formatarMoeda(valor)}</title></path>`;
      anguloAtual = anguloFim;
    }
    return path;
  });
  return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Gráfico de pizza dos gastos por categoria">${partes.join('')}</svg>`;
}

function renderResumoCategorias() {
  const container = document.getElementById('resumoCategorias');
  const porCategoriaCentavos = {};
  dados.contas.forEach(c => {
    if (!c.categoria) return;
    porCategoriaCentavos[c.categoria] = (porCategoriaCentavos[c.categoria] || 0) + Math.round((Number(c.valor) || 0) * 100);
  });
  const porCategoria = {};
  Object.keys(porCategoriaCentavos).forEach(cat => { porCategoria[cat] = porCategoriaCentavos[cat] / 100; });

  const entradas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  if (entradas.length === 0) {
    container.innerHTML = '';
    return;
  }

  const maior = Math.max(...entradas.map(e => e[1]));
  const total = entradas.reduce((s, [, v]) => s + v, 0);
  container.innerHTML = '<div class="resumo-categorias-titulo">Por categoria</div>' +
    '<div class="cat-pizza-wrap">' + construirGraficoPizza(entradas, total) + '</div>' +
    entradas.map(([cat, valor]) => `
      <div class="cat-barra-linha">
        <span class="cat-barra-label">${escaparHTML(cat)}</span>
        <div class="cat-barra-trilho">
          <div class="cat-barra-preenchida" data-categoria="${escaparHTML(cat)}" style="width:${maior > 0 ? (valor / maior) * 100 : 0}%"></div>
        </div>
        <span class="cat-barra-valor">${formatarMoeda(valor)}</span>
      </div>
    `).join('');
}

// ===== Fechar mês =====
// Arquiva um resumo do mês atual (com a lista de contas como estavam) e
// prepara a lista para o mês seguinte: todas as contas voltam para
// "Pendente" (pensado para contas fixas, tipo aluguel e luz, que se repetem
// todo mês) e, se tinham data de vencimento, essa data avança 1 mês.
function avancarUmMes(dataStr) {
  const [y, m, d] = dataStr.split('-').map(Number);
  // m (1..12) já aponta pro mês seguinte quando usado como índice 0 do
  // construtor Date (ex: m=1 = janeiro em 1-indexado = fevereiro em
  // 0-indexado). Antes de montar a data, descobrimos quantos dias esse
  // mês seguinte realmente tem (new Date(y, m+1, 0) = "dia 0" do mês
  // depois = último dia do mês seguinte) e prendemos o dia nesse limite.
  // Sem isso, 31/01 + 1 mês virava 03/03 (o JS "estourava" o dia 31 pra
  // fevereiro, que só tem 28/29, e a sobra vazava pro mês seguinte).
  const ultimoDiaDoMesSeguinte = new Date(y, m + 1, 0).getDate();
  const diaFinal = Math.min(d, ultimoDiaDoMesSeguinte);
  const prox = new Date(y, m, diaFinal);
  const yy = prox.getFullYear();
  const mm = String(prox.getMonth() + 1).padStart(2, '0');
  const dd = String(prox.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function fecharMes() {
  if (dados.contas.length === 0) {
    await alertarModal('Não há contas cadastradas para fechar o mês.');
    return;
  }

  const nomeMes = capitalizarPrimeira(new Date(mesExibido.ano, mesExibido.mes, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const totalContas = somarMoeda(dados.contas, c => c.valor);
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const sobra = (Math.round((salario + diarias) * 100) - Math.round(totalContas * 100)) / 100;

  const confirmar = await confirmarModal({
    titulo: `Fechar ${nomeMes}?`,
    mensagem: `Total de contas: ${formatarMoeda(totalContas)}\nSobra do mês: ${formatarMoeda(sobra)}\n\n` +
      `Isso guarda esse resumo no histórico e todas as contas voltam para "Pendente" (prontas para o próximo mês).`,
    textoConfirmar: 'Fechar mês'
  });
  if (!confirmar) return;

  dados.historicoMeses = dados.historicoMeses || [];
  const registroDoMes = {
    mesLabel: nomeMes,
    ano: mesExibido.ano,
    mes: mesExibido.mes, // 0-indexado, igual ao resto do app
    fechadoEm: new Date().toISOString(),
    totalContas, diarias, salario, sobra,
    contas: JSON.parse(JSON.stringify(dados.contas)) // cópia independente, não muda mais depois
  };
  dados.historicoMeses.unshift(registroDoMes);

  dados.contas.forEach(conta => {
    conta.status = 'Pendente';
    if (conta.vencimento) conta.vencimento = avancarUmMes(conta.vencimento);
  });

  salvar();
  renderContas();
  renderResumo();
  vibrarSeSuportado(10);

  // Backup extra na nuvem: além do salvar() normal (que só atualiza o
  // documento "ao vivo" da conta), grava esse mês fechado como um documento
  // À PARTE e imutável. Isso protege contra o cenário em que, meses depois,
  // um erro ou uma importação de backup ruim sobrescreve o documento
  // principal — esse snapshot mensal continua intacto na nuvem. Roda em
  // segundo plano, sem travar a tela nem exigir internet nesse momento.
  if (usuarioAtual) {
    const { fb, uid } = usuarioAtual;
    const chave = chaveMes(mesExibido.ano, mesExibido.mes);
    fb.storeMod.setDoc(fb.storeMod.doc(fb.db, 'usuarios', uid, 'backupsMensais', chave), registroDoMes)
      .catch(e => console.error('Não foi possível enviar o backup mensal para a nuvem:', e));
  }

  await alertarModal('Mês fechado! As contas estão prontas para o próximo mês.');
}

document.getElementById('btnFecharMes').addEventListener('click', fecharMes);

// ===== Histórico de meses fechados =====
function renderHistorico() {
  const lista = document.getElementById('listaHistorico');
  const aviso = document.getElementById('avisoSemHistorico');
  const filtroSelect = document.getElementById('filtroHistoricoAno');
  const historicoCompleto = dados.historicoMeses || [];

  // Monta a lista de anos disponíveis a partir do que já foi fechado —
  // não é uma lista fixa, cresce sozinha conforme os meses vão passando.
  // Meses fechados antes dessa função existir não têm "ano" salvo (null);
  // esses caem no filtro "Todos os anos" mas não geram uma opção própria.
  const anosDisponiveis = [...new Set(historicoCompleto.map(m => m.ano).filter(a => a !== null))]
    .sort((a, b) => b - a); // mais recente primeiro

  const valorAtualDoFiltro = filtroSelect.value || 'todos';
  filtroSelect.innerHTML = '<option value="todos">Todos os anos</option>' +
    anosDisponiveis.map(ano => `<option value="${ano}">${ano}</option>`).join('');
  // Mantém a escolha da pessoa ao re-renderizar (ex: depois de fechar um
  // mês novo), em vez de sempre voltar pra "Todos os anos".
  if ([...filtroSelect.options].some(o => o.value === valorAtualDoFiltro)) {
    filtroSelect.value = valorAtualDoFiltro;
  }

  const filtroAno = filtroSelect.value;
  const historico = filtroAno === 'todos'
    ? historicoCompleto
    : historicoCompleto.filter(m => String(m.ano) === filtroAno);

  lista.innerHTML = '';
  aviso.style.display = historico.length === 0 ? 'block' : 'none';
  aviso.textContent = historicoCompleto.length === 0
    ? 'Nenhum mês fechado ainda.'
    : 'Nenhum mês fechado nesse ano.';

  historico.forEach(mes => {
    const item = document.createElement('div');
    item.className = 'item-historico';
    item.innerHTML = `
      <strong>${escaparHTML(mes.mesLabel)}</strong>
      <div class="item-historico-linha"><span>Total de contas</span><span>${formatarMoeda(mes.totalContas)}</span></div>
      <div class="item-historico-linha"><span>Diárias</span><span>${formatarMoeda(mes.diarias)}</span></div>
      <div class="item-historico-linha"><span>Sobra do mês</span><span>${formatarMoeda(mes.sobra)}</span></div>
      <div class="item-historico-linha"><span>Contas cadastradas</span><span>${(mes.contas || []).length}</span></div>
    `;
    lista.appendChild(item);
  });
}

document.getElementById('btnHistorico').addEventListener('click', () => {
  renderHistorico();
  document.getElementById('modalHistorico').classList.add('aberto');
});
document.getElementById('filtroHistoricoAno').addEventListener('change', renderHistorico);
document.getElementById('btnFecharModalHistorico').addEventListener('click', () => {
  document.getElementById('modalHistorico').classList.remove('aberto');
});
document.getElementById('modalHistorico').addEventListener('click', (e) => {
  if (e.target.id === 'modalHistorico') document.getElementById('modalHistorico').classList.remove('aberto');
});

// ===== Eventos dos campos fixos =====
document.getElementById('salario').addEventListener('input', e => {
  aplicarMascaraMoeda(e.target);
  dados.salario = lerMoeda(e.target.value);
  salvar(); renderResumo();
});
document.getElementById('valorSemana').addEventListener('input', e => {
  aplicarMascaraMoeda(e.target);
  dados.valorSemana = lerMoeda(e.target.value);
  salvar(); renderCalendario(); renderResumo();
});
document.getElementById('valorSabado').addEventListener('input', e => {
  aplicarMascaraMoeda(e.target);
  dados.valorSabado = lerMoeda(e.target.value);
  salvar(); renderCalendario(); renderResumo();
});
document.getElementById('valorDomingo').addEventListener('input', e => {
  aplicarMascaraMoeda(e.target);
  dados.valorDomingo = lerMoeda(e.target.value);
  salvar(); renderCalendario(); renderResumo();
});
document.getElementById('btnAddConta').addEventListener('click', () => {
  dados.contas.push({ nome: '', valor: 0, status: 'Pendente', vencimento: '', categoria: '' });
  salvar(); renderContas(); renderResumo();
  const linhas = document.querySelectorAll('#tabelaContas tr');
  const ultimaLinha = linhas[linhas.length - 1];
  if (ultimaLinha) {
    const primeiroInput = ultimaLinha.querySelector('input[type="text"]');
    if (primeiroInput) primeiroInput.focus();
  }
});

document.getElementById('ordenarContas').addEventListener('change', e => {
  dados.ordenarContasPor = e.target.value;
  salvar();
  renderContas();
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

// ===== Tema =====
const ICONE_LUA = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"></path></svg>';
const ICONE_SOL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';

// Cor da barra do navegador/status bar em cada tema — puxada direto de
// --cinza de cada bloco do CSS, pra combinar com o fundo real da tela.
const CORES_THEME_COLOR = {
  'light': '#1f4e78',
  'dark': '#14181f',
  'alto-contraste': '#000000',
  'noturno-amarelado': '#1c1610'
};
const TEMAS_VALIDOS = Object.keys(CORES_THEME_COLOR);

function aplicarTema() {
  document.documentElement.setAttribute('data-theme', dados.tema);
  // Só o tema "light" mostra a lua (indicando "toque pra ver opções mais
  // escuras") — os outros três já são de base escura, então mostram sol.
  document.getElementById('btnTema').innerHTML = dados.tema === 'light' ? ICONE_LUA : ICONE_SOL;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', CORES_THEME_COLOR[dados.tema] || CORES_THEME_COLOR.light);
}

document.getElementById('btnTema').addEventListener('click', () => {
  document.querySelectorAll('#modalTemas .tema-opcao').forEach(btn => {
    btn.classList.toggle('selecionado', btn.dataset.tema === dados.tema);
  });
  document.getElementById('modalTemas').classList.add('aberto');
});
document.getElementById('btnFecharModalTemas').addEventListener('click', () => {
  document.getElementById('modalTemas').classList.remove('aberto');
});
document.getElementById('modalTemas').addEventListener('click', (e) => {
  if (e.target.id === 'modalTemas') document.getElementById('modalTemas').classList.remove('aberto');
});
document.querySelectorAll('#modalTemas .tema-opcao').forEach(btn => {
  btn.addEventListener('click', () => {
    const tema = btn.dataset.tema;
    if (!TEMAS_VALIDOS.includes(tema)) return; // defesa: nunca aplicar um valor fora da lista conhecida
    dados.tema = tema;
    aplicarTema();
    salvar();
    document.getElementById('modalTemas').classList.remove('aberto');
  });
});

// ===== Modal: ajustar valor de dias específicos =====
function renderListaDiasEditar() {
  const lista = document.getElementById('listaDiasEditar');
  const aviso = document.getElementById('avisoSemDias');
  lista.innerHTML = '';

  const ano = mesExibido.ano;
  const mes = mesExibido.mes;
  const totalDias = new Date(ano, mes + 1, 0).getDate();

  const diasDoMes = [];
  for (let dia = 1; dia <= totalDias; dia++) {
    const chave = `${ano}-${mes}-${dia}`;
    if (dados.diasTrabalhados[chave]) diasDoMes.push({ dia, chave });
  }

  aviso.style.display = diasDoMes.length === 0 ? 'block' : 'none';

  diasDoMes.forEach(({ dia, chave }) => {
    const linha = document.createElement('div');
    linha.className = 'linha-dia-editar';

    const nomeDia = new Date(ano, mes, dia).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const label = document.createElement('span');
    label.className = 'linha-dia-label';
    label.textContent = nomeDia;

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = '0,00';
    const temPersonalizado = dados.valoresPersonalizados[chave] !== undefined;
    input.value = temPersonalizado ? formatarMoedaInput(dados.valoresPersonalizados[chave]) : '';
    input.setAttribute('aria-label', 'Valor personalizado para ' + nomeDia);
    // Mostra o valor padrão como dica, quando não há valor personalizado ainda
    if (!temPersonalizado) {
      input.placeholder = formatarMoeda(valorDoDia(ano, mes, dia)).replace('R$ ', '');
    }
    input.addEventListener('input', e => {
      aplicarMascaraMoeda(e.target);
      const texto = e.target.value;
      if (texto === '') {
        delete dados.valoresPersonalizados[chave];
      } else {
        dados.valoresPersonalizados[chave] = lerMoeda(texto);
      }
      salvar();
      renderCalendario();
      renderResumo();
    });

    const btnReset = document.createElement('button');
    btnReset.className = 'btn-reset-dia';
    btnReset.textContent = 'padrão';
    btnReset.title = 'Voltar a usar o valor padrão desse dia da semana';
    btnReset.addEventListener('click', () => {
      delete dados.valoresPersonalizados[chave];
      salvar();
      renderCalendario();
      renderResumo();
      renderListaDiasEditar();
    });

    linha.appendChild(label);
    linha.appendChild(input);
    linha.appendChild(btnReset);
    lista.appendChild(linha);
  });
}

document.getElementById('btnEditarDias').addEventListener('click', () => {
  renderListaDiasEditar();
  document.getElementById('modalDias').classList.add('aberto');
});
document.getElementById('btnFecharModalDias').addEventListener('click', () => {
  document.getElementById('modalDias').classList.remove('aberto');
});
document.getElementById('modalDias').addEventListener('click', (e) => {
  if (e.target.id === 'modalDias') document.getElementById('modalDias').classList.remove('aberto');
});

// ===== Backup: exportar e importar em .json =====
document.getElementById('btnBackup').addEventListener('click', () => {
  document.getElementById('statusImportacao').textContent = '';
  document.getElementById('modalBackup').classList.add('aberto');
});
document.getElementById('btnFecharModalBackup').addEventListener('click', () => {
  document.getElementById('modalBackup').classList.remove('aberto');
});
document.getElementById('modalBackup').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackup') document.getElementById('modalBackup').classList.remove('aberto');
});

document.getElementById('btnExportarBackup').addEventListener('click', () => {
  // Gera um arquivo .json com todos os dados atuais e dispara o download.
  // Não usamos nenhuma biblioteca: criamos um link temporário e clicamos nele
  // via JavaScript — é assim que se baixa um arquivo gerado na hora, sem servidor.
  const conteudo = JSON.stringify(dados, null, 2);
  const blob = new Blob([conteudo], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const hoje = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `controle-financeiro-backup-${hoje}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

// Escapa uma célula de CSV: se o texto tiver ponto-e-vírgula, aspas ou
// quebra de linha, precisa ir entre aspas (com as aspas internas dobradas),
// senão bagunça as colunas de quem abrir o arquivo numa planilha.
function celulaCSV(texto) {
  const t = String(texto ?? '');
  if (/[;"\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

// Converte "YYYY-MM-DD" pra "DD/MM/AAAA" — mais familiar em planilha
// brasileira do que o formato ISO que o app usa internamente.
function dataParaBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

document.getElementById('btnExportarCSV').addEventListener('click', () => {
  // Usamos ponto-e-vírgula como separador (não vírgula): nossos valores já
  // usam vírgula como separador decimal ("1.234,56"), e é assim que o
  // Excel em português espera um CSV — com vírgula como separador de
  // coluna, cada valor monetário seria cortado ao meio na hora de abrir.
  const linhas = [['Nome', 'Valor', 'Categoria', 'Vencimento', 'Status'].join(';')];
  dados.contas.forEach(c => {
    linhas.push([
      celulaCSV(c.nome || ''),
      celulaCSV(formatarMoedaInput(c.valor)),
      celulaCSV(c.categoria || ''),
      celulaCSV(dataParaBR(c.vencimento)),
      celulaCSV(c.status || 'Pendente')
    ].join(';'));
  });
  // O "\uFEFF" (BOM) no início não aparece na tela — é um sinal invisível
  // que avisa o Excel que o arquivo é UTF-8. Sem ele, acentos e "ç" viram
  // caracteres estranhos quando alguém abre o CSV no Excel do Windows.
  const conteudo = '\uFEFF' + linhas.join('\r\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const hoje = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `controle-financeiro-contas-${hoje}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

document.getElementById('btnImportarBackup').addEventListener('click', () => {
  document.getElementById('inputImportarBackup').click();
});

document.getElementById('inputImportarBackup').addEventListener('change', (e) => {
  const arquivo = e.target.files[0];
  const statusEl = document.getElementById('statusImportacao');
  if (!arquivo) return;

  const leitor = new FileReader();
  leitor.onload = async () => {
    let bruto;
    try {
      bruto = JSON.parse(leitor.result);
    } catch (err) {
      statusEl.textContent = '⚠️ Esse arquivo não é um backup válido.';
      e.target.value = '';
      return;
    }
    let novosDados;
    try {
      novosDados = normalizarBackup(bruto);
    } catch (err) {
      // JSON até válido, mas com formato errado (ex: "contas" não é lista).
      // Sem essa validação, isso derrubaria o app na hora de desenhar a tela.
      statusEl.textContent = '⚠️ Esse arquivo não tem o formato de um backup deste app.';
      e.target.value = '';
      return;
    }
    // Confirmação de segurança: importar substitui o que está salvo agora.
    const ok = await confirmarModal({
      titulo: 'Importar backup',
      mensagem: 'Isso vai substituir os dados atuais deste aparelho pelos do arquivo. Continuar?',
      textoConfirmar: 'Importar',
      perigo: true
    });
    if (!ok) {
      e.target.value = '';
      return;
    }
    dados = novosDados;
    salvar();
    aplicarDadosNaTela();
    statusEl.textContent = '✅ Backup importado com sucesso!';
    e.target.value = '';
  };
  leitor.onerror = () => {
    statusEl.textContent = '⚠️ Não foi possível ler o arquivo.';
  };
  leitor.readAsText(arquivo);
});

// ===== Conta: login, cadastro e sincronização com a nuvem =====
const modalConta = document.getElementById('modalConta');
const contaDeslogado = document.getElementById('contaDeslogado');
const contaLogado = document.getElementById('contaLogado');
const statusConta = document.getElementById('statusConta');

document.getElementById('btnConta').addEventListener('click', () => {
  statusConta.textContent = '';
  modalConta.classList.add('aberto');
  // Começa a carregar o Firebase em segundo plano assim que o modal abre —
  // se a pessoa realmente clicar em "Entrar" depois, o Firebase já estará
  // pronto (ou quase), sem ela perceber espera. Erros aqui são ignorados
  // silenciosamente; se falhar, tentamos de novo no clique do botão.
  carregarFirebase().catch(() => {});
});
document.getElementById('btnFecharModalConta').addEventListener('click', () => {
  modalConta.classList.remove('aberto');
});
modalConta.addEventListener('click', (e) => {
  if (e.target.id === 'modalConta') modalConta.classList.remove('aberto');
});

// Mensagens de erro do Firebase vêm em inglês e técnicas (ex: "auth/weak-password").
// Traduzimos as mais comuns pra algo que a pessoa entenda de primeira.
function traduzirErroFirebase(codigo) {
  const mapa = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-password': 'Digite uma senha.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Tente entrar.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Não existe conta com esse e-mail. Tente criar uma.',
    'auth/too-many-requests': 'Muitas tentativas. Espere um pouco e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.'
  };
  return mapa[codigo] || 'Não foi possível concluir. Tente novamente.';
}

document.getElementById('btnEntrar').addEventListener('click', async () => {
  const email = document.getElementById('contaEmail').value.trim();
  const senha = document.getElementById('contaSenha').value;
  statusConta.textContent = 'Conectando...';
  try {
    const fb = await carregarFirebase();
    await fb.authMod.signInWithEmailAndPassword(fb.auth, email, senha);
    // O resto (fechar modal, sincronizar dados) acontece no listener
    // onAuthStateChanged, que é ligado assim que o Firebase termina de carregar.
  } catch (e) {
    // Erros de login de verdade (senha errada, e-mail inválido etc.) sempre
    // vêm com um "e.code" da Firebase. Se não tem "code", é porque nem
    // chegou a conversar com o Firebase — típico de sem-internet, CDN
    // bloqueado, ou nosso próprio limite de tempo (8s) estourando.
    statusConta.textContent = e.code
      ? '⚠️ ' + traduzirErroFirebase(e.code)
      : '⚠️ Não foi possível conectar ao serviço de login. Verifique sua internet.';
  }
});

document.getElementById('btnCriarConta').addEventListener('click', async () => {
  const email = document.getElementById('contaEmail').value.trim();
  const senha = document.getElementById('contaSenha').value;
  statusConta.textContent = 'Criando conta...';
  try {
    const fb = await carregarFirebase();
    await fb.authMod.createUserWithEmailAndPassword(fb.auth, email, senha);
  } catch (e) {
    statusConta.textContent = e.code
      ? '⚠️ ' + traduzirErroFirebase(e.code)
      : '⚠️ Não foi possível conectar ao serviço de login. Verifique sua internet.';
  }
});

document.getElementById('btnSair').addEventListener('click', async () => {
  try {
    const fb = await carregarFirebase();
    await fb.authMod.signOut(fb.auth);
  } catch (e) {
    console.error('Erro ao sair:', e);
  }
  // Os dados continuam salvos neste aparelho (localStorage) depois do logout —
  // só paramos de mandar atualizações pra nuvem até logar de novo.
  modalConta.classList.remove('aberto');
});

// Liga o listener de login assim que o Firebase estiver disponível. Isso é
// chamado tanto ao abrir o app (silenciosamente, em segundo plano — se não
// houver internet, o app continua 100% funcional só que sem sincronizar)
// quanto depois de qualquer ação de login/cadastro/logout.
let listenerContaLigado = false;
function ligarListenerDeConta() {
  if (listenerContaLigado) return;
  listenerContaLigado = true;
  carregarFirebase().then(fb => {
    fb.authMod.onAuthStateChanged(fb.auth, async (user) => {
      usuarioAtual = user ? { uid: user.uid, fb } : null;

      if (!user) {
        contaDeslogado.style.display = 'block';
        contaLogado.style.display = 'none';
        return;
      }

      contaDeslogado.style.display = 'none';
      contaLogado.style.display = 'block';
      document.getElementById('contaEmailAtual').textContent = user.email;
      document.getElementById('contaEmail').value = '';
      document.getElementById('contaSenha').value = '';

      await sincronizarComANuvem(user, fb);
      modalConta.classList.remove('aberto');
    });
  }).catch(() => {
    // Sem internet/Firebase indisponível ao abrir o app: sem problema,
    // segue tudo funcionando só com os dados deste aparelho.
    listenerContaLigado = false;
  });
}

// Decide o que fazer quando alguém loga: se já existem dados na nuvem desse
// usuário, pergunta se quer usá-los (substitui os deste aparelho) ou manter
// os deste aparelho (substitui os da nuvem). Se a nuvem ainda está vazia,
// simplesmente envia os dados atuais do aparelho pra lá.
async function sincronizarComANuvem(user, fb) {
  statusConta.textContent = 'Sincronizando...';
  try {
    const ref = fb.storeMod.doc(fb.db, 'usuarios', user.uid);
    const snap = await fb.storeMod.getDoc(ref);

    if (snap.exists()) {
      const dadosNuvem = snap.data();
      // Antes só olhava contas/salário — alguém que só registrou dias
      // trabalhados (sem cadastrar conta nem salário) tinha os dados
      // sobrescritos sem aviso ao entrar em outro aparelho.
      const temDadosLocaisReais = dados.contas.length > 0
        || Number(dados.salario) > 0
        || Object.keys(dados.diasTrabalhados || {}).length > 0
        || Object.keys(dados.valoresPersonalizados || {}).length > 0
        || (dados.historicoMeses || []).length > 0;

      let usarNuvem = true;
      if (temDadosLocaisReais) {
        usarNuvem = await confirmarModal({
          titulo: 'Dados encontrados na nuvem',
          mensagem: 'Encontramos dados salvos na nuvem dessa conta. O que você quer manter?',
          textoConfirmar: 'Usar os da nuvem',
          textoCancelar: 'Manter os deste aparelho'
        });
      }

      if (usarNuvem) {
        dados = Object.assign({
          tema: dados.tema, salario: 0, valorSemana: 0, valorSabado: 0, valorDomingo: 0,
          contas: [], diasTrabalhados: {}, valoresPersonalizados: {}, historicoMeses: []
        }, dadosNuvem);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
        aplicarDadosNaTela();
      } else {
        await fb.storeMod.setDoc(ref, dados);
      }
    } else {
      // Primeira vez desse usuário: sobe o que já existe neste aparelho.
      await fb.storeMod.setDoc(ref, dados);
    }
    statusConta.textContent = '';
  } catch (e) {
    statusConta.textContent = '⚠️ Não foi possível sincronizar agora.';
    console.error('Erro ao sincronizar:', e);
  }
}

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

// Preenche um campo numérico só quando o valor salvo é diferente de zero.
// Se o valor for 0 (padrão inicial), deixa o campo vazio — assim a pessoa
// não precisa apagar um "0" toda vez que for digitar. O placeholder no HTML
// já mostra "0,00" como dica visual, sem isso contar como valor de verdade.
function preencherCampoNumerico(id, valor) {
  const el = document.getElementById(id);
  el.value = (Number(valor) === 0) ? '' : formatarMoedaInput(valor);
}

// ===== Inicialização =====
function aplicarDadosNaTela() {
  aplicarTema();
  preencherCampoNumerico('salario', dados.salario);
  preencherCampoNumerico('valorSemana', dados.valorSemana);
  preencherCampoNumerico('valorSabado', dados.valorSabado);
  preencherCampoNumerico('valorDomingo', dados.valorDomingo);
  document.getElementById('ordenarContas').value = dados.ordenarContasPor || 'vencimento';
  renderContas();
  renderCalendario();
  renderResumo();
}

function iniciar() {
  carregar();
  aplicarDadosNaTela();

  // Se o app ficar aberto passando da meia-noite, o destaque de "hoje"
  // precisa se mover sozinho. Verificamos a cada minuto (leve, não pesa)
  // e só redesenhamos o calendário quando o dia realmente mudar.
  let diaAtualConhecido = new Date().getDate();
  setInterval(() => {
    const diaAgora = new Date().getDate();
    if (diaAgora !== diaAtualConhecido) {
      diaAtualConhecido = diaAgora;
      renderCalendario();
    }
  }, 60000);

  // Tenta ligar a sincronização com a nuvem em segundo plano, sem travar a
  // tela nem atrasar o carregamento do app. Se não houver internet ou o
  // Firebase demorar demais, isso falha silenciosamente e o app continua
  // funcionando 100% normal, só com os dados deste aparelho.
  ligarListenerDeConta();
}

// ===== Atalhos de teclado =====
// Aviso importante: Ctrl+N ("nova janela") é reservado pelo próprio
// navegador em praticamente todo desktop (Chrome, Firefox, Edge) — o
// preventDefault() abaixo não consegue bloquear isso, então esse atalho só
// funciona de verdade quando o app está instalado como PWA (sem a barra do
// navegador por cima). Ctrl+B costuma ser mais seguro de interceptar.
document.addEventListener('keydown', (e) => {
  const alvoEhCampo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
  const combo = e.ctrlKey || e.metaKey;

  if (combo && !alvoEhCampo && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    document.getElementById('btnAddConta').click();
  } else if (combo && !alvoEhCampo && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    document.getElementById('btnBackup').click();
  } else if (e.key === 'Escape') {
    // O modal de confirmação/alerta já trata o Esc sozinho (tem sua própria
    // Promise pra resolver) — aqui só fechamos os modais "simples", que não
    // dependem de resolver nada, pra não interferir naquele fluxo.
    document.querySelectorAll('.modal-fundo.aberto').forEach(modal => {
      if (modal.id !== 'modalConfirmacao') modal.classList.remove('aberto');
    });
  }
});

iniciar();

// ===== Sincronização entre abas =====
// Cenário: a pessoa abre o app em duas abas (ou app + atalho na tela
// inicial), edita numa, volta pra outra. Sem isso, a aba "velha" ainda tem
// os dados antigos na memória — e se ela salvar algo depois, sobrescreve
// silenciosamente a edição mais nova que estava só na outra aba.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Se essa aba tem uma escrita pendente (debounce ainda não disparou), ela
  // tem uma edição mais recente que qualquer coisa gravada no disco agora
  // — não vale a pena arriscar descartar o que a pessoa acabou de digitar.
  if (saveTimeout) return;
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) return;
    const doDisco = JSON.parse(bruto);
    // Só re-renderiza se o conteúdo realmente for diferente — evita
    // redesenhar a tela à toa toda vez que a pessoa só troca de aba e volta.
    if (JSON.stringify(doDisco) === JSON.stringify(dados)) return;
    dados = normalizarBackup(doDisco);
    aplicarDadosNaTela();
  } catch (e) {
    // Disco corrompido nesse instante específico: melhor manter o que já
    // está na tela do que arriscar substituir por algo quebrado.
    console.log('Não foi possível resincronizar entre abas.', e);
  }
});