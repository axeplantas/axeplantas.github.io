# Histórico de versões

Entradas mais recentes no topo. Cada versão diz **o que mudou** e **por quê**.

---

## v0.14 — 08/11/2026 — Ficha dos filhos, escalas, senhas, relatórios e app sob medida
**Origem:** conversas com pais e mães de santo de vários terreiros.
- **Ficha do filho** (uma por casa): dados pessoais, saúde (alergias, problemas de saúde, remédios com dose, horário, para que serve e se é de uso contínuo) e espiritual (orixás, nome de santo, iniciação, guias, mestres, entidades). Só o próprio filho, o zelador e quem ele autorizar veem; irmãos nunca. Saúde só o filho edita; a parte espiritual o zelador também. Toda leitura por outra pessoa fica registrada. Dá para copiar a ficha de outra casa.
- **Funções e obrigações com qualquer item:** folhas, bichos, sementes, velas, bebidas... com quantidade. Filhos se oferecem ("eu levo 2") ou o zelador distribui (escolhe o filho e a quantidade, e ele é avisado). A obrigação pode ser "de um filho", para medir a ajuda entre irmãos.
- **Escalas:** convocar a casa toda, escolher filhos ou abrir vagas ("preciso de 6"): todos são avisados e os primeiros que confirmam entram. Presença e falta marcadas depois. Lembrete na véspera e aviso de vagas sobrando.
- **Senhas da gira:** na porta, anota o primeiro nome e entrega a senha; na hora, "chamar próxima" e modo tela grande. Nomes apagados após 30 dias.
- **Lembretes de pagamento:** o zelador escolhe quantos dias antes avisar e de quanto em quanto tempo lembrar quem está em atraso.
- **Configurações da casa:** o zelador liga e desliga cada parte do app (mapa, funções, financeiro, calendário, escalas, fichas, materiais, senhas); o que está desligado some para todos da casa.
- **Permissões:** o zelador autoriza filhos a ver fichas, montar escalas, distribuir itens ou cuidar das senhas.
- **Relatórios:** em dia × atrasados, pontualidade por filho, mensalidade mês a mês, contribuições; participação e faltas nas escalas; quem contribui nas funções e nas obrigações dos irmãos; uso do app e "sumidos"; aniversariantes, orixás, tempo de santo e alertas de saúde; atendimentos por gira; mapa e materiais. Com planilha para baixar.
- **Registro de atividades:** o zelador vê o que cada filho fez e quando; ninguém apaga; dados de saúde nunca entram.
- Lema corrigido para a grafia iorubá: *Kò sí ewé, kò sí òrìṣà*.
- Política de privacidade atualizada (versão 2026-11).

## v0.13 — 25/10/2026 — Localização e identificação mais precisas
**Problema relatado:** a marcação às vezes ficava com ~60 m de erro, e o identificador errava.
- **GPS:** em vez de aceitar a primeira posição (que costuma vir do Wi-Fi ou da antena), o app escuta o GPS por até 30 s e vai levando a mira para a leitura mais precisa, mostrando "melhorando… ~X m". Um círculo azul mostra a margem de erro.
- **Foto de satélite** no mapa e na marcação (botão Satélite/Ruas), para pôr a mira exatamente na planta; também guardada para uso sem internet.
- Se a pessoa arrasta o mapa, vale o ajuste dela.
- O mapa principal passou a pedir a localização de alta precisão.
- **Identificação:** dicas de como fotografar antes da primeira foto e aviso quando o identificador fica em dúvida, sugerindo uma foto de outra parte da planta.

## v0.12 — 16/10/2026 — Correção grave e área de Gestão
**Problema real:** depois da v0.11 o app não mostrava as casas nem o financeiro ("Escolha uma casa primeiro").
- **Causa:** com as novas tabelas, o servidor passou a ver mais de um caminho entre "perfil" e "terreiro" e recusou a consulta do perfil por ambiguidade; o app achou que estava sem internet e abriu com dados antigos guardados no celular. Quem se cadastrasse nesse período não conseguiria entrar.
- **Correção:** as consultas indicam explicitamente o caminho; se a lista de casas falhar, o app tenta de novo e usa a casa do perfil enquanto isso.
- **Gestão da casa (zelador):** painel com os números da casa (filhos, pedidos, comprovantes, recebido no mês, próximo evento, materiais acabando), o que precisa de atenção e acesso a tudo o que ele administra; edição do nome e da nação da casa.
- "Mensalidades" passou a se chamar **Financeiro**; "Filhos da casa" virou **Filhos e funções**, dentro da Gestão.
- Botão de localização do mapa redesenhado e centralizado.

## v0.11 — 14/10/2026 — Gestão da casa e várias casas por pessoa
**Pedido:** controle de mensalidades com comprovante, calendário, materiais de trabalho e poder ser filho de mais de um terreiro.
- **Várias casas por pessoa:** cada pessoa tem um vínculo com cada casa (papel e aprovação próprios) e troca de casa na aba Casa. Quem já tem conta entra em outra casa pelo link de convite, sem criar outra conta. Tirar alguém de uma casa não apaga a conta dele.
- **Contador:** função extra que se soma ao papel (zelador e contador, membro e contador).
- **Mensalidades e contribuições (Ideia 01):** valor padrão da casa com exceções por filho (valor próprio ou isenção); contribuições avulsas (ex.: festa de Erê) para todos ou para filhos escolhidos. O filho informa o pagamento e anexa o comprovante; o zelador ou o contador confirma ou recusa com motivo. Tela "Quem pagou" com lista de pendentes para copiar no WhatsApp e registro de pagamento em dinheiro.
- **Calendário (Ideia 03):** eventos da casa (festa, gira, obrigação, reunião, mutirão) e feriados nacionais calculados automaticamente; aviso quando um evento é marcado e lembrete na véspera; botão para adicionar à agenda do celular.
- **Materiais de trabalho (Ideia 02):** estoque de qualquer tipo de material (folhas, animais, velas, louças, bebidas…), entradas e saídas com histórico e aviso quando chega ao mínimo. O zelador escolhe quem vê: toda a casa ou filhos específicos, e quem pode editar.
- Nova aba **Casa** no menu, reunindo Calendário, Mensalidades, Obrigações, Materiais, Validar e Filhos da casa.
- Política de Privacidade atualizada com os novos dados (pagamentos e comprovantes).

## v0.10 — 13/10/2026 — Notificações, uso sem internet e identificador mais forte
**Pedido:** avisar no celular, permitir marcar pontos sem sinal (no mato) e melhorar a identificação pela foto.
- **Notificações no celular (Web Push):** o zelador recebe aviso de pedido de entrada; validadores, de folhas e pontos novos para conferir; a pessoa, quando é aprovada e quando o ponto dela é aprovado. No iPhone, só com o app instalado na tela inicial (regra da Apple).
- **Guardar no celular e enviar depois:** o ponto, com as fotos, fica no aparelho e é enviado sozinho quando a internet volta. O app também abre sem internet, usando os dados guardados.
- **Até 3 fotos por planta** (folha, flor, fruto, caule, planta inteira), todas enviadas juntas ao Pl@ntNet, o que aumenta a certeza.
- **Fotos de referência** em cada sugestão, para comparar com a planta real.
- **As fotos ficam no ponto:** quem for procurar a folha vê todas no mapa, e a página da folha mostra "Como ela é".
- Início destes registros (pasta `docs/`).

## v0.9 — 13/10/2026 01:03 — Revisão de usabilidade
**Motivo:** revisão completa com foco em erros comuns de usuários pouco acostumados com apps.
- Selo com número de pendências na aba Validar; pedidos de entrada no topo.
- Confirmação antes de recusar, remover ou promover alguém a zelador.
- Busca de folha digitando o nome, no lugar de listas longas.
- Aviso de folha repetida ao cadastrar; edição de folhas.
- Mapa abre na posição da pessoa; filtro só com folhas marcadas; botão de localização.
- "Mostrar senha", correção de e-mail digitado errado, trocar senha.
- Tela de espera confere a aprovação sozinha e ensina a instalar.
- Tradução do lema na entrada: *Kosi ewe, kosi Orisa*, "Sem folha, não há Orixá".

## v0.8 — 13/10/2026 00:42 — Links de convite mais claros
**Problema real:** o link de zelador (uso único) foi enviado no grupo e as outras pessoas não conseguiram entrar.
- O link dos filhos aparece primeiro; o de zelador fica destacado como "1 pessoa só".
- Mensagem de link já usado explica o que fazer.

## v0.7 — 13/10/2026 00:32 — Reconhecimento de nomes no catálogo
**Problema real:** o Pl@ntNet chama o boldo pelo nome científico atual (*Coleus barbatus*) e o catálogo usava o antigo.
- O app passa a reconhecer a folha também pelo nome popular, evitando folhas repetidas.

## v0.6 — 13/10/2026 00:24 — Atualização automática
**Problema real:** o celular continuava com a versão antiga do app.
- O app procura versão nova ao abrir e sempre que volta para a tela, e recarrega sozinho.
- Número da versão no Perfil.

## v0.5 — 13/10/2026 00:19 — Identificação pela foto
- Integração com o Pl@ntNet (gratuito, 500 identificações/dia), por uma função no servidor que guarda a chave em cofre.
- Se a folha sugerida não existe no catálogo, o app cadastra sozinho (o validador confere).

## v0.4 — 13/10/2026 00:15 — Catálogo inicial
- 61 folhas comuns nos terreiros, com nomes populares, nomes científicos e alertas de toxicidade, sem fundamento.

## v0.3 — 12/10/2026 23:50 — Convites por link
**Pedido:** o administrador cria os terreiros e convida os zeladores; os zeladores convidam os filhos.
- Fim do código fixo por terreiro; links de convite com validade e limite de uso.
- Área de administração.

## v0.2 — 12/10/2026 23:35 — Páginas legais
- Política de Privacidade e Termos de Uso preenchidos (responsável: Projeto Axé Plantas).

## v0.1 — 12/10/2026 23:33 — Primeira versão publicada
- Web app instalável (PWA) para iPhone e Android.
- Mapa compartilhado com visibilidade por ponto (só eu, meu terreiro, rede).
- Aprovação de membros pelo zelador e validação de folhas e pontos por casa.
- Fundamento por casa, visível só para ela.
- Obrigações: listas de folhas com o ponto mais próximo e "como chegar".
- Exclusão de conta no app e consentimento LGPD no cadastro.
- Marca (logo) redesenhada em vetor e modo demonstração.

## Antes do código — 12/10/2026
- Ideia inicial: app para marcar no mapa onde estão ervas e árvores, com foto e localização.
- Foco definido no povo de terreiro (Candomblé, Umbanda, Jurema), com piloto em 3 casas e cerca de 100 usuários.
- Restrições: projeto pessoal (nenhuma conta corporativa) e custo zero no começo.
- Nome: **Axé Plantas**, trocadilho com "achar plantas".
