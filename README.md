# Intranet Municipal — Gestão Pitangueiras

Este é o repositório principal do código-fonte da Intranet Municipal. A aplicação é composta por páginas estáticas HTML, CSS e JavaScript, e utiliza Supabase para autenticação e dados.

## Publicação

- Branch principal: `main`.
- GitHub Pages de produção: `https://municipiopitangueiraspr-arch.github.io/intranetpref/`.
- O repositório `gestao-atas` será preservado como cópia de segurança/ambiente legado; não apagar seu histórico.

## Estrutura e segurança

- A identidade visual e os estilos compartilhados ficam em `shared/css/intranet-global.css`.
- A inicialização do Supabase fica centralizada em `shared/js/supabase.js`.
- Não versionar service-role keys, tokens, senhas ou credenciais administrativas. Use somente a chave publicável necessária ao cliente web.
- Os redirects de autenticação devem permanecer limitados às rotas oficiais deste Pages e configurados no Supabase em Authentication → URL Configuration.
