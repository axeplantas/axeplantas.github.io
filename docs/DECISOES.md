# Decisões importantes

Cada decisão com o contexto, a escolha e o motivo. Úteis para quem for continuar o projeto entender por que as coisas são como são.

---

### D1. Web app instalável (PWA) em vez de app de loja, no piloto
- **Contexto:** custo zero no começo; App Store custa US$ 99/ano e a Google Play US$ 25. No iPhone não há instalação gratuita fora da loja (nem com as lojas alternativas liberadas no Brasil em 2026, que também exigem a conta paga da Apple).
- **Escolha:** web app que se instala na tela inicial, nos dois sistemas.
- **Consequência:** dá para validar com os terreiros sem gastar. O código está pronto para virar app de loja (Capacitor) quando fizer sentido; política de privacidade, termos e exclusão de conta já atendem as exigências das lojas.

### D2. Contas e infraestrutura 100% pessoais do projeto
- **Contexto:** o idealizador trabalha numa empresa; nada pode ficar em contas corporativas.
- **Escolha:** conta Google própria (axeplantas@gmail.com) como dona de tudo: GitHub, Supabase e Pl@ntNet.
- **Consequência:** o projeto pode ser transferido para uma empresa ou associação no futuro sem depender de ninguém.

### D3. Supabase (banco, login, fotos e funções) no plano gratuito, região São Paulo
- **Alternativas:** Firebase, servidor próprio.
- **Motivo:** Postgres com regras de acesso no próprio banco (RLS), plano gratuito suficiente para o piloto e dados no Brasil.

### D4. Segurança no banco, não no app
- **Escolha:** todas as permissões (quem vê qual ponto, qual fundamento, quem aprova quem) são regras do banco de dados. O app só mostra o que o banco libera.
- **Motivo:** o código é público e o app roda no celular de cada pessoa; regras no app poderiam ser burladas.

### D5. Fundamento por casa
- **Contexto:** Orixás e usos de cada folha variam entre nações e casas, e parte do conhecimento é restrita.
- **Escolha:** o catálogo de folhas é comum (nomes e alertas); o fundamento é registrado por terreiro e só a própria casa vê.

### D6. Entrada por convite com aprovação humana
- **Evolução:** começou com código fixo por terreiro (v0.1); passou a links de convite (v0.3).
- **Escolha atual:** administrador cria terreiros e convida zeladores (link de uso único); zeladores convidam filhos (link reutilizável, 30 dias) e aprovam cada pedido.
- **Motivo:** dado sensível (religião) e risco de intolerância; ninguém entra sem alguém da casa conhecer.

### D7. Pl@ntNet para identificar plantas, com a chave no servidor
- **Alternativas:** Plant.id (pago), iNaturalist (sem API pública de identificação).
- **Motivo:** gratuito (500/dia), bom com folhas e flores. A chave fica num cofre do Supabase; o app chama uma função intermediária que também confere se a pessoa é membro aprovado.
- **Limitação conhecida:** certeza baixa com uma foto só de folha; por isso, até 3 fotos e fotos de referência (v0.10).

### D8. Notificações por Web Push com chaves geradas no servidor
- **Escolha:** gatilhos no banco colocam mensagens numa fila; uma função envia aos celulares inscritos. As chaves do Web Push são geradas pela própria função e guardadas no banco, sem ninguém digitá-las.
- **Limitação:** no iPhone, só com o app instalado na tela inicial.

### D9. Funcionar sem internet
- **Escolha:** pontos guardados no próprio aparelho (IndexedDB) e enviados sozinhos quando a internet volta; perfil e lista de folhas também ficam guardados.
- **Motivo:** muitas coletas acontecem em mata ou em lugares sem sinal.

### D10. Privacidade das fotos e da localização
- Fotos perdem os dados escondidos (EXIF, que podem conter a localização) antes do envio, e ficam privadas, com links temporários.
- A localização do celular não é guardada: só o ponto da planta.
- Terreiros não aparecem no mapa, e pontos compartilhados não mostram quem marcou.

### D12. Uma pessoa, várias casas
- **Contexto:** é comum ser filho de mais de uma casa (ex.: Candomblé e Jurema/Umbanda) e ter a própria casa.
- **Escolha:** um vínculo por casa (tabela `membros`), com papel, aprovação e função de contador próprios. A "casa ativa" escolhida no app decide o que aparece; as regras de acesso valem por casa.
- **Consequência:** tirar alguém de uma casa não apaga a conta dele; a exclusão de conta é sempre decisão da própria pessoa.

### D13. Mensalidades sem movimentar dinheiro
- **Escolha:** o app registra cobranças e comprovantes; o pagamento acontece fora (Pix, dinheiro) e é conferido por uma pessoa (zelador ou contador).
- **Motivo:** custo zero, nenhuma taxa, nenhum dado bancário guardado e menos responsabilidade regulatória no piloto. Cobrança automática fica para depois (Ideia 07).

### D14. Materiais com acesso escolhido pelo zelador
- **Contexto:** o estoque pode incluir itens sensíveis da casa (como animais), e cada casa tem a sua forma de tratar isso.
- **Escolha:** o zelador decide: toda a casa vê, ou só filhos escolhidos; e quem pode editar.

### D15. Ficha do filho: uma por casa, com sigilo e registro
- **Escolha:** cada casa tem a sua ficha da pessoa (orixás e guias mudam de casa para casa); dá para copiar de outra casa. Sem acesso direto à tabela: leitura e escrita só por funções que conferem a permissão e registram quem viu.
- **Saúde só o próprio filho altera;** o zelador altera a parte espiritual. Irmãos nunca veem a ficha uns dos outros.
- **Motivo:** saúde e religião são dados sensíveis (LGPD art. 11): consentimento específico na própria ficha e o mínimo de pessoas com acesso.

### D16. App sob medida para cada casa
- **Escolha:** o zelador liga e desliga módulos (ex.: senhas no Candomblé, mapa numa casa que não colhe). O que está desligado some do menu e das telas para todos daquela casa; os dados não são apagados.
- **Motivo:** cada tradição tem o seu dia a dia; tela com coisa que não se usa confunde.

### D17. Registro de atividades sem dados sensíveis
- **Escolha:** gatilhos no banco anotam quem fez o quê; ninguém edita nem apaga; fica 1 ano. Só o zelador vê. Para fichas, só "viu/alterou" e o nome dos campos, nunca os valores. Itens "só meus" (pontos e listas privadas) não entram.
- **Motivo:** o zelador pediu acompanhar o uso, e as fichas precisam de prestação de contas; o registro não pode virar um novo vazamento.

### D11. Código aberto no GitHub
- **Motivo:** o GitHub Pages gratuito exige repositório público. Nenhum dado dos terreiros fica no código.
- **Revisitar:** se houver investimento, avaliar repositório privado com outra hospedagem.
