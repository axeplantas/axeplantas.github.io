# Arquitetura

Visão técnica para desenvolvedores que forem continuar o projeto.

## Visão geral

```
Celular (web app instalado)                 Supabase (São Paulo)
┌──────────────────────────┐               ┌────────────────────────────────────┐
│ React + Vite (PWA)       │──login/dados─▶│ Postgres + regras de acesso (RLS)  │
│ Leaflet + OpenStreetMap  │──fotos───────▶│ Storage (bucket privado "fotos")   │
│ Service worker:          │               │ Funções (Edge Functions, Deno):    │
│  - cache e atualização   │──foto(s)─────▶│  identificar → Pl@ntNet            │
│  - notificações (push)   │◀──push────────│  notificar  → Web Push             │
│ IndexedDB: pontos        │               │ Gatilhos no banco → fila de avisos │
│  guardados sem internet  │               └────────────────────────────────────┘
└──────────────────────────┘
Hospedagem do app: GitHub Pages (publicação automática a cada mudança na branch main)
```

## Tecnologias
| Parte | Tecnologia |
|---|---|
| Interface | React 19, TypeScript, Vite, react-router (HashRouter) |
| Mapa | Leaflet / react-leaflet, mapas do OpenStreetMap |
| PWA | vite-plugin-pwa (Workbox), `public/push-sw.js` para notificações |
| Dados no aparelho | localStorage (perfil, folhas) e IndexedDB via idb-keyval (pontos guardados) |
| Backend | Supabase: Postgres, Auth (e-mail e senha), Storage, Edge Functions |
| Identificação | Pl@ntNet API v2 (`/v2/identify/all`) |
| Notificações | Web Push (VAPID) com a biblioteca `web-push` na função `notificar` |
| Publicação | GitHub Actions → GitHub Pages |

## Estrutura de pastas
```
src/pages/           telas (Mapa, NovoPonto, Folhas, FolhaDetalhe, Obrigações, Painel, Admin, Perfil…)
src/components/      peças reutilizáveis (SeletorFolha, FotosDaPlanta, IdentificarFolha, Galeria…)
src/lib/             supabase, sessão, tipos, fila sem internet, notificações, atualização, demonstração
supabase/*.sql       banco de dados, na ordem: schema → convites → catalogo-inicial → notificacoes-e-fotos → varias-casas → gestao-da-casa → primeiro-admin
supabase/functions/  funções do servidor (identificar, notificar)
public/              ícones, páginas legais, receptor de notificações
marca/               logo em vetor e arquivos gerados (npm run marca)
docs/                estes registros
```

## Modelo de dados (principais tabelas)
| Tabela | Para quê |
|---|---|
| `terreiros` | casas participantes |
| `perfis` | uma por pessoa: apelido, casa ativa, administrador, consentimento (papel e aprovação copiam o vínculo da casa ativa) |
| `membros` | vínculo pessoa–casa: papel, aprovação, contador, mensalidade própria, isenção, permissões extras (`fichas`, `escalas`, `funcoes`, `senhas`) |
| `casa_config` | módulos ligados/desligados pelo zelador (ausente = ligado) |
| `fichas` | ficha do filho por casa (saúde e espiritual). **Sem acesso direto:** só pelas funções `abrir_ficha`, `salvar_ficha`, `listar_fichas`, `copiar_minha_ficha` |
| `escalas`, `escala_pessoas` | escalas (todos / escolhidos / vagas) e quem confirmou, recusou, veio ou faltou |
| `item_contribuicoes` | quem leva cada item de uma função, quanto, se foi pedido do zelador e se já entregou |
| `senhas` | senhas de atendimento da gira (nome apagado após 30 dias) |
| `registros` | registro de atividades (só o zelador lê; gerado por gatilhos e pelas funções) |
| `financeiro_casa`, `cobrancas`, `cobranca_alvos`, `pagamentos` | mensalidades, contribuições e comprovantes |
| `eventos` | calendário da casa (feriados são calculados no app) |
| `materiais`, `movimentos_material`, `materiais_config`, `materiais_acesso` | estoque e quem pode ver/editar |
| `convites` | links de convite (tipo, validade, limite de uso) |
| `folhas` | catálogo (sem terreiro) e folhas cadastradas pelas casas (com status de validação) |
| `fundamentos` | Orixás e usos por folha **e por terreiro** |
| `pontos` | onde a folha está: coordenadas, fotos, visibilidade, status |
| `obrigacoes`, `obrigacao_itens` | funções e obrigações: itens de qualquer tipo (folha, bicho, semente...), quantidade e se os filhos podem se oferecer; `filho_id` = de quem é a obrigação |
| `push_inscricoes`, `notificacoes`, `config_push` | notificações no celular |

Toda leitura e escrita passa pelas regras de acesso (RLS). Ações sensíveis (aprovar membro, criar convite, excluir conta) são funções `security definer` com verificação de papel.

> **Atenção ao consultar "terreiros" a partir de "perfis":** as duas tabelas se ligam por mais de um caminho (`perfis.terreiro_id`, `membros`, `materiais_acesso`). Use sempre o caminho explícito, por exemplo `terreiros!perfis_terreiro_id_fkey(nome)`, ou o servidor recusa a consulta (erro PGRST201).

## Fluxos importantes
- **Cadastro:** link `?convite=CODIGO` → `info_convite` mostra a casa → `signUp` com o código e o consentimento → gatilho `novo_usuario` cria o perfil (zelador já aprovado; membro aguardando).
- **Marcar ponto:** fotos reduzidas e sem EXIF → (opcional) função `identificar` → envio das fotos ao Storage → registro em `pontos`. Sem internet, vai para a fila no IndexedDB e é enviado depois (`src/lib/fila.ts`).
- **Casa ativa:** `trocar_casa` muda `perfis.terreiro_id`; as funções `meu_terreiro()`, `sou_validador()` e `sou_zelador()` olham o vínculo dessa casa. As telas de gestão usam `eh_zelador_de(casa)`, `eh_gestor_financeiro_de(casa)` etc.
- **Mensalidades:** `garantir_mensalidades` cria as cobranças do mês ao abrir a tela; o filho chama `informar_pagamento` (com o caminho do comprovante no armazenamento `comprovantes/<casa>/<pessoa>/`); zelador ou contador chama `conferir_pagamento`.
- **Agendador:** `pg_cron` roda `lembrar_eventos()` às 9h e `lembretes_diarios()` às 8h (Brasília): lembretes de pagamento conforme a configuração da casa, escalas de amanhã, vagas sobrando, aniversários (para o zelador) e limpeza (nomes de senhas com mais de 30 dias, registros com mais de 1 ano).
- **Módulos:** a sessão lê `casa_config` da casa ativa (`useSessao().modulos`); rotas, menu e cartões só aparecem se o módulo estiver ligado. Permissões extras: `temPermissao(casa, 'fichas')` etc.
- **Relatórios:** calculados no app a partir das tabelas da casa (buscadas de mil em mil linhas), mais `uso_do_app` e `resumo_senhas`, que já vêm somados do banco.
- **Notificações:** gatilhos no banco → `notificacoes` → `pg_net` chama a função `notificar` → Web Push para os celulares inscritos.
- **Atualização do app:** o service worker procura versão nova ao abrir e quando o app volta para a tela (`src/lib/atualizacao.ts`).

## Visual
- `src/index.css` (base) + `src/visual.css` (camada visual): cores só por tokens em `:root`, com tema escuro (`prefers-color-scheme` ou `data-tema` escolhido em Perfil, `src/lib/tema.ts`).
- Ícones: `lucide-react` (um só estilo de traço). Cabeçalho de tela: `src/components/Topo.tsx`. Perguntas: `src/lib/dialogo.ts` + `Dialogos.tsx`.

## Como rodar
```bash
npm install
npm run demo   # demonstração com dados de exemplo, sem banco
npm run dev    # com o banco (precisa de .env.local, veja .env.example)
npm run build  # gera a versão de produção
npm run marca  # regenera logos e ícones a partir de marca/simbolo.svg
```

## Configurações fora do código (Supabase)
- Segredo `PLANTNET_KEY` (Edge Functions › Secrets).
- Funções `identificar` e `notificar` com "Verify JWT with legacy secret" **desligado** (a verificação é feita no próprio código).
- Authentication: "Confirm email" desligado; Site URL e Redirect URLs com o endereço do app.
- Variáveis do repositório no GitHub: `SUPABASE_URL` e `SUPABASE_KEY` (chave publicável).
