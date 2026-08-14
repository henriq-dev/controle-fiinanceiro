/* ===== Variáveis de tema (claro/escuro) ===== */
:root, [data-theme="light"] {
  --azul: #1f4e78;
  --azul-claro: #d9e1f2;
  --azul-texto-forte: #1f4e78;
  --teal: #2ea88a;
  --verde: #c6efce;
  --verde-texto: #1e6b30;
  --vermelho: #ffc7ce;
  --vermelho-texto: #9e1b2a;
  --cinza: #f4f5f7;
  --borda: #dcdfe4;
  --card-bg: #ffffff;
  --texto: #222222;
  --texto-secundario: #666666;
  --texto-terciario: #888888;
  --hover-bg: #fafafa;
  --botao-texto: #ffffff;
  --perigo: #b00020;
  color-scheme: light;
}

[data-theme="dark"] {
  --azul: #4f8fc0;
  --azul-claro: #24344a;
  --azul-texto-forte: #7fb8e6;
  --teal: #45c9a5;
  --verde: #1f4a2c;
  --verde-texto: #7ddb92;
  --vermelho: #4a1f26;
  --vermelho-texto: #ff8fa3;
  --cinza: #14181f;
  --borda: #333b47;
  --card-bg: #1e242e;
  --texto: #e8eaed;
  --texto-secundario: #9aa0a8;
  --texto-terciario: #7a828c;
  --hover-bg: #262c38;
  --botao-texto: #ffffff;
  --perigo: #ff6b81;
  color-scheme: dark;
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

body {
  font-family: -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
  background: var(--cinza);
  margin: 0;
  padding: 20px;
  color: var(--texto);
  transition: background 0.2s, color 0.2s;
}

/* iOS Safari faz zoom automático em campos com fonte abaixo de 16px.
   Forçamos 16px em todos os campos para o foco nunca disparar o zoom. */
input, select {
  font-size: 16px !important;
  touch-action: manipulation;
}
input::placeholder {
  color: var(--texto-terciario);
  opacity: 1;
}

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}

.container {
  max-width: 720px;
  margin: 0 auto;
}

/* ===== Cabeçalho / marca ===== */
.topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 20px;
}

.marca {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}

h1 {
  color: var(--azul);
  font-size: 21px;
  margin: 0 0 2px 0;
  letter-spacing: -0.01em;
}

.subtitulo {
  color: var(--texto-secundario);
  font-size: 12.5px;
  margin: 0;
}

.botoes-topo {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-icone {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--borda);
  background: var(--card-bg);
  color: var(--texto);
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  touch-action: manipulation;
}
.btn-icone:active { background: var(--hover-bg); }

.card {
  background: var(--card-bg);
  border: 1px solid var(--borda);
  border-radius: 12px;
  padding: 16px 18px;
  margin-bottom: 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: background 0.2s, border-color 0.2s;
}

.card h2 {
  font-size: 15px;
  color: var(--azul);
  margin: 0 0 12px 0;
  border-bottom: 2px solid var(--azul-claro);
  padding-bottom: 8px;
}

/* ===== Resumo ===== */
.resumo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.resumo-item {
  background: var(--cinza);
  border-radius: 8px;
  padding: 10px 12px;
}
.resumo-item label {
  display: block;
  font-size: 11px;
  color: var(--texto-secundario);
  margin-bottom: 4px;
}
.resumo-item .valor {
  font-size: 17px;
  font-weight: bold;
  color: var(--texto);
}
.resumo-item.destaque {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, var(--azul-claro), var(--azul-claro) 60%, color-mix(in srgb, var(--teal) 25%, var(--azul-claro)));
}
.resumo-item.destaque .valor {
  color: var(--azul-texto-forte);
  font-size: 22px;
}
/* Quando o que sobra fica negativo, troca o degradê azul por um aviso vermelho */
.resumo-item.destaque.negativo {
  background: var(--vermelho);
}
.resumo-item.destaque.negativo .valor {
  color: var(--vermelho-texto);
}
.resumo-item input[type="number"] {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 17px !important;
  font-weight: bold;
  font-family: inherit;
  color: var(--texto);
  padding: 0;
}

/* ===== Tabela de contas ===== */
.table-scroll {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
table {
  width: 100%;
  min-width: 320px;
  border-collapse: collapse;
  font-size: 13px;
}
th:nth-child(1), td:nth-child(1) { min-width: 90px; }
th:nth-child(2), td:nth-child(2) { min-width: 70px; }
th:nth-child(3), td:nth-child(3) { min-width: 110px; }
th:nth-child(4), td:nth-child(4) { min-width: 118px; }
th:nth-child(5), td:nth-child(5) { min-width: 108px; }
th:nth-child(6), td:nth-child(6) { width: 58px; }
th {
  background: var(--azul);
  color: white;
  text-align: left;
  padding: 8px 6px;
  font-size: 12px;
}
td {
  padding: 6px;
  border-bottom: 1px solid var(--borda);
}
td input[type="text"], td input[type="number"] {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: var(--texto);
  font-family: inherit;
  font-size: 13px;
  padding: 4px;
  border-radius: 4px;
}
td input[type="text"]:hover, td input[type="number"]:hover,
td input[type="text"]:focus, td input[type="number"]:focus {
  border-color: var(--borda);
  background: var(--hover-bg);
}
select.status {
  width: 100%;
  padding: 4px;
  border-radius: 4px;
  border: 1px solid var(--borda);
  font-family: inherit;
  font-size: 12px;
}
select.status.pago { background: var(--verde); color: var(--verde-texto); }
select.status.pendente { background: var(--vermelho); color: var(--vermelho-texto); }

/* ===== Categoria ===== */
.categoria-select {
  width: 100%;
  padding: 4px;
  border-radius: 4px;
  border: 1px solid var(--borda);
  font-family: inherit;
  font-size: 12px;
  background: var(--cinza);
  color: var(--texto);
}
.categoria-select[data-categoria="Moradia"] { border-left: 4px solid #4c78d9; }
.categoria-select[data-categoria="Transporte"] { border-left: 4px solid #9b6bd6; }
.categoria-select[data-categoria="Alimentação"] { border-left: 4px solid #e08a2c; }
.categoria-select[data-categoria="Saúde"] { border-left: 4px solid #e05c6f; }
.categoria-select[data-categoria="Lazer"] { border-left: 4px solid #3aa65c; }
.categoria-select[data-categoria="Educação"] { border-left: 4px solid #2ea8a8; }
.categoria-select[data-categoria="Outros"] { border-left: 4px solid #999999; }

/* ===== Vencimento ===== */
.venc-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
}
.venc-wrap input[type="date"] {
  width: 100%;
  min-width: 0;
}
.venc-bolinha {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
}
.venc-bolinha.atrasada { background: var(--perigo); }
.venc-bolinha.proxima { background: #d99a1b; }

.acoes-conta {
  display: flex;
  gap: 2px;
}

.btn-remover {
  background: none;
  border: none;
  color: var(--perigo);
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  min-width: 34px;
  min-height: 40px;
  touch-action: manipulation;
}

.btn-duplicar {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  line-height: 1;
  min-width: 34px;
  min-height: 40px;
  touch-action: manipulation;
  opacity: 0.75;
}
.btn-duplicar:hover, .btn-duplicar:active { opacity: 1; }

.vazio-aviso {
  font-size: 13px;
  color: var(--texto-terciario);
  text-align: center;
  padding: 14px 6px;
  margin: 0;
}

.btn-add {
  margin-top: 10px;
  background: var(--azul);
  color: var(--botao-texto);
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  min-height: 44px;
  touch-action: manipulation;
}
.btn-add:hover, .btn-add:active { opacity: 0.85; }

.btn-secundario {
  margin-top: 10px;
  background: transparent;
  color: var(--azul-texto-forte);
  border: 1px solid var(--borda);
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  min-height: 44px;
  touch-action: manipulation;
}
.btn-secundario:hover, .btn-secundario:active { background: var(--hover-bg); }

.linha-total {
  display: flex;
  justify-content: space-between;
  padding-top: 10px;
  margin-top: 6px;
  border-top: 2px solid var(--azul-claro);
  font-size: 13px;
}
.linha-total span:last-child { font-weight: bold; }

.acoes-mes {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.acoes-mes .btn-secundario {
  flex: 1;
  margin-top: 0;
  font-size: 13px;
  padding: 10px 8px;
}

/* ===== Resumo por categoria ===== */
.resumo-categorias {
  margin-top: 14px;
}
.resumo-categorias-titulo {
  font-size: 12px;
  font-weight: bold;
  color: var(--texto-secundario);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}
.cat-barra-linha {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}
.cat-barra-label {
  width: 78px;
  flex-shrink: 0;
  color: var(--texto-secundario);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cat-barra-trilho {
  flex: 1;
  background: var(--cinza);
  border-radius: 4px;
  height: 10px;
  overflow: hidden;
}
.cat-barra-preenchida {
  height: 100%;
  border-radius: 4px;
  min-width: 3px;
  background: #999999;
}
.cat-barra-preenchida[data-categoria="Moradia"] { background: #4c78d9; }
.cat-barra-preenchida[data-categoria="Transporte"] { background: #9b6bd6; }
.cat-barra-preenchida[data-categoria="Alimentação"] { background: #e08a2c; }
.cat-barra-preenchida[data-categoria="Saúde"] { background: #e05c6f; }
.cat-barra-preenchida[data-categoria="Lazer"] { background: #3aa65c; }
.cat-barra-preenchida[data-categoria="Educação"] { background: #2ea8a8; }
.cat-barra-valor {
  width: 68px;
  flex-shrink: 0;
  text-align: right;
  color: var(--texto);
  font-weight: 600;
}

/* ===== Gráfico: entradas vs. gastos vs. sobra ===== */
.graf-barra-linha {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.graf-barra-linha:last-child { margin-bottom: 0; }
.graf-barra-label {
  width: 64px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--texto-secundario);
}
.graf-barra-trilho {
  flex: 1;
  background: var(--cinza);
  border-radius: 6px;
  height: 16px;
  overflow: hidden;
}
.graf-barra-preenchida {
  height: 100%;
  border-radius: 6px;
  min-width: 3px;
  transition: width 0.2s;
}
.graf-entradas { background: var(--teal); }
.graf-gastos { background: var(--perigo); }
.graf-sobra { background: var(--azul); }
.graf-sobra-negativa { background: var(--perigo); }
.graf-barra-valor {
  width: 84px;
  flex-shrink: 0;
  text-align: right;
  font-size: 13px;
  font-weight: bold;
  color: var(--texto);
}

.item-historico {
  border: 1px solid var(--borda);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.item-historico strong {
  display: block;
  color: var(--azul-texto-forte);
  margin-bottom: 6px;
}
.item-historico-linha {
  display: flex;
  justify-content: space-between;
  color: var(--texto-secundario);
  padding: 2px 0;
}
.item-historico-linha span:last-child {
  color: var(--texto);
  font-weight: 600;
}

/* ===== Diárias ===== */
.diaria-config {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.diaria-config label {
  font-size: 11px;
  color: var(--texto-secundario);
  display: block;
  margin-bottom: 4px;
}
.diaria-config input {
  width: 100%;
  padding: 6px;
  border: 1px solid var(--borda);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  background: var(--card-bg);
  color: var(--texto);
}

.calendario-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 10px;
}
.rotulo-mes {
  font-size: 14px;
  font-weight: bold;
  color: var(--texto);
  min-width: 130px;
  text-align: center;
}

.calendario {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
}
.cal-cabecalho {
  text-align: center;
  font-size: 11px;
  color: var(--texto-secundario);
  font-weight: bold;
  padding-bottom: 2px;
}
.dia {
  aspect-ratio: 1;
  min-height: 40px;
  border: 1px solid var(--borda);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  background: var(--card-bg);
  color: var(--texto);
  transition: background 0.15s;
  touch-action: manipulation;
}
.dia:active { background: var(--azul-claro); }
.dia .num { font-weight: bold; }
.dia .val { font-size: 9px; color: var(--texto-terciario); }
.dia.trabalhado {
  background: var(--verde);
  border-color: #7dc98a;
}
.dia.trabalhado .val { color: var(--verde-texto); }
/* Dia de hoje: contorno azul sempre visível, mesmo se também estiver
   marcado como "trabalhado" (as duas classes convivem). */
.dia.hoje {
  border: 2px solid var(--azul);
  font-weight: bold;
}
.dia.hoje .num { color: var(--azul-texto-forte); }
.dia.vazio { visibility: hidden; cursor: default; }
/* Dia com valor personalizado (diferente do padrão do dia da semana):
   pontinho no canto, discreto, não compete com o destaque de "hoje". */
.dia.personalizado { position: relative; }
.dia.personalizado::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--teal);
}

.status-save {
  font-size: 11px;
  color: var(--texto-terciario);
  text-align: right;
  margin-top: 8px;
  margin-bottom: 0;
  min-height: 14px;
}

/* Telas estreitas (iPhone SE ~320-375px, Android compactos) */
@media (max-width: 400px) {
  body { padding: 10px; }
  .card { padding: 12px; }
  .resumo-grid { gap: 8px; }
  .calendario { gap: 3px; }
  .diaria-config { gap: 6px; }
  h1 { font-size: 18px; }
  .logo { width: 38px; height: 38px; }
  .resumo-item .valor { font-size: 15px; }
  .resumo-item.destaque .valor { font-size: 19px; }
}

/* Telas maiores (tablet/desktop): calendário não precisa esticar tanto */
@media (min-width: 600px) {
  .dia { font-size: 13px; }
  .dia .val { font-size: 10px; }
}

/* ===== Modal de instalação ===== */
.modal-fundo {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 100;
  align-items: flex-end;
  justify-content: center;
}
.modal-fundo.aberto { display: flex; }
.modal-caixa {
  background: var(--card-bg);
  color: var(--texto);
  width: 100%;
  max-width: 480px;
  border-radius: 16px 16px 0 0;
  padding: 20px;
  max-height: 85vh;
  overflow-y: auto;
}
@media (min-width: 600px) {
  .modal-fundo { align-items: center; }
  .modal-caixa { border-radius: 16px; }
}
.modal-titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: bold;
  color: var(--azul-texto-forte);
  margin-bottom: 10px;
}
.modal-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
.modal-texto {
  font-size: 13px;
  color: var(--texto-secundario);
  margin-bottom: 16px;
  line-height: 1.5;
}
.modal-secao {
  margin-bottom: 16px;
  font-size: 14px;
}
.modal-secao ol {
  margin: 8px 0 0 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--texto);
  line-height: 1.6;
}

/* ===== Modal: ajustar valor de dias específicos ===== */
.linha-dia-editar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--borda);
}
.linha-dia-label {
  flex: 1;
  font-size: 13px;
  color: var(--texto);
  text-transform: capitalize;
}
.linha-dia-editar input[type="number"] {
  width: 90px;
  padding: 6px 8px;
  border: 1px solid var(--borda);
  border-radius: 6px;
  font-family: inherit;
  background: var(--card-bg);
  color: var(--texto);
}
.btn-reset-dia {
  background: none;
  border: 1px solid var(--borda);
  color: var(--texto-secundario);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
  cursor: pointer;
  touch-action: manipulation;
}
.btn-reset-dia:hover, .btn-reset-dia:active { background: var(--hover-bg); }