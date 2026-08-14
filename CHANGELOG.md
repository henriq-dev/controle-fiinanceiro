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

## ⬜ v2.0.0 — Planejado (grande mudança)
- Login / salvar na nuvem — precisa de serviço externo (ex: Firebase), foge do "só vanilla". Discutir arquitetura antes de começar.

---

## Como retomar em uma conversa nova
1. Abra uma conversa nova dentro deste mesmo Projeto (a memória do projeto ajuda a manter o contexto).
2. Se quiser, anexe os arquivos atuais do repositório (`index.html`, `style.css`, `script.js`) pra eu conferir o estado exato.
3. Diga: "Vamos continuar" — próxima etapa é a v2.0.0 (login/nuvem), que precisa de uma conversa à parte sobre arquitetura (envolve escolher e configurar um backend externo, ex: Firebase).