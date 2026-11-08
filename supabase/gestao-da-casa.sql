-- =====================================================================
-- Gestão da casa: mensalidades e contribuições, calendário, materiais
--
-- Rode depois de varias-casas.sql. Pode rodar mais de uma vez.
-- =====================================================================

-- =====================================================================
-- 1. MENSALIDADES E CONTRIBUIÇÕES
--
-- O filho informa que pagou e anexa o comprovante; o zelador ou o contador
-- confere (confirma ou recusa). Mensalidades são geradas mês a mês a partir
-- da configuração da casa; contribuições avulsas (ex.: festa de Erê) são
-- criadas pelo zelador/contador, para todos ou para filhos escolhidos.
-- =====================================================================

create table if not exists public.financeiro_casa (
  terreiro_id uuid primary key references public.terreiros (id) on delete cascade,
  cobra_mensalidade boolean not null default true,
  valor_padrao numeric(10, 2) not null default 0,
  dia_vencimento integer not null default 10 check (dia_vencimento between 1 and 28),
  instrucoes text,                       -- ex.: chave Pix, banco, observações
  inicio date not null default date_trunc('month', now())::date,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  tipo text not null check (tipo in ('mensalidade', 'contribuicao')),
  titulo text not null,
  descricao text,
  competencia date,                      -- mensalidade: primeiro dia do mês
  vencimento date not null,
  valor numeric(10, 2),                  -- mensalidade: vazio = valor de cada filho
  para_todos boolean not null default true,
  criado_por uuid references public.perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists cobrancas_mensalidade_unica
  on public.cobrancas (terreiro_id, competencia) where tipo = 'mensalidade';

create table if not exists public.cobranca_alvos (
  cobranca_id uuid not null references public.cobrancas (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  primary key (cobranca_id, perfil_id)
);

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas (id) on delete cascade,
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  valor numeric(10, 2),
  status text not null check (status in ('informado', 'confirmado', 'recusado', 'isento')),
  comprovante text,                      -- caminho no armazenamento "comprovantes"
  observacao text,                       -- do filho
  motivo text,                           -- do zelador/contador, ao recusar
  informado_em timestamptz,
  conferido_por uuid references public.perfis (id) on delete set null,
  conferido_em timestamptz,
  unique (cobranca_id, perfil_id)
);

create index if not exists pagamentos_terreiro_idx on public.pagamentos (terreiro_id, status);

-- Valor que um filho deve numa cobrança
create or replace function public.valor_devido(p_cobranca uuid, p_perfil uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
    when c.tipo = 'contribuicao' then c.valor
    else coalesce(c.valor, m.mensalidade_valor, f.valor_padrao)
  end
  from public.cobrancas c
  left join public.membros m on m.terreiro_id = c.terreiro_id and m.perfil_id = p_perfil
  left join public.financeiro_casa f on f.terreiro_id = c.terreiro_id
  where c.id = p_cobranca
$$;

-- Cria as mensalidades que faltam, do mês de início até o mês atual.
create or replace function public.garantir_mensalidades(p_terreiro uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_config public.financeiro_casa%rowtype;
  v_mes date;
  v_nomes text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  if not public.eh_membro_de(p_terreiro) and not public.sou_admin() then
    return;
  end if;
  select * into v_config from public.financeiro_casa where terreiro_id = p_terreiro;
  if not found or not v_config.cobra_mensalidade then
    return;
  end if;
  v_mes := date_trunc('month', v_config.inicio)::date;
  while v_mes <= date_trunc('month', now())::date loop
    insert into public.cobrancas (terreiro_id, tipo, titulo, competencia, vencimento, para_todos)
    values (p_terreiro, 'mensalidade',
            'Mensalidade de ' || v_nomes[extract(month from v_mes)::int] || ' de ' || extract(year from v_mes)::int,
            v_mes, v_mes + (v_config.dia_vencimento - 1), true)
    on conflict do nothing;
    v_mes := (v_mes + interval '1 month')::date;
  end loop;
end $$;

-- O filho informa que pagou (com comprovante). Pode reenviar se foi recusado.
create or replace function public.informar_pagamento(p_cobranca uuid, p_comprovante text, p_observacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cobranca public.cobrancas%rowtype;
  v_atual public.pagamentos%rowtype;
begin
  select * into v_cobranca from public.cobrancas where id = p_cobranca;
  if not found or not public.eh_membro_de(v_cobranca.terreiro_id) then
    raise exception 'Cobrança não encontrada';
  end if;
  if not v_cobranca.para_todos
     and not exists (select 1 from public.cobranca_alvos where cobranca_id = p_cobranca and perfil_id = auth.uid()) then
    raise exception 'Esta cobrança não é para você';
  end if;
  select * into v_atual from public.pagamentos where cobranca_id = p_cobranca and perfil_id = auth.uid();
  if found and v_atual.status in ('confirmado', 'isento') then
    raise exception 'Este pagamento já foi confirmado';
  end if;

  insert into public.pagamentos (cobranca_id, terreiro_id, perfil_id, valor, status, comprovante, observacao, informado_em, motivo)
  values (p_cobranca, v_cobranca.terreiro_id, auth.uid(), public.valor_devido(p_cobranca, auth.uid()),
          'informado', p_comprovante, nullif(trim(p_observacao), ''), now(), null)
  on conflict (cobranca_id, perfil_id) do update
    set status = 'informado', comprovante = excluded.comprovante, observacao = excluded.observacao,
        informado_em = now(), motivo = null, valor = excluded.valor;
end $$;

-- Zelador ou contador confere: confirma, recusa (com motivo) ou marca isento.
-- Também serve para registrar pagamento em dinheiro (sem comprovante).
create or replace function public.conferir_pagamento(p_cobranca uuid, p_perfil uuid, p_status text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cobranca public.cobrancas%rowtype;
begin
  select * into v_cobranca from public.cobrancas where id = p_cobranca;
  if not found or not public.eh_gestor_financeiro_de(v_cobranca.terreiro_id) then
    raise exception 'Somente o zelador ou o contador da casa pode conferir pagamentos';
  end if;
  if p_status not in ('confirmado', 'recusado', 'isento') then
    raise exception 'Situação inválida';
  end if;
  if p_status = 'recusado' and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga o motivo da recusa';
  end if;

  insert into public.pagamentos (cobranca_id, terreiro_id, perfil_id, valor, status, motivo, conferido_por, conferido_em)
  values (p_cobranca, v_cobranca.terreiro_id, p_perfil, public.valor_devido(p_cobranca, p_perfil),
          p_status, nullif(trim(p_motivo), ''), auth.uid(), now())
  on conflict (cobranca_id, perfil_id) do update
    set status = excluded.status, motivo = excluded.motivo, conferido_por = auth.uid(), conferido_em = now();
end $$;

-- Nova contribuição avulsa (para todos ou para filhos escolhidos)
create or replace function public.criar_contribuicao(
  p_terreiro uuid, p_titulo text, p_descricao text, p_valor numeric, p_vencimento date, p_pessoas uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.eh_gestor_financeiro_de(p_terreiro) then
    raise exception 'Somente o zelador ou o contador da casa pode criar contribuições';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor';
  end if;
  insert into public.cobrancas (terreiro_id, tipo, titulo, descricao, vencimento, valor, para_todos, criado_por)
  values (p_terreiro, 'contribuicao', trim(p_titulo), nullif(trim(p_descricao), ''), p_vencimento, p_valor,
          coalesce(array_length(p_pessoas, 1), 0) = 0, auth.uid())
  returning id into v_id;
  if coalesce(array_length(p_pessoas, 1), 0) > 0 then
    insert into public.cobranca_alvos (cobranca_id, perfil_id) select v_id, unnest(p_pessoas);
  end if;
  return v_id;
end $$;

create or replace function public.apagar_cobranca(p_cobranca uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cobrancas
  where id = p_cobranca and tipo = 'contribuicao' and public.eh_gestor_financeiro_de(terreiro_id);
  if not found then
    raise exception 'Contribuição não encontrada';
  end if;
end $$;

-- Configuração da mensalidade (zelador ou contador)
create or replace function public.configurar_financeiro(
  p_terreiro uuid, p_cobra boolean, p_valor numeric, p_dia integer, p_instrucoes text, p_inicio date
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_gestor_financeiro_de(p_terreiro) then
    raise exception 'Somente o zelador ou o contador da casa pode configurar';
  end if;
  insert into public.financeiro_casa (terreiro_id, cobra_mensalidade, valor_padrao, dia_vencimento, instrucoes, inicio, atualizado_em)
  values (p_terreiro, p_cobra, coalesce(p_valor, 0), coalesce(p_dia, 10), nullif(trim(p_instrucoes), ''),
          date_trunc('month', coalesce(p_inicio, now()))::date, now())
  on conflict (terreiro_id) do update
    set cobra_mensalidade = excluded.cobra_mensalidade, valor_padrao = excluded.valor_padrao,
        dia_vencimento = excluded.dia_vencimento, instrucoes = excluded.instrucoes,
        inicio = excluded.inicio, atualizado_em = now();
end $$;

-- Avisos: comprovante enviado → gestores; conferido → o filho; contribuição nova → quem deve
create or replace function public.notificar_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_titulo text := (select titulo from public.cobrancas where id = new.cobranca_id);
  v_apelido text := (select apelido from public.perfis where id = new.perfil_id);
begin
  if new.status = 'informado' and (tg_op = 'INSERT' or old.status is distinct from 'informado' or old.comprovante is distinct from new.comprovante) then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    select distinct m.perfil_id, 'Comprovante para conferir', v_apelido || ' informou o pagamento de: ' || v_titulo || '.', '#/casa/financeiro'
    from public.membros m
    where m.terreiro_id = new.terreiro_id and m.aprovado and (m.papel = 'zelador' or m.contador)
      and m.perfil_id <> new.perfil_id;
  elsif new.status in ('confirmado', 'recusado') and new.perfil_id is distinct from new.conferido_por
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    values (new.perfil_id,
            case when new.status = 'confirmado' then 'Pagamento confirmado' else 'Pagamento recusado' end,
            v_titulo || case when new.status = 'confirmado' then ' foi confirmado. Obrigado!' else ': ' || coalesce(new.motivo, 'confira com a casa.') end,
            '#/casa/financeiro');
  end if;
  return new;
end $$;

drop trigger if exists pagamento_notificar on public.pagamentos;
create trigger pagamento_notificar after insert or update on public.pagamentos
  for each row execute function public.notificar_pagamento();

create or replace function public.notificar_contribuicao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'contribuicao' and new.para_todos then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    select perfil_id, 'Nova contribuição: ' || new.titulo,
           'Valor ' || public.texto_reais(new.valor) || ', até ' || to_char(new.vencimento, 'DD/MM') || '.',
           '#/casa/financeiro'
    from public.membros
    where terreiro_id = new.terreiro_id and aprovado and perfil_id is distinct from new.criado_por;
  end if;
  return new;
end $$;

drop trigger if exists contribuicao_notificar on public.cobrancas;
create trigger contribuicao_notificar after insert on public.cobrancas
  for each row execute function public.notificar_contribuicao();

create or replace function public.notificar_alvo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v public.cobrancas%rowtype;
begin
  select * into v from public.cobrancas where id = new.cobranca_id;
  if new.perfil_id is distinct from v.criado_por then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    values (new.perfil_id, 'Nova contribuição: ' || v.titulo,
            'Valor ' || public.texto_reais(v.valor) || ', até ' || to_char(v.vencimento, 'DD/MM') || '.',
            '#/casa/financeiro');
  end if;
  return new;
end $$;

drop trigger if exists alvo_notificar on public.cobranca_alvos;
create trigger alvo_notificar after insert on public.cobranca_alvos
  for each row execute function public.notificar_alvo();

-- Comprovantes: armazenamento privado. Caminho: <terreiro>/<pessoa>/<arquivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists comprovantes_enviar on storage.objects;
create policy comprovantes_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes'
              and (storage.foldername(name))[2] = auth.uid()::text
              and exists (select 1 from public.membros m
                          where m.perfil_id = auth.uid() and m.aprovado
                            and m.terreiro_id::text = (storage.foldername(name))[1]));
drop policy if exists comprovantes_ver on storage.objects;
create policy comprovantes_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes'
         and ((storage.foldername(name))[2] = auth.uid()::text
              or exists (select 1 from public.membros m
                         where m.perfil_id = auth.uid() and m.aprovado and (m.papel = 'zelador' or m.contador)
                           and m.terreiro_id::text = (storage.foldername(name))[1])));
drop policy if exists comprovantes_apagar on storage.objects;
create policy comprovantes_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and (storage.foldername(name))[2] = auth.uid()::text);

-- Permissões (escritas só pelas funções acima)
alter table public.financeiro_casa enable row level security;
alter table public.cobrancas enable row level security;
alter table public.cobranca_alvos enable row level security;
alter table public.pagamentos enable row level security;
revoke all on public.financeiro_casa, public.cobrancas, public.cobranca_alvos, public.pagamentos from anon, authenticated;
grant select on public.financeiro_casa, public.cobrancas, public.cobranca_alvos, public.pagamentos to authenticated;
grant select, insert, update, delete on public.financeiro_casa, public.cobrancas, public.cobranca_alvos, public.pagamentos to service_role;

drop policy if exists financeiro_ler on public.financeiro_casa;
create policy financeiro_ler on public.financeiro_casa for select to authenticated
  using (public.eh_membro_de(terreiro_id));

drop policy if exists cobrancas_ler on public.cobrancas;
create policy cobrancas_ler on public.cobrancas for select to authenticated
  using (public.eh_gestor_financeiro_de(terreiro_id)
         or (public.eh_membro_de(terreiro_id)
             and (para_todos or exists (select 1 from public.cobranca_alvos a
                                        where a.cobranca_id = cobrancas.id and a.perfil_id = auth.uid()))));

drop policy if exists alvos_ler on public.cobranca_alvos;
create policy alvos_ler on public.cobranca_alvos for select to authenticated
  using (perfil_id = auth.uid()
         or exists (select 1 from public.cobrancas c
                    where c.id = cobranca_id and public.eh_gestor_financeiro_de(c.terreiro_id)));

drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos for select to authenticated
  using (perfil_id = auth.uid() or public.eh_gestor_financeiro_de(terreiro_id));

revoke execute on function
  public.garantir_mensalidades(uuid), public.informar_pagamento(uuid, text, text),
  public.conferir_pagamento(uuid, uuid, text, text),
  public.criar_contribuicao(uuid, text, text, numeric, date, uuid[]), public.apagar_cobranca(uuid),
  public.configurar_financeiro(uuid, boolean, numeric, integer, text, date)
  from public, anon;
grant execute on function
  public.garantir_mensalidades(uuid), public.informar_pagamento(uuid, text, text),
  public.conferir_pagamento(uuid, uuid, text, text),
  public.criar_contribuicao(uuid, text, text, numeric, date, uuid[]), public.apagar_cobranca(uuid),
  public.configurar_financeiro(uuid, boolean, numeric, integer, text, date)
  to authenticated;

-- =====================================================================
-- 2. CALENDÁRIO DA CASA
-- Zelador e validadores criam os eventos; toda a casa vê e é avisada.
-- (Os feriados nacionais são calculados pelo próprio app.)
-- =====================================================================

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  titulo text not null,
  tipo text not null default 'outro' check (tipo in ('festa', 'gira', 'obrigacao', 'reuniao', 'mutirao', 'outro')),
  data date not null,
  hora time,
  hora_fim time,
  local text,
  descricao text,
  criado_por uuid references public.perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists eventos_terreiro_data_idx on public.eventos (terreiro_id, data);

create or replace function public.antes_salvar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid();
  else
    new.criado_por := old.criado_por;
    new.terreiro_id := old.terreiro_id;
  end if;
  return new;
end $$;

drop trigger if exists evento_salvar on public.eventos;
create trigger evento_salvar before insert or update on public.eventos
  for each row execute function public.antes_salvar_evento();

create or replace function public.notificar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notificacoes (perfil_id, titulo, corpo, url)
  select perfil_id, 'Novo no calendário: ' || new.titulo,
         to_char(new.data, 'DD/MM') || coalesce(' às ' || to_char(new.hora, 'HH24:MI'), '') || coalesce(' · ' || new.local, ''),
         '#/casa/calendario'
  from public.membros
  where terreiro_id = new.terreiro_id and aprovado and perfil_id is distinct from new.criado_por;
  return new;
end $$;

drop trigger if exists evento_notificar on public.eventos;
create trigger evento_notificar after insert on public.eventos
  for each row execute function public.notificar_evento();

-- Lembrete na véspera (rodado todo dia pelo agendador do banco)
create or replace function public.lembrar_eventos() returns void
language sql security definer set search_path = '' as $$
  insert into public.notificacoes (perfil_id, titulo, corpo, url)
  select m.perfil_id, 'Amanhã: ' || e.titulo,
         coalesce('Às ' || to_char(e.hora, 'HH24:MI'), 'Dia inteiro') || coalesce(' · ' || e.local, ''),
         '#/casa/calendario'
  from public.eventos e
  join public.membros m on m.terreiro_id = e.terreiro_id and m.aprovado
  where e.data = (now() at time zone 'America/Sao_Paulo')::date + 1
$$;

alter table public.eventos enable row level security;
revoke all on public.eventos from anon, authenticated;
grant select, insert, update, delete on public.eventos to authenticated;
grant select, insert, update, delete on public.eventos to service_role;

drop policy if exists eventos_ler on public.eventos;
create policy eventos_ler on public.eventos for select to authenticated
  using (public.eh_membro_de(terreiro_id));
drop policy if exists eventos_criar on public.eventos;
create policy eventos_criar on public.eventos for insert to authenticated
  with check (public.eh_equipe_de(terreiro_id));
drop policy if exists eventos_editar on public.eventos;
create policy eventos_editar on public.eventos for update to authenticated
  using (public.eh_equipe_de(terreiro_id)) with check (public.eh_equipe_de(terreiro_id));
drop policy if exists eventos_apagar on public.eventos;
create policy eventos_apagar on public.eventos for delete to authenticated
  using (public.eh_equipe_de(terreiro_id));

-- =====================================================================
-- 3. MATERIAIS DE TRABALHO (folhas, animais, velas, louças, bebidas...)
-- O zelador decide quem vê: toda a casa ou filhos escolhidos (e quem edita).
-- =====================================================================

create table if not exists public.materiais_config (
  terreiro_id uuid primary key references public.terreiros (id) on delete cascade,
  para_todos boolean not null default false
);

create table if not exists public.materiais_acesso (
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  pode_editar boolean not null default false,
  primary key (terreiro_id, perfil_id)
);

create table if not exists public.materiais (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  nome text not null,
  categoria text not null default 'outro'
    check (categoria in ('folha', 'animal', 'vela', 'louca', 'bebida', 'alimento', 'tecido', 'ferramenta', 'outro')),
  unidade text not null default 'unidade',
  quantidade numeric(12, 2) not null default 0,
  minimo numeric(12, 2),
  observacao text,
  folha_id uuid references public.folhas (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists materiais_terreiro_idx on public.materiais (terreiro_id);

create table if not exists public.movimentos_material (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiais (id) on delete cascade,
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  quantidade numeric(12, 2) not null check (quantidade >= 0),
  motivo text,
  perfil_id uuid references public.perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.pode_ver_materiais(p_terreiro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_zelador_de(p_terreiro)
      or (public.eh_membro_de(p_terreiro)
          and (coalesce((select para_todos from public.materiais_config where terreiro_id = p_terreiro), false)
               or exists (select 1 from public.materiais_acesso where terreiro_id = p_terreiro and perfil_id = auth.uid())))
$$;

create or replace function public.pode_editar_materiais(p_terreiro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_zelador_de(p_terreiro)
      or (public.eh_membro_de(p_terreiro)
          and exists (select 1 from public.materiais_acesso
                      where terreiro_id = p_terreiro and perfil_id = auth.uid() and pode_editar))
$$;

-- Zelador define quem vê e quem edita: p_pessoas = [{"perfil_id": "...", "pode_editar": true}, ...]
create or replace function public.definir_acesso_materiais(p_terreiro uuid, p_para_todos boolean, p_pessoas jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_zelador_de(p_terreiro) then
    raise exception 'Somente o zelador da casa define quem vê os materiais';
  end if;
  insert into public.materiais_config (terreiro_id, para_todos) values (p_terreiro, p_para_todos)
  on conflict (terreiro_id) do update set para_todos = excluded.para_todos;
  delete from public.materiais_acesso where terreiro_id = p_terreiro;
  insert into public.materiais_acesso (terreiro_id, perfil_id, pode_editar)
  select p_terreiro, (p ->> 'perfil_id')::uuid, coalesce((p ->> 'pode_editar')::boolean, false)
  from jsonb_array_elements(coalesce(p_pessoas, '[]'::jsonb)) p
  where exists (select 1 from public.membros m
                where m.terreiro_id = p_terreiro and m.perfil_id = (p ->> 'perfil_id')::uuid);
end $$;

create or replace function public.antes_salvar_material() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.terreiro_id := old.terreiro_id;
  end if;
  return new;
end $$;

drop trigger if exists material_salvar on public.materiais;
create trigger material_salvar before insert or update on public.materiais
  for each row execute function public.antes_salvar_material();

-- Cada movimento atualiza a quantidade do material
create or replace function public.aplicar_movimento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.perfil_id := auth.uid();
  new.terreiro_id := (select terreiro_id from public.materiais where id = new.material_id);
  update public.materiais
     set quantidade = case new.tipo
                        when 'entrada' then quantidade + new.quantidade
                        when 'saida' then greatest(quantidade - new.quantidade, 0)
                        else new.quantidade
                      end
   where id = new.material_id;
  return new;
end $$;

drop trigger if exists movimento_aplicar on public.movimentos_material;
create trigger movimento_aplicar before insert on public.movimentos_material
  for each row execute function public.aplicar_movimento();

-- Aviso quando um material chega ao mínimo
create or replace function public.notificar_material_acabando() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.minimo is not null and new.quantidade <= new.minimo and (old.quantidade > old.minimo or old.minimo is null) then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    select distinct m.perfil_id, 'Material acabando: ' || new.nome,
           'Restam ' || public.texto_quantidade(new.quantidade) || ' ' || new.unidade || '.', '#/casa/materiais'
    from public.membros m
    where m.terreiro_id = new.terreiro_id and m.aprovado
      and (m.papel = 'zelador'
           or exists (select 1 from public.materiais_acesso a
                      where a.terreiro_id = new.terreiro_id and a.perfil_id = m.perfil_id and a.pode_editar));
  end if;
  return new;
end $$;

drop trigger if exists material_acabando on public.materiais;
create trigger material_acabando after update on public.materiais
  for each row execute function public.notificar_material_acabando();

alter table public.materiais_config enable row level security;
alter table public.materiais_acesso enable row level security;
alter table public.materiais enable row level security;
alter table public.movimentos_material enable row level security;
revoke all on public.materiais_config, public.materiais_acesso, public.materiais, public.movimentos_material from anon, authenticated;
grant select on public.materiais_config, public.materiais_acesso to authenticated;
grant select, insert, update, delete on public.materiais to authenticated;
grant select, insert on public.movimentos_material to authenticated;
grant select, insert, update, delete on public.materiais_config, public.materiais_acesso, public.materiais, public.movimentos_material to service_role;

drop policy if exists materiais_config_ler on public.materiais_config;
create policy materiais_config_ler on public.materiais_config for select to authenticated
  using (public.eh_membro_de(terreiro_id));
drop policy if exists materiais_acesso_ler on public.materiais_acesso;
create policy materiais_acesso_ler on public.materiais_acesso for select to authenticated
  using (perfil_id = auth.uid() or public.eh_zelador_de(terreiro_id));

drop policy if exists materiais_ler on public.materiais;
create policy materiais_ler on public.materiais for select to authenticated
  using (public.pode_ver_materiais(terreiro_id));
drop policy if exists materiais_criar on public.materiais;
create policy materiais_criar on public.materiais for insert to authenticated
  with check (public.pode_editar_materiais(terreiro_id));
drop policy if exists materiais_editar on public.materiais;
create policy materiais_editar on public.materiais for update to authenticated
  using (public.pode_editar_materiais(terreiro_id)) with check (public.pode_editar_materiais(terreiro_id));
drop policy if exists materiais_apagar on public.materiais;
create policy materiais_apagar on public.materiais for delete to authenticated
  using (public.pode_editar_materiais(terreiro_id));

drop policy if exists movimentos_ler on public.movimentos_material;
create policy movimentos_ler on public.movimentos_material for select to authenticated
  using (public.pode_ver_materiais(terreiro_id));
drop policy if exists movimentos_criar on public.movimentos_material;
create policy movimentos_criar on public.movimentos_material for insert to authenticated
  with check (exists (select 1 from public.materiais mt
                      where mt.id = material_id and public.pode_editar_materiais(mt.terreiro_id)));

revoke execute on function public.definir_acesso_materiais(uuid, boolean, jsonb) from public, anon;
grant execute on function public.definir_acesso_materiais(uuid, boolean, jsonb) to authenticated;

-- =====================================================================
-- 4. AGENDADOR: lembrete de eventos todo dia às 9h (horário de Brasília)
-- =====================================================================

create extension if not exists pg_cron;
select cron.unschedule('lembrar-eventos') where exists (select 1 from cron.job where jobname = 'lembrar-eventos');
select cron.schedule('lembrar-eventos', '0 12 * * *', 'select public.lembrar_eventos()');
