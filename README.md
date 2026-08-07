# controle-fiinanceiro
O **Controle Financeiro** é o app que construímos agora há pouco — um PWA (Progressive Web App) 100% vanilla (HTML, CSS e JS puro, sem frameworks) para organizar as finanças do mês. Aqui vai um resumo do que ele faz:

**Propósito**
Ajudar a visualizar, num único lugar, quanto vai entrar (salário + diárias) e quanto vai sair (contas), pra saber o que sobra no fim do mês.

**Funcionalidades**
- **Resumo do mês**: salário fixo, diárias recebidas, total de contas, quanto falta pagar e o que vai sobrar — tudo calculado automaticamente.
- **Contas**: lista editável (nome, valor, status Pago/Pendente), começa vazia pra cada pessoa montar do seu jeito.
- **Diárias por calendário**: você define o valor pago em dias de semana, sábado e domingo, e marca no calendário quais dias trabalhou — o app soma sozinho.
- **Tema claro/escuro**, com detecção automática da preferência do sistema.
- **Instalável como app de verdade**: manifest.json + service worker, com ícone e logo próprios (a moedinha "R$").
- **Card de compartilhamento**: quando manda o link no zap, aparece com imagem, título e descrição.

**Como guarda os dados**
Tudo fica salvo só no navegador de quem está usando (`localStorage`) — não existe servidor nem banco de dados por trás. Ou seja, cada pessoa que abrir o link tem sua própria lista de contas, privada, sem ver ou interferir na de ninguém.

Se quiser, posso escrever um `README.md` explicando isso pra quem for usar ou receber o projeto.
