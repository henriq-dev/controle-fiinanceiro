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

// ===== Perfis/carteiras =====
// Cada perfil (ex: "Pessoal", "Trabalho") tem seus próprios dados
// financeiros, guardados numa chave PRÓPRIA no localStorage
// (`STORAGE_KEY:NomeDoPerfil`). Só existe UM registro pequeno à parte
// (CHAVE_PERFIS) guardando quais perfis existem e qual está ativo agora.
// Essa separação existe de propósito: o resto do app inteiro (dados.contas,
// dados.salario, etc.) continua funcionando exatamente igual — ele não sabe
// nem precisa saber que existem "perfis". Trocar de perfil só troca QUAL
// chave o salvar()/carregar() apontam, e recarrega tudo do zero.
const CHAVE_PERFIS = 'controle-financeiro-perfis';
let perfisInfo = { ativo: 'Pessoal', lista: ['Pessoal'] };

function chaveStorageDoPerfil(nome) {
  return `${STORAGE_KEY}:${nome}`;
}

// Lê (ou cria) o registro de perfis. Se a pessoa já usava o app antes dessa
// funcionalidade existir, os dados dela estão na chave ANTIGA (sem nome de
// perfil) — migramos automaticamente pra dentro de um perfil "Pessoal",
// sem apagar o original, só por segurança.
function carregarInfoPerfis() {
  try {
    const bruto = localStorage.getItem(CHAVE_PERFIS);
    if (bruto) {
      const salvo = JSON.parse(bruto);
      if (salvo && Array.isArray(salvo.lista) && salvo.lista.length > 0 && typeof salvo.ativo === 'string') {
        perfisInfo = salvo;
        return;
      }
    }
  } catch (e) {
    console.log('Não foi possível ler o registro de perfis, criando um novo.', e);
  }

  // Não existe registro de perfis ainda. Se já existirem dados na chave
  // antiga (de antes dessa funcionalidade), migra pra dentro do perfil
  // "Pessoal" — a pessoa não deve perceber nenhuma diferença.
  perfisInfo = { ativo: 'Pessoal', lista: ['Pessoal'] };
  try {
    const dadosAntigos = localStorage.getItem(STORAGE_KEY);
    if (dadosAntigos && !localStorage.getItem(chaveStorageDoPerfil('Pessoal'))) {
      localStorage.setItem(chaveStorageDoPerfil('Pessoal'), dadosAntigos);
    }
  } catch (e) {
    console.log('Não foi possível migrar dados antigos pro perfil Pessoal.', e);
  }
  try {
    localStorage.setItem(CHAVE_PERFIS, JSON.stringify(perfisInfo));
  } catch (e) {
    console.log('Não foi possível salvar o registro de perfis.', e);
  }
}

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
  ordenarContasPor: 'vencimento', // 'vencimento' | 'valor' | 'nome' — lembrado entre sessões
  pinHash: null, // hash SHA-256 do PIN de bloqueio local, ou null se não tiver
  metaEconomia: 0, // quanto a pessoa quer guardar por mês; 0 = sem meta definida
  gastosAvulsos: [], // despesas do dia a dia, cada uma com sua própria data — { descricao, valor, data }
  onboardingVisto: false // true depois que a pessoa vê o tutorial inicial (ou pula ele)
};

const hojeInicial = new Date();
let mesExibido = { ano: hojeInicial.getFullYear(), mes: hojeInicial.getMonth() };
// Controla qual dia deve "pular" (animação) na próxima renderização do
// calendário — null na maior parte do tempo, só recebe uma chave no
// instante entre marcar um dia e o calendário ser redesenhado.
let ultimoDiaMarcadoPop = null;

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
    // Só aceita null ou algo com a cara de um hash SHA-256 (64 caracteres
    // hexadecimais) — qualquer outra coisa vira null, pra nunca travar a
    // pessoa fora do próprio app com um valor de backup corrompido/malicioso.
    pinHash: (typeof bruto.pinHash === 'string' && /^[0-9a-f]{64}$/.test(bruto.pinHash)) ? bruto.pinHash : null,
    metaEconomia: lerMoeda(bruto.metaEconomia),
    contas: [],
    diasTrabalhados: {},
    valoresPersonalizados: {},
    historicoMeses: [],
    gastosAvulsos: [],
    // Se o backup é de antes dessa feature existir (undefined), assume que
    // já viu — quem está restaurando um backup já tem dados, não é uma
    // pessoa nova abrindo o app pela primeira vez.
    onboardingVisto: typeof bruto.onboardingVisto === 'boolean' ? bruto.onboardingVisto : true
  };

  if (Array.isArray(bruto.contas)) {
    normalizado.contas = bruto.contas
      .filter(c => c && typeof c === 'object')
      .map(c => ({
        nome: typeof c.nome === 'string' ? c.nome.slice(0, 200) : '',
        valor: lerMoeda(c.valor),
        categoria: typeof c.categoria === 'string' ? c.categoria.slice(0, 60) : '',
        vencimento: (typeof c.vencimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) ? c.vencimento : '',
        status: (c.status === 'Pago') ? 'Pago' : 'Pendente',
        // Conta parcelada: { atual, total }, ambos inteiros positivos com
        // atual <= total. Qualquer coisa fora disso vira "não parcelada"
        // (null) — mais seguro que travar a importação inteira por causa
        // de um campo secundário malformado.
        parcela: (c.parcela && Number.isInteger(c.parcela.atual) && Number.isInteger(c.parcela.total)
          && c.parcela.atual >= 1 && c.parcela.total >= 1 && c.parcela.atual <= c.parcela.total)
          ? { atual: c.parcela.atual, total: c.parcela.total }
          : null
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

  if (Array.isArray(bruto.gastosAvulsos)) {
    normalizado.gastosAvulsos = bruto.gastosAvulsos
      .filter(g => g && typeof g === 'object')
      .map(g => ({
        descricao: typeof g.descricao === 'string' ? g.descricao.slice(0, 100) : '',
        valor: lerMoeda(g.valor),
        data: (typeof g.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.data)) ? g.data : ''
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

// ===== Bloqueio por PIN =====
// Isso NÃO é criptografia de verdade — é uma trava de privacidade básica
// pra alguém não conseguir abrir seus números só pegando o celular
// destravado na mesa. Por isso é aceitável guardar só o hash (não o PIN
// em texto puro) usando a Web Crypto API nativa do navegador (SHA-256) —
// já dá uma camada de proteção contra "abrir o F12 e ler o localStorage
// direto", sem precisar de nenhuma biblioteca externa.
async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let _pinResolver = null;

function _fecharModalPin(valor) {
  document.getElementById('modalPin').classList.remove('aberto');
  const resolver = _pinResolver;
  _pinResolver = null;
  if (resolver) resolver(valor);
}

// Pede um PIN à pessoa e devolve o que ela digitou (ou null se cancelou).
// Reaproveitado nos três fluxos: criar, confirmar e remover PIN.
function pedirPin(titulo, mensagem) {
  return new Promise(resolve => {
    document.getElementById('pinTitulo').textContent = titulo;
    document.getElementById('pinMensagem').textContent = mensagem || '';
    document.getElementById('pinErro').textContent = '';
    const inputVelho = document.getElementById('pinInput');
    const input = inputVelho.cloneNode(true);
    input.value = '';
    inputVelho.replaceWith(input);

    const cancelarVelho = document.getElementById('pinBtnCancelar');
    const confirmarVelho = document.getElementById('pinBtnConfirmar');
    const cancelar = cancelarVelho.cloneNode(true);
    const confirmar = confirmarVelho.cloneNode(true);
    cancelarVelho.replaceWith(cancelar);
    confirmarVelho.replaceWith(confirmar);

    _pinResolver = resolve;
    cancelar.addEventListener('click', () => _fecharModalPin(null));
    confirmar.addEventListener('click', () => _fecharModalPin(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar.click(); });

    document.getElementById('modalPin').classList.add('aberto');
    setTimeout(() => input.focus(), 0);
  });
}
document.getElementById('modalPin').addEventListener('click', (e) => {
  if (e.target.id === 'modalPin') _fecharModalPin(null);
});

// Prompt de texto livre genérico — mesma lógica do pedirPin, mas sem
// mascarar os caracteres (usado hoje só pra nomear/renomear perfil).
function pedirTexto(titulo, mensagem, valorInicial) {
  return new Promise(resolve => {
    document.getElementById('textoTitulo').textContent = titulo;
    document.getElementById('textoMensagem').textContent = mensagem || '';
    document.getElementById('textoErro').textContent = '';
    const inputVelho = document.getElementById('textoInput');
    const input = inputVelho.cloneNode(true);
    input.value = valorInicial || '';
    inputVelho.replaceWith(input);

    const cancelarVelho = document.getElementById('textoBtnCancelar');
    const confirmarVelho = document.getElementById('textoBtnConfirmar');
    const cancelar = cancelarVelho.cloneNode(true);
    const confirmar = confirmarVelho.cloneNode(true);
    cancelarVelho.replaceWith(cancelar);
    confirmarVelho.replaceWith(confirmar);

    function fechar(valor) {
      document.getElementById('modalTexto').classList.remove('aberto');
      resolve(valor);
    }
    cancelar.addEventListener('click', () => fechar(null));
    confirmar.addEventListener('click', () => fechar(input.value.trim()));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirmar.click(); });

    document.getElementById('modalTexto').classList.add('aberto');
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}
document.getElementById('modalTexto').addEventListener('click', (e) => {
  if (e.target.id === 'modalTexto') document.getElementById('modalTexto').classList.remove('aberto');
});

// ===== Gerenciamento de perfis/carteiras =====
function salvarInfoPerfis() {
  try {
    localStorage.setItem(CHAVE_PERFIS, JSON.stringify(perfisInfo));
  } catch (e) {
    console.error('Erro ao salvar registro de perfis:', e);
  }
}

// Estrutura de dados vazia pra um perfil novo. tema/pinHash/onboardingVisto
// são preferências do APARELHO, não da carteira financeira — por isso
// atravessam a troca de perfil sem mudar (puxa do "dados" atual, antes de
// trocar).
function dadosPadraoNovoPerfil() {
  return {
    tema: dados.tema,
    pinHash: dados.pinHash,
    onboardingVisto: dados.onboardingVisto,
    salario: 0, valorSemana: 0, valorSabado: 0, valorDomingo: 0,
    contas: [], diasTrabalhados: {}, valoresPersonalizados: {},
    historicoMeses: [], ordenarContasPor: 'vencimento', metaEconomia: 0,
    gastosAvulsos: []
  };
}

function trocarPerfil(nome) {
  if (nome === perfisInfo.ativo) return;
  // Salva o perfil atual NA HORA (não espera o debounce de 400ms) — trocar
  // de perfil não pode arriscar perder uma edição recente.
  clearTimeout(saveTimeout);
  try {
    localStorage.setItem(chaveStorageDoPerfil(perfisInfo.ativo), JSON.stringify(dados));
  } catch (e) {
    console.error('Erro ao salvar antes de trocar de perfil:', e);
  }
  perfisInfo.ativo = nome;
  salvarInfoPerfis();
  dados = dadosPadraoNovoPerfil();
  carregar();
  aplicarDadosNaTela();
}

function atualizarSeletorPerfis() {
  const select = document.getElementById('seletorPerfil');
  select.innerHTML = perfisInfo.lista
    .map(nome => `<option value="${escaparHTML(nome)}">${escaparHTML(nome)}</option>`)
    .join('');
  select.value = perfisInfo.ativo;
}

document.getElementById('seletorPerfil').addEventListener('change', e => {
  trocarPerfil(e.target.value);
});

async function criarPerfil() {
  const nome = await pedirTexto('Novo perfil', 'Nome do novo perfil (ex: Trabalho, Empresa)');
  if (!nome) return;
  if (perfisInfo.lista.includes(nome)) {
    await alertarModal('Já existe um perfil com esse nome.');
    return;
  }
  perfisInfo.lista.push(nome);
  salvarInfoPerfis();
  trocarPerfil(nome);
  atualizarSeletorPerfis();
}

async function renomearPerfilAtual() {
  const nomeAtual = perfisInfo.ativo;
  const novoNome = await pedirTexto('Renomear perfil', `Novo nome pra "${nomeAtual}"`, nomeAtual);
  if (!novoNome || novoNome === nomeAtual) return;
  if (perfisInfo.lista.includes(novoNome)) {
    await alertarModal('Já existe um perfil com esse nome.');
    return;
  }
  try {
    localStorage.setItem(chaveStorageDoPerfil(novoNome), JSON.stringify(dados));
    localStorage.removeItem(chaveStorageDoPerfil(nomeAtual));
  } catch (e) {
    console.error('Erro ao renomear perfil:', e);
  }
  perfisInfo.lista = perfisInfo.lista.map(p => p === nomeAtual ? novoNome : p);
  perfisInfo.ativo = novoNome;
  salvarInfoPerfis();
  atualizarSeletorPerfis();
}

async function excluirPerfilAtual() {
  if (perfisInfo.lista.length <= 1) {
    await alertarModal('Não é possível excluir o único perfil que existe.');
    return;
  }
  const nomeAtual = perfisInfo.ativo;
  const ok = await confirmarModal({
    titulo: 'Excluir perfil?',
    mensagem: `Isso apaga TODOS os dados do perfil "${nomeAtual}" (contas, diárias, histórico) deste aparelho. Não pode ser desfeito.`,
    textoConfirmar: 'Excluir',
    perigo: true
  });
  if (!ok) return;
  localStorage.removeItem(chaveStorageDoPerfil(nomeAtual));
  perfisInfo.lista = perfisInfo.lista.filter(p => p !== nomeAtual);
  perfisInfo.ativo = perfisInfo.lista[0];
  salvarInfoPerfis();
  dados = dadosPadraoNovoPerfil();
  carregar();
  aplicarDadosNaTela();
  atualizarSeletorPerfis();
}

document.getElementById('btnNovoPerfil').addEventListener('click', criarPerfil);
document.getElementById('btnRenomearPerfil').addEventListener('click', renomearPerfilAtual);
document.getElementById('btnExcluirPerfil').addEventListener('click', excluirPerfilAtual);

function atualizarBotaoPin() {
  const temPin = !!dados.pinHash;
  document.getElementById('btnConfigurarPin').textContent = temPin ? 'Alterar PIN' : 'Definir PIN';
  document.getElementById('btnRemoverPin').style.display = temPin ? '' : 'none';
}

// ===== Configurar parcelamento de uma conta =====
function configurarParcela(conta) {
  const modal = document.getElementById('modalParcelas');
  const inputAtualVelho = document.getElementById('parcelaAtualInput');
  const inputTotalVelho = document.getElementById('parcelaTotalInput');
  // Clona os campos e botões pra descartar handlers de uma chamada anterior
  // (mesma técnica do confirmarModal/pedirPin) — sem isso, abrir esse modal
  // pra contas diferentes iria acumulando um listener de clique por cima
  // do outro.
  const inputAtual = inputAtualVelho.cloneNode(true);
  const inputTotal = inputTotalVelho.cloneNode(true);
  inputAtualVelho.replaceWith(inputAtual);
  inputTotalVelho.replaceWith(inputTotal);
  inputAtual.value = conta.parcela ? conta.parcela.atual : 1;
  inputTotal.value = conta.parcela ? conta.parcela.total : '';
  document.getElementById('parcelaErro').textContent = '';

  const btnRemoverVelho = document.getElementById('parcelaBtnRemover');
  const btnCancelarVelho = document.getElementById('parcelaBtnCancelar');
  const btnSalvarVelho = document.getElementById('parcelaBtnSalvar');
  const btnRemover = btnRemoverVelho.cloneNode(true);
  const btnCancelar = btnCancelarVelho.cloneNode(true);
  const btnSalvar = btnSalvarVelho.cloneNode(true);
  btnRemoverVelho.replaceWith(btnRemover);
  btnCancelarVelho.replaceWith(btnCancelar);
  btnSalvarVelho.replaceWith(btnSalvar);
  btnRemover.style.display = conta.parcela ? '' : 'none';

  function fechar() { modal.classList.remove('aberto'); }

  btnCancelar.addEventListener('click', fechar);
  btnRemover.addEventListener('click', () => {
    conta.parcela = null;
    salvar();
    renderContas();
    fechar();
  });
  btnSalvar.addEventListener('click', () => {
    const atual = parseInt(inputAtual.value, 10);
    const total = parseInt(inputTotal.value, 10);
    const erro = document.getElementById('parcelaErro');
    if (!Number.isInteger(atual) || !Number.isInteger(total) || atual < 1 || total < 1) {
      erro.textContent = 'Preencha os dois campos com números maiores que zero.';
      return;
    }
    if (atual > total) {
      erro.textContent = 'A parcela atual não pode ser maior que o total.';
      return;
    }
    conta.parcela = { atual, total };
    salvar();
    renderContas();
    fechar();
  });

  modal.classList.add('aberto');
  setTimeout(() => inputAtual.focus(), 0);
}
document.getElementById('modalParcelas').addEventListener('click', (e) => {
  if (e.target.id === 'modalParcelas') document.getElementById('modalParcelas').classList.remove('aberto');
});

async function configurarPin() {
  if (dados.pinHash) {
    const atual = await pedirPin('Digite o PIN atual', 'Confirme antes de alterar.');
    if (atual === null) return;
    if ((await hashPin(atual)) !== dados.pinHash) {
      await alertarModal('PIN atual incorreto.');
      return;
    }
  }
  const novo = await pedirPin('Criar um novo PIN', 'Use de 4 a 6 dígitos numéricos.');
  if (novo === null) return;
  if (!/^\d{4,6}$/.test(novo)) {
    await alertarModal('O PIN precisa ter de 4 a 6 dígitos numéricos, nada mais.');
    return;
  }
  const confirmacao = await pedirPin('Confirme o novo PIN');
  if (confirmacao === null) return;
  if (confirmacao !== novo) {
    await alertarModal('Os PINs digitados não são iguais. Tente de novo.');
    return;
  }
  dados.pinHash = await hashPin(novo);
  salvar();
  atualizarBotaoPin();
  await alertarModal('PIN definido com sucesso.');
}

async function removerPin() {
  const atual = await pedirPin('Digite o PIN atual', 'Confirme pra remover o bloqueio.');
  if (atual === null) return;
  if ((await hashPin(atual)) !== dados.pinHash) {
    await alertarModal('PIN incorreto.');
    return;
  }
  dados.pinHash = null;
  salvar();
  atualizarBotaoPin();
  await alertarModal('Bloqueio por PIN removido.');
}

document.getElementById('btnConfigurarPin').addEventListener('click', configurarPin);
document.getElementById('btnRemoverPin').addEventListener('click', removerPin);

// Tela de bloqueio inicial: se existe um PIN configurado, cobre a tela
// inteira até a pessoa acertar. Os dados já carregaram por trás (não tem
// como "não carregar" e ainda assim o app funcionar) — essa tela só
// impede a VISÃO, não é uma cripto de disco de verdade.
function verificarBloqueioInicial() {
  if (!dados.pinHash) return;
  const overlay = document.getElementById('telaBloqueio');
  const input = document.getElementById('bloqueioInput');
  const erro = document.getElementById('bloqueioErro');
  overlay.classList.add('aberto');
  setTimeout(() => input.focus(), 100);

  async function tentar() {
    const digitado = await hashPin(input.value);
    if (digitado === dados.pinHash) {
      overlay.classList.remove('aberto');
    } else {
      erro.textContent = 'PIN incorreto, tente de novo.';
      input.value = '';
      input.focus();
    }
  }
  document.getElementById('bloqueioBtnEntrar').addEventListener('click', tentar);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tentar(); });
}

// ===== Onboarding =====
const PASSOS_ONBOARDING = [
  {
    titulo: 'Bem-vindo(a) ao Controle Financeiro',
    texto: 'Alguns passos rápidos pra você entender como o app funciona. Leva menos de 1 minuto, e dá pra pular a qualquer momento.'
  },
  {
    titulo: 'Resumo do mês',
    texto: 'No topo, você vê salário fixo, diárias recebidas, total das contas e o que sobra no fim do mês. Fica verde quando sobra, vermelho quando falta.'
  },
  {
    titulo: 'Calendário e diárias',
    texto: 'Se você trabalha por dia (diarista, freelancer, motorista de app), toque nos dias que trabalhou no calendário. O valor de cada dia entra sozinho no resumo.'
  },
  {
    titulo: 'Contas e vencimentos',
    texto: 'Cadastre suas contas fixas com valor, categoria e vencimento. Uma bolinha aparece no dia certo do calendário — vermelha se está pendente, verde se já foi paga.'
  },
  {
    titulo: 'Fechar o mês',
    texto: 'Quando o mês terminar, toque em "Fechar mês" — isso guarda um resumo no histórico e já prepara tudo pro mês seguinte. Vale também fazer backup dos seus dados de vez em quando, em "Minha conta".'
  }
];

let onboardingPassoAtual = 0;

function renderPassoOnboarding() {
  const passo = PASSOS_ONBOARDING[onboardingPassoAtual];
  document.getElementById('onboardingContador').textContent = `${onboardingPassoAtual + 1} de ${PASSOS_ONBOARDING.length}`;
  document.getElementById('onboardingTitulo').textContent = passo.titulo;
  document.getElementById('onboardingTexto').textContent = passo.texto;
  document.getElementById('onboardingBtnAnterior').style.display = onboardingPassoAtual === 0 ? 'none' : '';
  const ehUltimo = onboardingPassoAtual === PASSOS_ONBOARDING.length - 1;
  document.getElementById('onboardingBtnProximo').textContent = ehUltimo ? 'Começar' : 'Próximo';
  document.getElementById('onboardingBtnPular').style.display = ehUltimo ? 'none' : '';
}

function fecharOnboarding() {
  document.getElementById('modalOnboarding').classList.remove('aberto');
  dados.onboardingVisto = true;
  salvar();
}

function abrirOnboarding() {
  onboardingPassoAtual = 0;
  renderPassoOnboarding();
  document.getElementById('modalOnboarding').classList.add('aberto');
}

document.getElementById('onboardingBtnProximo').addEventListener('click', () => {
  if (onboardingPassoAtual === PASSOS_ONBOARDING.length - 1) {
    fecharOnboarding();
  } else {
    onboardingPassoAtual++;
    renderPassoOnboarding();
  }
});
document.getElementById('onboardingBtnAnterior').addEventListener('click', () => {
  if (onboardingPassoAtual > 0) {
    onboardingPassoAtual--;
    renderPassoOnboarding();
  }
});
document.getElementById('onboardingBtnPular').addEventListener('click', fecharOnboarding);
document.getElementById('btnVerTutorial').addEventListener('click', () => {
  document.getElementById('modalConta').classList.remove('aberto');
  abrirOnboarding();
});

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
      localStorage.setItem(chaveStorageDoPerfil(perfisInfo.ativo), JSON.stringify(dados));
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
      // Cada perfil é um documento PRÓPRIO dentro de uma subcoleção — assim,
      // trocar de perfil na nuvem não sobrescreve os dados de outro perfil.
      fb.storeMod.setDoc(fb.storeMod.doc(fb.db, 'usuarios', uid, 'perfis', perfisInfo.ativo), dados)
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
    const bruto = localStorage.getItem(chaveStorageDoPerfil(perfisInfo.ativo));
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
// Remove acentos e ignora maiúsculas/minúsculas — sem isso, buscar por
// "educacao" não acharia uma conta com categoria "Educação", o que seria
// bem frustrante de usar num app em português.
function normalizarBusca(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

let termoBuscaContas = '';

function renderContas() {
  const tbody = document.getElementById('tabelaContas');
  const aviso = document.getElementById('avisoVazio');
  const avisoBusca = document.getElementById('avisoBuscaSemResultado');
  tbody.innerHTML = '';

  // Mostra as contas ordenadas pelo critério escolhido na tela (vencimento,
  // valor ou nome). O array original (dados.contas) não muda de ordem — só
  // a exibição. Por isso usamos indexOf para achar a posição real ao
  // editar/duplicar/remover.
  const criterio = dados.ordenarContasPor || 'vencimento';
  let contasOrdenadas = [...dados.contas].sort((a, b) => {
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

  if (termoBuscaContas.trim() !== '') {
    const termo = normalizarBusca(termoBuscaContas);
    contasOrdenadas = contasOrdenadas.filter(c =>
      normalizarBusca(c.nome).includes(termo) || normalizarBusca(c.categoria).includes(termo)
    );
  }

  // Dois avisos de "vazio" diferentes: um é "você nunca cadastrou nada"
  // (mostra o botão de adicionar como próximo passo natural), o outro é
  // "sua busca não encontrou nada" (o problema é o termo digitado, não a
  // falta de contas) — confundir os dois deixaria a pessoa achando que
  // perdeu os dados cadastrados só porque digitou uma busca sem resultado.
  const semNenhumaConta = dados.contas.length === 0;
  const semResultadoNaBusca = !semNenhumaConta && contasOrdenadas.length === 0;
  aviso.style.display = semNenhumaConta ? 'block' : 'none';
  avisoBusca.style.display = semResultadoNaBusca ? 'block' : 'none';

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
    if (conta.parcela) {
      const badge = document.createElement('span');
      badge.className = 'badge-parcela';
      badge.textContent = `${conta.parcela.atual}/${conta.parcela.total}`;
      badge.title = `Parcela ${conta.parcela.atual} de ${conta.parcela.total}`;
      tdNome.appendChild(badge);
    }

    const tdValor = document.createElement('td');
    tdValor.dataset.label = 'Valor';
    const inputValor = document.createElement('input');
    inputValor.type = 'text';
    inputValor.className = 'campo-valor-mono';
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
        categoria: conta.categoria || '',
        // A cópia nunca herda o parcelamento — senão as duas contas
        // ficariam competindo pelo mesmo contador de parcelas ao fechar o mês.
        parcela: null
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

    const btnParcela = document.createElement('button');
    btnParcela.className = 'btn-duplicar';
    btnParcela.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="7" height="7" rx="1"></rect><rect x="14" y="5" width="7" height="7" rx="1"></rect><rect x="8.5" y="14" width="7" height="7" rx="1"></rect></svg>';
    btnParcela.setAttribute('aria-label', conta.parcela ? 'Editar parcelamento' : 'Marcar como parcelada');
    btnParcela.title = conta.parcela ? 'Editar parcelamento' : 'Marcar como parcelada';
    btnParcela.addEventListener('click', () => configurarParcela(conta));

    acoesWrap.appendChild(btnParcela);
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
  // 8ª "coluna" do cabeçalho — só um espaço vazio, alinhado com os botões
  // de marcar semana que aparecem embaixo, em cada linha.
  const espacoCabecalho = document.createElement('div');
  espacoCabecalho.className = 'cal-cabecalho';
  cal.appendChild(espacoCabecalho);

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();

  // Cria o botão "marcar semana inteira" que fecha cada linha do
  // calendário (a 8ª coluna do grid). Recebe só as chaves de dias REAIS
  // daquela semana (os dias vazios de preenchimento no início/fim do mês
  // não entram, não têm o que marcar).
  function criarBotaoSemana(chavesDaSemana) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-semana';
    btn.title = 'Marcar todos os dias desta semana como trabalhados';
    btn.setAttribute('aria-label', 'Marcar toda a semana como trabalhada');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7"></path></svg>';
    btn.addEventListener('click', () => {
      chavesDaSemana.forEach(chave => { dados.diasTrabalhados[chave] = true; });
      salvar();
      renderCalendario();
      renderResumo();
    });
    return btn;
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

  // Acumula as chaves da semana que está sendo desenhada agora, pra
  // quando fechar a linha (a cada 7 células) já ter a lista pronta pro
  // botão. "coluna" conta de 0 a 6 (domingo a sábado), reiniciando a cada
  // linha nova — os dias vazios de preenchimento também contam como
  // coluna, senão a linha desalinharia.
  let coluna = 0;
  let chavesDaSemanaAtual = [];

  function avancarColuna() {
    coluna++;
    if (coluna === 7) {
      cal.appendChild(criarBotaoSemana(chavesDaSemanaAtual));
      coluna = 0;
      chavesDaSemanaAtual = [];
    }
  }

  for (let i = 0; i < primeiroDiaSemana; i++) {
    const div = document.createElement('div');
    div.className = 'dia vazio';
    cal.appendChild(div);
    avancarColuna();
  }

  for (let dia = 1; dia <= totalDias; dia++) {
    const chave = `${ano}-${mes}-${dia}`;
    const trabalhado = !!dados.diasTrabalhados[chave];
    const valor = valorDoDia(ano, mes, dia);
    const ehHoje = ano === hojeReal.getFullYear() && mes === hojeReal.getMonth() && dia === hojeReal.getDate();
    const personalizado = dados.valoresPersonalizados[chave] !== undefined;
    const contasDoDia = contasPorDia[dia] || [];

    const div = document.createElement('div');
    div.className = 'dia' + (trabalhado ? ' trabalhado' : '') + (ehHoje ? ' hoje' : '') + (personalizado ? ' personalizado' : '')
      + (chave === ultimoDiaMarcadoPop ? ' pop' : '');
    if (ehHoje) div.title = 'Hoje';
    div.innerHTML = `<span class="num">${dia}</span><span class="val">${valor > 0 ? formatarMoeda(valor).replace('R$ ', '') : ''}</span>`;
    div.addEventListener('click', () => {
      const vaiMarcar = !dados.diasTrabalhados[chave];
      dados.diasTrabalhados[chave] = vaiMarcar;
      // O "pop" só acontece ao MARCAR (não ao desmarcar) — e só nesse dia
      // específico. Guardamos a chave numa variável de módulo porque
      // renderCalendario() reconstrói o calendário inteiro do zero a cada
      // chamada (inclusive por motivos que não têm nada a ver com esse
      // clique); sem isso, toda vez que o calendário fosse redesenhado por
      // qualquer razão, TODOS os dias já marcados dariam o pop juntos.
      ultimoDiaMarcadoPop = vaiMarcar ? chave : null;
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
    chavesDaSemanaAtual.push(chave);
    avancarColuna();
  }

  // Se o mês terminou no meio de uma semana (a maioria dos meses termina
  // assim), a última linha fica incompleta. Preenche com dias vazios até
  // fechar a coluna 7, só pra conseguir mostrar o botão de marcar semana
  // também nessa última linha parcial.
  while (coluna !== 0) {
    const div = document.createElement('div');
    div.className = 'dia vazio';
    cal.appendChild(div);
    avancarColuna();
  }

  // Consumido — sem isso, o próximo redesenho do calendário (por qualquer
  // outro motivo, ex: trocar de mês) faria o mesmo dia "pular" nunca.
  ultimoDiaMarcadoPop = null;
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

// Gastos avulsos do mês exibido — mesmo espírito do totalDiarias: filtra
// pela data de cada gasto, não "reseta" nada ao fechar o mês (igual às
// diárias, o registro fica pra sempre, só sai da vista ao trocar de mês).
function gastosAvulsosDoMes() {
  const ano = mesExibido.ano;
  const mes = mesExibido.mes;
  return dados.gastosAvulsos
    .map((g, indice) => ({ ...g, indice })) // guarda a posição real, pra remover certo depois
    .filter(g => {
      if (!g.data) return false;
      const [a, m] = g.data.split('-').map(Number);
      return a === ano && (m - 1) === mes;
    });
}

function totalGastosAvulsosDoMes() {
  return somarMoeda(gastosAvulsosDoMes(), g => g.valor);
}

function renderGastosAvulsos() {
  const lista = document.getElementById('listaGastosAvulsos');
  const aviso = document.getElementById('avisoSemGastosAvulsos');
  const gastos = gastosAvulsosDoMes().sort((a, b) => (b.data || '').localeCompare(a.data || '')); // mais recente primeiro

  lista.innerHTML = '';
  aviso.style.display = gastos.length === 0 ? 'block' : 'none';

  gastos.forEach(gasto => {
    const linha = document.createElement('div');
    linha.className = 'gasto-avulso-linha';

    const info = document.createElement('div');
    info.className = 'gasto-avulso-info';
    const descricao = document.createElement('span');
    descricao.className = 'gasto-avulso-descricao';
    descricao.textContent = gasto.descricao || 'Gasto sem descrição';
    const data = document.createElement('span');
    data.className = 'gasto-avulso-data';
    data.textContent = gasto.data ? dataParaBR(gasto.data) : '';
    info.appendChild(descricao);
    info.appendChild(data);

    const valor = document.createElement('span');
    valor.className = 'gasto-avulso-valor';
    valor.textContent = formatarMoeda(gasto.valor);

    const btnRem = document.createElement('button');
    btnRem.className = 'btn-remover';
    btnRem.textContent = '✕';
    btnRem.setAttribute('aria-label', 'Remover gasto avulso');
    btnRem.addEventListener('click', async () => {
      const ok = await confirmarModal({
        titulo: 'Remover gasto',
        mensagem: `Remover "${gasto.descricao || 'este gasto'}"?`,
        textoConfirmar: 'Remover',
        perigo: true
      });
      if (!ok) return;
      dados.gastosAvulsos.splice(gasto.indice, 1);
      salvar();
      renderGastosAvulsos();
      renderResumo();
    });

    linha.appendChild(info);
    linha.appendChild(valor);
    linha.appendChild(btnRem);
    lista.appendChild(linha);
  });

  document.getElementById('totalGastosAvulsosRodape').textContent = formatarMoeda(totalGastosAvulsosDoMes());
}

// Domingo a sábado da semana de HOJE de verdade — não depende de qual mês
// a pessoa está navegando no calendário, é sempre a semana atual do
// calendário real, tenha ela dias em um mês ou espalhados por dois.
function limitesSemanaAtual() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - hoje.getDay()); // getDay(): 0 = domingo
  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  return { inicio, fim };
}

// ===== Resumo da semana atual =====
// Mesma estrutura do resumo mensal (diárias, contas, falta pagar, sobra),
// só que olhando pra semana em vez do mês. Uma conta "entra" nessa semana
// pela DATA DE VENCIMENTO, não pela categoria nem por quando foi criada.
function renderResumoSemanal() {
  const { inicio, fim } = limitesSemanaAtual();

  // Diárias: percorre os 7 dias da semana (podem cair em meses diferentes,
  // ex: sábado em agosto e domingo já em setembro) e soma quem foi marcado
  // como trabalhado em cada um deles.
  let centavosDiarias = 0;
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    const chave = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dados.diasTrabalhados[chave]) {
      centavosDiarias += Math.round(valorDoDia(d.getFullYear(), d.getMonth(), d.getDate()) * 100);
    }
  }
  const diariasSemana = centavosDiarias / 100;

  // Contas: entram pela data de vencimento caindo dentro da semana —
  // comparação por string "YYYY-MM-DD" funciona direto porque tanto os
  // limites quanto o vencimento já vêm no mesmo formato ISO.
  const isoInicio = inicio.toISOString().slice(0, 10);
  const isoFim = fim.toISOString().slice(0, 10);
  const contasDaSemana = dados.contas.filter(c => c.vencimento && c.vencimento >= isoInicio && c.vencimento <= isoFim);
  const totalContasSemana = somarMoeda(contasDaSemana, c => c.valor);
  const faltaPagarSemana = somarMoeda(contasDaSemana.filter(c => c.status === 'Pendente'), c => c.valor);
  const sobraSemana = (Math.round(diariasSemana * 100) - Math.round(totalContasSemana * 100)) / 100;

  document.getElementById('diariasSemana').textContent = formatarMoeda(diariasSemana);
  document.getElementById('contasSemana').textContent = formatarMoeda(totalContasSemana);
  document.getElementById('faltaPagarSemana').textContent = formatarMoeda(faltaPagarSemana);
  const elSobraSemana = document.getElementById('sobraSemana');
  elSobraSemana.textContent = formatarMoeda(sobraSemana);
  elSobraSemana.closest('.resumo-item').classList.toggle('negativo', sobraSemana < 0);
}

// ===== Meta de economia =====
// Compara a sobra do MÊS ATUAL (mesmo cálculo do Resumo do mês) com o
// valor que a pessoa disse que quer guardar por mês.
function renderMetaEconomia() {
  const meta = Number(dados.metaEconomia) || 0;
  const wrapProgresso = document.getElementById('metaProgressoWrap');
  const avisoSemValor = document.getElementById('metaSemValor');

  if (meta <= 0) {
    wrapProgresso.style.display = 'none';
    avisoSemValor.style.display = 'block';
    return;
  }
  avisoSemValor.style.display = 'none';
  wrapProgresso.style.display = 'block';

  const totalContas = somarMoeda(dados.contas, c => c.valor);
  const gastosAvulsos = totalGastosAvulsosDoMes();
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const totalSaidas = Math.round(totalContas * 100) + Math.round(gastosAvulsos * 100);
  const sobra = (Math.round((salario + diarias) * 100) - totalSaidas) / 100;

  const progresso = sobra <= 0 ? 0 : Math.min(100, (sobra / meta) * 100);
  const barra = document.getElementById('metaBarraPreenchida');
  barra.style.width = progresso.toFixed(1) + '%';
  barra.classList.toggle('batida', sobra >= meta);

  const texto = document.getElementById('metaProgressoTexto');
  if (sobra <= 0) {
    texto.textContent = `Ainda não há sobra este mês (meta: ${formatarMoeda(meta)}).`;
  } else if (sobra >= meta) {
    texto.textContent = `Meta batida! ${formatarMoeda(sobra)} de ${formatarMoeda(meta)}.`;
  } else {
    texto.textContent = `${formatarMoeda(sobra)} de ${formatarMoeda(meta)} (${progresso.toFixed(0)}%).`;
  }
}

// ===== Resumo do mês =====
function renderResumo() {
  const totalContas = somarMoeda(dados.contas, c => c.valor);
  const faltaPagar = somarMoeda(dados.contas.filter(c => c.status === 'Pendente'), c => c.valor);
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const gastosAvulsos = totalGastosAvulsosDoMes();
  const totalReceber = somarMoeda([{ v: salario }, { v: diarias }], i => i.v);
  // "Sobra" usa o TOTAL das contas (pagas + pendentes), não só as pendentes,
  // e agora também desconta os gastos avulsos do mês. Uma conta paga já
  // saiu do bolso — marcar como "Pago" é só um controle de status, não deve
  // fazer esse dinheiro "voltar" para o valor que sobra. Quem muda com o
  // status é só o "Falta pagar" (acima).
  // A subtração final também passa por centavos inteiros (mesma razão do
  // somarMoeda: evitar que 0.1 + 0.2 vire 0.30000000000000004 na tela).
  const totalSaidas = Math.round(totalContas * 100) + Math.round(gastosAvulsos * 100);
  const sobra = (Math.round(totalReceber * 100) - totalSaidas) / 100;

  document.getElementById('totalDiarias').textContent = formatarMoeda(diarias);
  document.getElementById('totalContas').textContent = formatarMoeda(totalContas);
  document.getElementById('faltaPagar').textContent = formatarMoeda(faltaPagar);
  document.getElementById('gastosAvulsosResumo').textContent = formatarMoeda(gastosAvulsos);
  const elSobra = document.getElementById('sobra');
  elSobra.textContent = formatarMoeda(sobra);
  // Fica vermelho quando o orçamento estoura (sobra negativa) — assim
  // dá pra ver de longe que algo precisa de atenção, sem ler o número.
  elSobra.closest('.resumo-item').classList.toggle('negativo', sobra < 0);
  document.getElementById('totalGeralRodape').textContent = formatarMoeda(totalContas);
  renderResumoCategorias();
  renderGrafico();
  renderResumoSemanal();
  renderMetaEconomia();
  renderGastosAvulsos();
}

// ===== Gráfico: entradas vs. gastos vs. sobra =====
// Barras simples, na mesma linguagem visual do resumo por categoria.
// Não usa nenhuma biblioteca de gráficos — é só HTML/CSS com a largura da
// barra calculada em proporção ao maior valor dos três.
function renderGrafico() {
  const totalContas = somarMoeda(dados.contas, c => c.valor);
  const gastosAvulsos = totalGastosAvulsosDoMes();
  const totalGastos = (Math.round(totalContas * 100) + Math.round(gastosAvulsos * 100)) / 100;
  const diarias = totalDiarias();
  const salario = Number(dados.salario) || 0;
  const entradas = Math.round((salario + diarias) * 100) / 100;
  const sobra = (Math.round(entradas * 100) - Math.round(totalGastos * 100)) / 100;

  const container = document.getElementById('graficoResumo');
  const aviso = document.getElementById('avisoGraficoVazio');

  if (entradas === 0 && totalGastos === 0) {
    container.innerHTML = '';
    aviso.style.display = 'block';
    return;
  }
  aviso.style.display = 'none';

  const maior = Math.max(entradas, totalGastos, Math.abs(sobra), 1);
  const linhas = [
    { label: 'Entradas', valor: entradas, classe: 'graf-entradas' },
    { label: 'Gastos', valor: totalGastos, classe: 'graf-gastos' },
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

// Abrevia o mês pro rótulo do eixo do gráfico de evolução — usa ano/mes
// numéricos quando existem (registros feitos depois que esses campos
// passaram a ser salvos); cai pro texto completo do mesLabel como reserva
// pra registros mais antigos, que não têm esses números guardados.
function abreviarMes(mes) {
  if (Number.isInteger(mes.ano) && Number.isInteger(mes.mes)) {
    return capitalizarPrimeira(new Date(mes.ano, mes.mes, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''));
  }
  return (mes.mesLabel || '?').slice(0, 3);
}

// Gráfico de linha mostrando como a "sobra" (o que sobra depois das contas)
// mudou de um mês fechado pro outro. Recebe os meses já em ordem
// cronológica (mais antigo primeiro — o oposto da ordem que o histórico
// guarda, que é "mais recente primeiro").
function construirGraficoEvolucao(meses) {
  if (meses.length === 0) return '';
  const largura = 300, altura = 110;
  const margemEsq = 6, margemDir = 6, margemTopo = 10, margemBaixo = 20;
  const areaLargura = largura - margemEsq - margemDir;
  const areaAltura = altura - margemTopo - margemBaixo;

  const valores = meses.map(m => m.sobra);
  // O eixo sempre inclui o zero — é a linha de referência "nem sobrou nem
  // faltou", sem ela não dá pra saber de relance se um mês foi bom ou ruim.
  const maxVal = Math.max(0, ...valores);
  const minVal = Math.min(0, ...valores);
  const faixa = (maxVal - minVal) || 1; // evita dividir por zero se todo mundo empatar em 0

  const coordX = (i) => margemEsq + (meses.length === 1 ? areaLargura / 2 : (i / (meses.length - 1)) * areaLargura);
  const coordY = (v) => margemTopo + areaAltura - ((v - minVal) / faixa) * areaAltura;
  const yZero = coordY(0);

  const linhaZero = `<line x1="${margemEsq}" y1="${yZero.toFixed(1)}" x2="${largura - margemDir}" y2="${yZero.toFixed(1)}" stroke="var(--borda)" stroke-width="1" stroke-dasharray="3,3"></line>`;

  const pontosLinha = meses.map((m, i) => `${coordX(i).toFixed(1)},${coordY(m.sobra).toFixed(1)}`).join(' ');
  const linha = meses.length > 1
    ? `<polyline points="${pontosLinha}" fill="none" stroke="var(--azul)" stroke-width="2"></polyline>`
    : '';

  const pontos = meses.map((m, i) => {
    const cor = m.sobra >= 0 ? 'var(--verde-texto)' : 'var(--perigo)';
    const x = coordX(i), y = coordY(m.sobra);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${cor}"><title>${escaparHTML(m.mesLabel)}: ${formatarMoeda(m.sobra)}</title></circle>` +
      `<text x="${x.toFixed(1)}" y="${altura - 4}" font-size="9" fill="var(--texto-terciario)" text-anchor="middle">${escaparHTML(abreviarMes(m))}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${largura} ${altura}" width="100%" height="${altura}" role="img" aria-label="Gráfico de evolução da sobra mês a mês">${linhaZero}${linha}${pontos}</svg>`;
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

// ===== Duplicar mês inteiro =====
// Diferente de "Fechar mês": isso NÃO arquiva nada no histórico e NÃO mexe
// nas contas atuais — só cria uma cópia de cada uma, com vencimento um mês
// à frente, pendente de pagamento. Serve pra já deixar as contas fixas do
// mês seguinte prontas (aluguel, internet, etc.) sem esperar fechar o
// mês atual — os dois conjuntos ficam juntos na mesma lista, separados
// naturalmente pela ordenação por vencimento.
async function duplicarMes() {
  if (dados.contas.length === 0) {
    await alertarModal('Não há contas cadastradas para duplicar.');
    return;
  }

  // Contas parceladas já avançam sozinhas quando o mês é fechado (a parcela
  // sobe, o vencimento avança). Duplicar elas aqui também criaria uma
  // segunda cópia competindo pelo mesmo contador de parcelas — melhor
  // deixar de fora e avisar, do que confundir "3/10" com duas contas
  // diferentes tentando ser a mesma parcela.
  const contasParaDuplicar = dados.contas.filter(c => !c.parcela);
  const quantasParceladasForamPuladas = dados.contas.length - contasParaDuplicar.length;

  if (contasParaDuplicar.length === 0) {
    await alertarModal('Todas as contas atuais são parceladas — elas já avançam sozinhas ao fechar o mês, não precisam ser duplicadas.');
    return;
  }

  const avisoParceladas = quantasParceladasForamPuladas > 0
    ? `\n\n${quantasParceladasForamPuladas} conta(s) parcelada(s) foram deixadas de fora — elas já avançam sozinhas ao fechar o mês.`
    : '';
  const confirmar = await confirmarModal({
    titulo: 'Duplicar mês?',
    mensagem: `Isso cria uma cópia de ${contasParaDuplicar.length} conta(s), com vencimento um mês à frente e status "Pendente". As contas de hoje continuam exatamente como estão — nada é fechado nem arquivado.${avisoParceladas}\n\nSe já duplicou este mês antes, duplicar de novo cria contas repetidas.`,
    textoConfirmar: 'Duplicar'
  });
  if (!confirmar) return;

  const copias = contasParaDuplicar.map(conta => ({
    nome: conta.nome,
    valor: conta.valor,
    categoria: conta.categoria,
    status: 'Pendente',
    vencimento: conta.vencimento ? avancarUmMes(conta.vencimento) : '',
    parcela: null
  }));
  dados.contas.push(...copias);

  salvar();
  renderContas();
  renderResumo();
  renderCalendario();
  await alertarModal(`${copias.length} conta(s) duplicada(s) com sucesso.`);
}
document.getElementById('btnDuplicarMes').addEventListener('click', duplicarMes);

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

  // Contas parceladas avançam a parcela sozinhas aqui. Quando a parcela que
  // está sendo fechada agora É a última (atual === total), a conta não
  // volta pro mês seguinte — o parcelamento acabou, ela sai da lista.
  // Guardamos os nomes só pra avisar a pessoa no final.
  const parceladasConcluidas = [];
  dados.contas = dados.contas.filter(conta => {
    if (conta.parcela) {
      if (conta.parcela.atual >= conta.parcela.total) {
        parceladasConcluidas.push(conta.nome && conta.nome.trim() ? conta.nome : 'Conta parcelada');
        return false;
      }
      conta.parcela = { atual: conta.parcela.atual + 1, total: conta.parcela.total };
    }
    conta.status = 'Pendente';
    if (conta.vencimento) conta.vencimento = avancarUmMes(conta.vencimento);
    return true;
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
    fb.storeMod.setDoc(fb.storeMod.doc(fb.db, 'usuarios', uid, 'perfis', perfisInfo.ativo, 'backupsMensais', chave), registroDoMes)
      .catch(e => console.error('Não foi possível enviar o backup mensal para a nuvem:', e));
  }

  const avisoConcluidas = parceladasConcluidas.length > 0
    ? `\n\nParcelamento concluído: ${parceladasConcluidas.join(', ')}.`
    : '';
  await alertarModal(`Mês fechado! As contas estão prontas para o próximo mês.${avisoConcluidas}`);
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

  // O gráfico usa os mesmos meses do filtro acima, só que em ordem
  // cronológica (o histórico normal mostra mais recente primeiro; o
  // gráfico de evolução precisa do mais antigo primeiro, senão o tempo
  // andaria "de trás pra frente" da esquerda pra direita). Limitado aos
  // últimos 12 pontos pra não virar uma linha espremida e ilegível se a
  // pessoa acumular anos de histórico.
  const graficoContainer = document.getElementById('graficoEvolucao');
  const mesesParaGrafico = [...historico].reverse().slice(-12);
  graficoContainer.innerHTML = mesesParaGrafico.length > 0
    ? '<div class="resumo-categorias-titulo">Evolução da sobra</div>' + construirGraficoEvolucao(mesesParaGrafico)
    : '';

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
document.getElementById('metaEconomia').addEventListener('input', e => {
  aplicarMascaraMoeda(e.target);
  dados.metaEconomia = lerMoeda(e.target.value);
  salvar(); renderMetaEconomia();
});
document.getElementById('btnAddConta').addEventListener('click', () => {
  dados.contas.push({ nome: '', valor: 0, status: 'Pendente', vencimento: '', categoria: '', parcela: null });
  salvar(); renderContas(); renderResumo();
  const linhas = document.querySelectorAll('#tabelaContas tr');
  const ultimaLinha = linhas[linhas.length - 1];
  if (ultimaLinha) {
    const primeiroInput = ultimaLinha.querySelector('input[type="text"]');
    if (primeiroInput) primeiroInput.focus();
  }
});

document.getElementById('gastoAvulsoValor').addEventListener('input', e => aplicarMascaraMoeda(e.target));

document.getElementById('btnAddGastoAvulso').addEventListener('click', async () => {
  const descricaoEl = document.getElementById('gastoAvulsoDescricao');
  const valorEl = document.getElementById('gastoAvulsoValor');
  const dataEl = document.getElementById('gastoAvulsoData');

  const valor = lerMoeda(valorEl.value);
  if (valor <= 0) {
    await alertarModal('Digite um valor maior que zero para o gasto.');
    return;
  }

  dados.gastosAvulsos.push({
    descricao: descricaoEl.value.trim(),
    valor,
    data: dataEl.value || new Date().toISOString().slice(0, 10)
  });
  salvar();

  descricaoEl.value = '';
  valorEl.value = '';
  renderResumo();
  descricaoEl.focus();
});

document.getElementById('ordenarContas').addEventListener('change', e => {
  dados.ordenarContasPor = e.target.value;
  salvar();
  renderContas();
});

document.getElementById('buscaContas').addEventListener('input', e => {
  termoBuscaContas = e.target.value;
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
    // Liga a transição suave só por um instante, só pra essa troca ativa —
    // ver explicação completa no CSS, perto de ".tema-transicionando".
    document.documentElement.classList.add('tema-transicionando');
    dados.tema = tema;
    aplicarTema();
    salvar();
    setTimeout(() => document.documentElement.classList.remove('tema-transicionando'), 300);
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
    input.className = 'campo-valor-mono';
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
    // Cada perfil sincroniza com seu PRÓPRIO documento na nuvem — só o
    // perfil ativo agora, no momento do login. Perfis locais que nunca
    // foram abertos enquanto logado não têm cópia na nuvem ainda; isso só
    // acontece na primeira vez que a pessoa trocar pra eles estando logada.
    const ref = fb.storeMod.doc(fb.db, 'usuarios', user.uid, 'perfis', perfisInfo.ativo);
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
        dados = Object.assign(dadosPadraoNovoPerfil(), dadosNuvem);
        localStorage.setItem(chaveStorageDoPerfil(perfisInfo.ativo), JSON.stringify(dados));
        aplicarDadosNaTela();
      } else {
        await fb.storeMod.setDoc(ref, dados);
      }
    } else {
      // Primeira vez desse usuário/perfil: sobe o que já existe neste aparelho.
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
  preencherCampoNumerico('metaEconomia', dados.metaEconomia);
  document.getElementById('ordenarContas').value = dados.ordenarContasPor || 'vencimento';
  document.getElementById('gastoAvulsoData').value = new Date().toISOString().slice(0, 10);
  atualizarBotaoPin();
  renderContas();
  renderCalendario();
  renderResumo();
}

function iniciar() {
  carregarInfoPerfis();
  atualizarSeletorPerfis();
  carregar();
  aplicarDadosNaTela();
  // Cobre a tela com o pedido de PIN o quanto antes, se tiver um
  // configurado — mas depois de aplicarDadosNaTela(), já que precisamos
  // saber se dados.pinHash existe (e isso só vem de carregar()).
  verificarBloqueioInicial();
  // Onboarding só na primeira abertura. Se também tiver PIN configurado,
  // a tela de bloqueio (z-index maior) fica por cima até a pessoa
  // desbloquear — depois disso, o onboarding já está logo atrás, visível.
  if (!dados.onboardingVisto) abrirOnboarding();

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
    // Promise pra resolver) — mesma coisa pro modalPin. A tela de bloqueio
    // NUNCA pode fechar com Esc, senão o PIN não bloqueia nada de verdade.
    document.querySelectorAll('.modal-fundo.aberto').forEach(modal => {
      if (modal.id !== 'modalConfirmacao' && modal.id !== 'modalPin' && modal.id !== 'telaBloqueio') {
        modal.classList.remove('aberto');
      }
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