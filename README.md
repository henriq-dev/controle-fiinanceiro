# 💰 Controle Financeiro

App simples para organizar as finanças do mês: salário, diárias e contas a pagar — tudo em um só lugar, com o que vai sobrar calculado automaticamente.

Feito em **HTML5, CSS3 e JavaScript puro (Vanilla)** — sem frameworks, sem bibliotecas externas, sem build.

## O que o app faz

- **Resumo do mês**: salário fixo, diárias recebidas, total de contas, quanto falta pagar e o que vai sobrar.
- **Contas**: lista editável com nome, valor e status (Pago/Pendente). Começa vazia — cada pessoa monta a sua.
- **Diárias por calendário**: você define o valor pago em dias de semana, sábado e domingo, e marca no calendário quais dias trabalhou. O total é somado automaticamente.
- **Tema claro/escuro**, com detecção automática da preferência do sistema no primeiro acesso.
- **Instalável como app** (PWA): dá pra adicionar na tela inicial do celular ou instalar no computador, com ícone e nome próprios, funcionando em tela cheia.
- **Preview ao compartilhar**: ao colar o link no WhatsApp/Telegram, aparece um card com imagem, título e descrição.

## Onde os dados ficam salvos

Os dados são salvos com `localStorage`, **direto no navegador de quem está usando** — não existe servidor nem banco de dados por trás.

Isso quer dizer:
- Cada pessoa que abrir o link tem a **sua própria lista de contas**, privada.
- Ninguém vê ou interfere nos dados de outra pessoa, mesmo usando o mesmo link.
- Os dados **não sincronizam entre aparelhos** (celular e computador, por exemplo, têm listas separadas) e **somem se o navegador limpar o cache/dados do site**.

## Estrutura dos arquivos

```
financeiro-app/
├── index.html       → estrutura da página
├── style.css         → todo o visual (cores, layout, tema claro/escuro)
├── script.js         → toda a lógica (cálculos, calendário, salvar/carregar)
├── manifest.json      → configuração do PWA (nome, ícones, cores)
├── sw.js             → service worker (exigido pelo navegador para instalar o app)
├── og-image.png       → imagem que aparece ao compartilhar o link
├── icon-16.png a icon-512.png → ícones do app em vários tamanhos
└── favicon.ico       → ícone da aba do navegador
```

Todos os arquivos precisam ficar juntos, na raiz do site — sem subpastas.

## Como publicar

1. Suba a pasta inteira para **Vercel** ou **Netlify** (arrastar e soltar funciona nos dois).
2. Não precisa de configuração de build — é um site estático puro.
3. Depois de publicado, o botão "📲" no topo do app oferece a instalação (no Android/desktop) ou mostra o passo a passo (no iPhone).

## Como rodar localmente (opcional)

Como o app usa `fetch` no service worker, alguns recursos de instalação só funcionam servindo os arquivos por HTTP (não abrindo o `index.html` direto no navegador). Uma forma simples:

```bash
cd financeiro-app
python3 -m http.server 8000
```

E acessar `http://localhost:8000` no navegador.
