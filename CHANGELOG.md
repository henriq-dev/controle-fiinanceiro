# Changelog — Controle Financeiro

Site: https://controle-fiinanceiro.vercel.app/
Repositório: GitHub (controle-fiinanceiro)

## ✅ v1.0.0 — Versão base
- App em HTML/CSS/JS puro, sem contas de exemplo (cada pessoa começa com lista vazia)
- Dados salvos em `localStorage` (privado por navegador/aparelho)
- Instalável como PWA (manifest, service worker, ícones, logo)
- Preview ao compartilhar no WhatsApp (Open Graph + og-image.png)
- Correção: "O que vai sobrar" usa o TOTAL das contas (pagas + pendentes), não só as pendentes — marcar como "Pago" não altera mais esse valor

## ✅ v1.1.0 — Ajustes rápidos
1. "Sobra" fica **vermelha** quando o valor é negativo
2. Dia de **hoje destacado** no calendário (contorno azul), atualiza sozinho após meia-noite
3. Campos numéricos **começam vazios** (usam `placeholder`, não `value="0"`)
4. Botão de **duplicar conta** (ícone 📋 ao lado do ✕)

## ✅ v1.2.0 — Completa
1. **Data de vencimento nas contas**
   - Novo campo de data por conta
   - Lista reordena sozinha (mais próximas de vencer primeiro)
   - Bolinha vermelha = atrasada, laranja = vence em até 3 dias
   - Some o alerta quando a conta é marcada como "Pago"
2. **Editar o valor de um dia específico da diária**
   - Botão "✏️ Ajustar valor de um dia específico" abaixo do calendário
   - Modal lista os dias trabalhados do mês, com opção de valor customizado
   - Botão "padrão" reseta pro valor normal do dia da semana
   - Bolinha verde-água no calendário indica dia com valor personalizado
3. **Backup local (exportar/importar `.json`)**
   - Botão 💾 no topo abre modal de backup
   - "Baixar backup" gera um `.json` com todos os dados, nomeado com a data
   - "Escolher arquivo de backup" importa e substitui os dados atuais (com confirmação)
   - Protegido contra arquivo inválido (mostra aviso, não quebra o app)

## ✅ v1.3.0 — Completa
1. **Fechar mês**
   - Botão "📁 Fechar mês" arquiva um resumo no histórico e reseta as contas para "Pendente"
   - Vencimentos avançam automaticamente 1 mês
   - Botão "🕓 Histórico" mostra o resumo de cada mês fechado
2. **Categorias nas contas**
   - Dropdown de categoria em cada conta (Moradia, Transporte, Alimentação, Saúde, Lazer, Educação, Outros)
   - Cada categoria tem uma cor própria (borda colorida no dropdown)
   - Resumo "Por categoria" abaixo da lista: barra proporcional + valor, ordenado do maior gasto pro menor
   - Só aparece quando pelo menos uma conta tem categoria definida
   - Categoria é mantida ao duplicar conta e ao fechar o mês
3. **Gráfico visual (Salário vs. gastos vs. sobra)**
   - Card novo, com 3 barras: Entradas (salário + diárias), Gastos (total das contas), Sobra
   - Barra da "Sobra" fica vermelha quando negativa, mesma lógica do card de resumo
   - Atualiza em tempo real, sem precisar recarregar a página
   - Some sozinho quando não há nada preenchido ainda (mostra aviso no lugar)

## 💡 Backlog (ideias, sem versão definida ainda)
- Lembrete de backup: avisar dentro do app quando fizer tempo (~15 dias) desde o último export, pra ajudar usuários leigos que podem esquecer de fazer backup manual

## ✅ v2.0.0 — Completa (login/nuvem)
Feito com **Firebase** (Authentication e/senha + Firestore), testado e funcionando em produção.
- Botão "👤 Conta" no topo: login, criar conta, sair
- Ao logar: sincroniza com o Firestore (pergunta o que fazer se houver dados em ambos os lugares)
- Salvar também manda pra nuvem quando logado, sem travar a digitação
- **Arquitetura importante**: Firebase carrega SOB DEMANDA (não no topo do arquivo) — se não
  houver internet ou o Firebase não responder, o app inteiro continua funcionando normal,
  só sem sincronizar. Erros de login mostram mensagem clara ("verifique sua internet")
  em vez de travar
- Testado: uso sem login (funciona igual antes), login/cadastro, sincronização entre
  navegadores diferentes, app resistente à falta de conexão com o Firebase
- **Banco de dados**: Firestore criado (edição Standard, região southamerica-east1) —
  atenção: no Firebase Console em português, ele aparece com o nome estranho
  "Armazém de incêndio" (tradução literal de "Firestore"). Não confundir com
  "Banco de dados em tempo real" (Realtime Database), que é outro produto e não é usado aqui
- Regras de segurança do Firestore aplicadas e confirmadas (cada pessoa só acessa os
  próprios dados) — documentadas em `FIRESTORE-REGRAS.md`
- Confirmado no Firebase Console: a coleção `usuarios` recebe os documentos com os
  dados sincronizados corretamente (contas, diasTrabalhados, historicoMeses, salario, etc.)

## ✅ v2.1.0 — Auditoria de bugs, acessibilidade e melhorias
Rodada grande de correções e melhorias, a partir de uma auditoria técnica (bugs P0-P2 de aritmética financeira, validação, responsividade e visual) mais uma lista de 30 itens consolidada por urgência/esforço. Tudo continua HTML/CSS/JS puro, sem frameworks nem libs externas.

**Bugs corrigidos:**
- Aritmética monetária agora em centavos inteiros (eliminava erro tipo `0,10 + 0,20 = 0,30000000000000004` no total do mês)
- Vírgula digitada no Android não era mais descartada (campos viraram `type="text"` + `inputmode="decimal"`, já que `type="number"` zerava o valor antes mesmo do JavaScript rodar)
- Avanço de vencimento ao fechar o mês não pula mais meses curtos (31/01 → 28/02, nunca 03/03; testado com ano bissexto)
- `localStorage` protegido contra falha silenciosa (mostra aviso na tela em vez de só logar no console)
- Validação de schema no backup importado (JSON corrompido ou de formato errado não derruba mais o app)
- Sobrescrita de dados entre abas abertas ao mesmo tempo (relê o disco ao voltar pra aba, sem perder edição em andamento)
- Debounce da nuvem separado do debounce local (1,5s vs. 400ms) — antes cada pausa de digitação já disparava uma escrita no Firestore
- `mesLabel` do histórico e categoria das contas protegidos contra injeção de HTML vindo de um backup adulterado

**Segurança e acessibilidade:**
- `confirm()`/`alert()` nativos (suprimidos em alguns PWAs iOS/WebView Android) substituídos por modal customizado próprio, com foco preso, Esc e clique-fora pra fechar
- `aria-live` no indicador de status ("Salvo ✓", avisos de erro) — leitor de tela agora é avisado
- Checagem de "tem dado local pra preservar" ao sincronizar com a nuvem agora considera diárias/histórico, não só contas/salário

**Responsividade e visual:**
- Tabela de contas vira cards empilhados no celular (antes exigia scroll horizontal)
- `viewport-fit=cover` + `env(safe-area-inset-*)` + `dvh` — notch, barra de gestos e barra de URL sumindo/aparecendo
- Todos os emojis de botões/títulos trocados por ícones SVG (herdam a cor do tema automaticamente)
- Cores semânticas de entrada/saída no resumo do mês (verde pro que entra, vermelho pro que sai)
- Máscara de moeda ao vivo nos campos de valor (formata "1.234,56" enquanto digita)

**Novas funcionalidades:**
- **Calendário mostra vencimento de contas**: dia com conta a vencer ganha um indicador (vermelho = pendente, verde = paga); tocar mostra quais contas vencem ali
- Badge no topo avisando quantas contas estão atrasadas ou vencendo nos próximos 3 dias
- Ordenar contas por vencimento, valor ou nome
- Filtro por ano no histórico de meses fechados
- Gráfico de pizza por categoria (SVG puro, mesmas cores do seletor de categoria)
- 3 temas novos além do claro/escuro: **alto contraste** (preto/branco, pra baixa visão) e **noturno amarelado** (tons quentes, sem azul)
- Exportar contas em `.csv` (separado do backup completo em `.json`), com BOM UTF-8 pra acentos não bagunçarem no Excel
- Atalhos de teclado: Ctrl+N (nova conta — só funciona com o app instalado como PWA, navegadores desktop reservam esse atalho pra "nova janela"), Ctrl+B (backup), Esc (fecha modal)
- Vibração curta ao marcar conta como paga e ao fechar o mês (em aparelhos com suporte)
- Backup automático na nuvem a cada fechamento de mês (snapshot separado e imutável, além da sincronização normal)
- Cache offline real no `sw.js` (estratégia "rede primeiro, cache como reserva" — sempre busca a versão mais nova quando online, funciona offline quando não tem internet)

**Backlog restante (não implementado, cada um com uma ressalva):**
- Onboarding guiado na primeira abertura — feature de UI inteira, não um ajuste pontual
- Lembretes push — exige um backend disparando a notificação, não dá só no front
- Fontes customizadas (Sora/Plus Jakarta Sans/IBM Plex Mono) — via Google Fonts seria uma dependência externa; pra manter 100% vanilla, precisaria baixar os `.woff2` e servir local

---

## ✅ v2.2.0 — Novos recursos (segunda leva de sugestões)
A partir de uma segunda lista de 24 sugestões, com o mesmo critério: sem frameworks, sem libs externas.

**Beleza e polimento:**
- Números do resumo maiores e com dígitos alinhados (`font-variant-numeric: tabular-nums`)
- Transição suave (0,25s) ao trocar de tema — ativada só durante a troca em si, não o tempo todo, pra não deixar outras mudanças de cor (ex: "sobra" ficando negativa) lentas sem necessidade
- Animação de entrada nos modais (fade + deslize) e "pop" ao marcar um dia como trabalhado — as duas respeitam `prefers-reduced-motion`

**Ajustes práticos:**
- Botão de marcar a semana inteira do calendário como trabalhada, de um toque
- Busca na lista de contas por nome ou categoria (ignora acento e maiúscula/minúscula)
- Bloqueio por PIN local (4-6 dígitos) — usa a Web Crypto API nativa do navegador (SHA-256) pra guardar só o hash, nunca o PIN em texto puro. É privacidade básica ("alguém pegou meu celular"), não é criptografia de dados de verdade
- Duplicar o mês inteiro de contas com um toque, sem fechar/arquivar o mês atual (diferente do "Fechar mês")

**Novos recursos:**
- **Resumo da semana**: mesma estrutura do resumo mensal, baseado na semana atual (domingo a sábado), inclusive quando ela atravessa a virada de mês
- **Gráfico de evolução da sobra** mês a mês, no histórico (linha SVG, pontos verdes/vermelhos conforme sobrou ou faltou, até 12 meses)
- **Meta de economia**: valor-alvo por mês com barra de progresso, comparada com a sobra do mês atual
- **Gastos avulsos**: despesas do dia a dia (tipo "gastei R$ 40 no lanche"), separadas das contas fixas — funcionam como as diárias (por data, sem "fechar" com o mês) e entram no cálculo da sobra em todos os lugares (resumo, gráfico, meta)

---

## ✅ v2.3.0 — Grande escopo
Os itens que mudavam estrutura de dados ou eram features de UI inteiras, deixados por último de propósito.

- **Contas parceladas**: marca uma conta como "3/10", por exemplo — a cada "Fechar mês" a parcela avança sozinha; quando chega na última, a conta sai da lista (o parcelamento acabou). "Duplicar mês" pula as parceladas de propósito, pra não competir pelo mesmo contador.
- **Onboarding guiado**: 5 passos na primeira abertura (resumo, calendário, contas, fechar mês). Dá pra pular ou rever depois em "Minha conta".
- **Fontes customizadas**: Sora (títulos), Plus Jakarta Sans (corpo) e IBM Plex Mono (números) — baixadas do repositório oficial do Google Fonts no GitHub (licença SIL Open Font License) e servidas localmente na pasta `fonts/`, sem CDN. `sw.js` atualizado pra pré-cachear os `.woff2` também (cache `v1 → v2`).
- **Múltiplos perfis/carteiras**: separa as finanças em carteiras diferentes (ex: "Pessoal" e "Trabalho"), cada uma com suas próprias contas, diárias e histórico. Tema e PIN continuam compartilhados entre perfis (são preferências do aparelho, não da carteira). Migração automática: quem já usava o app antes disso vira o perfil "Pessoal" sozinho. Cada perfil sincroniza pra um documento próprio na nuvem (`usuarios/{uid}/perfis/{nome}`).

**Item que fica de fora, e continua assim:** lembretes push — exige um servidor disparando a notificação, não existe forma de fazer isso só com HTML/CSS/JS no navegador.

---

## Como retomar em uma conversa nova
1. Abra uma conversa nova dentro deste mesmo Projeto (a memória do projeto ajuda a manter o contexto).
2. Se quiser, anexe os arquivos atuais do repositório (`index.html`, `style.css`, `script.js`) pra eu conferir o estado exato.
3. Diga: "Vamos continuar" — o roadmap inteiro (v1.0.0 até v2.3.0) está completo.
   Só falta lembretes push, que exige backend — não é possível em vanilla puro.
   Pergunte o que fazer a seguir: novas ideias, ajustes, ou revisão geral.