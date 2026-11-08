-- =====================================================================
-- Ficha dos filhos, funções com itens, escalas, senhas de gira,
-- lembretes de pagamento, módulos da casa e registro de atividades
--
-- Rode depois de gestao-da-casa.sql. Pode rodar mais de uma vez.
-- =====================================================================

-- =====================================================================
-- 1. PERMISSÕES EXTRAS E MÓDULOS DA CASA
--
-- O zelador autoriza filhos a: ver fichas, operar senhas, montar escalas
-- e distribuir itens das funções. Ele mesmo tem todas.
-- Módulos: o zelador liga/desliga partes do app (ex.: senhas no Candomblé).
-- =====================================================================

alter table public.membros add column if not exists permissoes text[] not null default '{}';

create or replace function public.tem_permissao(p_terreiro uuid, p_permissao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros
                 where perfil_id = auth.uid() and terreiro_id = p_terreiro and aprovado
                   and (papel = 'zelador' or p_permissao = any (permissoes)))
$$;

create or replace function public.definir_permissoes(p_usuario uuid, p_terreiro uuid, p_permissoes text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.sou_admin() or public.eh_zelador_de(p_terreiro)) then
    raise exception 'Somente o zelador da casa pode dar permissões';
  end if;
  if exists (select 1 from unnest(coalesce(p_permissoes, '{}')) p
             where p not in ('fichas', 'senhas', 'escalas', 'funcoes')) then
    raise exception 'Permissão inválida';
  end if;
  update public.membros set permissoes = coalesce(p_permissoes, '{}')
   where perfil_id = p_usuario and terreiro_id = p_terreiro;
  if not found then
    raise exception 'Membro não encontrado nesta casa';
  end if;
end $$;

create table if not exists public.casa_config (
  terreiro_id uuid primary key references public.terreiros (id) on delete cascade,
  modulos jsonb not null default '{}',     -- {"senhas": false, ...}; ausente = ligado
  atualizado_em timestamptz not null default now()
);

create or replace function public.modulo_ligado(p_terreiro uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (modulos ->> p_modulo)::boolean from public.casa_config where terreiro_id = p_terreiro), true)
$$;

create or replace function public.configurar_modulos(p_terreiro uuid, p_modulos jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_zelador_de(p_terreiro) then
    raise exception 'Somente o zelador da casa configura o app';
  end if;
  insert into public.casa_config (terreiro_id, modulos, atualizado_em)
  values (p_terreiro, coalesce(p_modulos, '{}'), now())
  on conflict (terreiro_id) do update set modulos = excluded.modulos, atualizado_em = now();
end $$;

-- Nomes dos filhos da casa (para escalas, funções e distribuição).
-- Qualquer filho aprovado vê os apelidos dos irmãos; nada além disso.
create or replace function public.apelidos_da_casa(p_terreiro uuid)
returns table (perfil_id uuid, apelido text, papel text)
language sql stable security definer set search_path = '' as $$
  select m.perfil_id, p.apelido, m.papel
  from public.membros m
  join public.perfis p on p.id = m.perfil_id
  where m.terreiro_id = p_terreiro and m.aprovado and public.eh_membro_de(p_terreiro)
  order by p.apelido
$$;

alter table public.casa_config enable row level security;
revoke all on public.casa_config from anon, authenticated;
grant select on public.casa_config to authenticated;
grant select, insert, update, delete on public.casa_config to service_role;
drop policy if exists casa_config_ler on public.casa_config;
create policy casa_config_ler on public.casa_config for select to authenticated
  using (public.eh_membro_de(terreiro_id));

-- =====================================================================
-- 2. REGISTRO DE ATIVIDADES (o zelador vê o que acontece na casa)
--
-- Só se acrescenta; ninguém edita nem apaga (fica 1 ano).
-- Dados de saúde nunca vão para o registro: só o nome dos campos mudados.
-- =====================================================================

create table if not exists public.registros (
  id bigserial primary key,
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  perfil_id uuid references public.perfis (id) on delete set null,   -- quem fez
  acao text not null,                                                -- ex.: 'escalas.insert'
  alvo_perfil uuid references public.perfis (id) on delete set null, -- de quem é o dado (ex.: ficha)
  descricao text,
  detalhe jsonb,
  created_at timestamptz not null default now()
);

create index if not exists registros_terreiro_idx on public.registros (terreiro_id, created_at desc);
create index if not exists registros_pessoa_idx on public.registros (terreiro_id, perfil_id, created_at desc);

create or replace function public.registrar(p_terreiro uuid, p_acao text, p_descricao text,
                                            p_alvo uuid default null, p_detalhe jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.registros (terreiro_id, perfil_id, acao, alvo_perfil, descricao, detalhe)
  select p_terreiro, auth.uid(), p_acao, p_alvo, p_descricao, p_detalhe
  where p_terreiro is not null and auth.uid() is not null
$$;

-- Gatilho genérico: registra criação, alteração e exclusão nas tabelas da casa.
create or replace function public.registrar_mudanca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_novo jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_velho jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_linha jsonb := coalesce(v_novo, v_velho);
  v_terreiro uuid;
  v_campos text[];
  v_nome text;
begin
  if auth.uid() is null then
    return null;   -- tarefas automáticas do sistema não entram no registro
  end if;
  v_terreiro := (v_linha ->> 'terreiro_id')::uuid;
  if tg_table_name = 'obrigacao_itens' then
    -- Item de lista privada não vai para o registro.
    select case when visibilidade = 'privado' then null else terreiro_id end into v_terreiro
    from public.obrigacoes where id = (v_linha ->> 'obrigacao_id')::uuid;
  end if;
  if v_terreiro is null then
    return null;
  end if;
  -- Coisas "só minhas" (ponto privado, lista privada) não aparecem para o zelador.
  if v_linha ->> 'visibilidade' = 'privado' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(k) into v_campos
    from jsonb_object_keys(v_novo) k
    where v_novo -> k is distinct from v_velho -> k
      and k not in ('atualizado_em', 'updated_at');
    if v_campos is null then
      return null;
    end if;
  end if;
  v_nome := coalesce(v_linha ->> 'titulo', v_linha ->> 'nome', v_linha ->> 'nome_popular');
  insert into public.registros (terreiro_id, perfil_id, acao, alvo_perfil, descricao, detalhe)
  values (v_terreiro, auth.uid(), tg_table_name || '.' || lower(tg_op),
          (v_linha ->> 'perfil_id')::uuid, v_nome,
          jsonb_strip_nulls(jsonb_build_object(
            'campos', v_campos,
            'status', v_novo ->> 'status',
            'quantidade', v_linha ->> 'quantidade',
            'tipo', v_linha ->> 'tipo',
            'id', v_linha ->> 'id')));
  return null;
end $$;

-- O app avisa quando a pessoa abre o app numa casa (no máximo 1 registro a cada 6 horas).
create or replace function public.registrar_acesso(p_terreiro uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_membro_de(p_terreiro) then
    return;
  end if;
  if not exists (select 1 from public.registros
                 where terreiro_id = p_terreiro and perfil_id = auth.uid() and acao = 'app.aberto'
                   and created_at > now() - interval '6 hours') then
    perform public.registrar(p_terreiro, 'app.aberto', 'Abriu o app');
  end if;
end $$;

alter table public.registros enable row level security;
revoke all on public.registros from anon, authenticated;
grant select on public.registros to authenticated;
grant select, insert, delete on public.registros to service_role;
drop policy if exists registros_ler on public.registros;
create policy registros_ler on public.registros for select to authenticated
  using (public.eh_zelador_de(terreiro_id));

-- =====================================================================
-- 3. FICHA DO FILHO (uma por casa)
--
-- Quem vê: o próprio filho, o zelador e quem ele autorizar ("fichas").
-- Irmãos nunca veem a ficha uns dos outros.
-- Saúde (alergias, remédios...) só o próprio filho edita;
-- a parte espiritual (orixás, guias...) o filho e o zelador editam.
-- Toda leitura feita por outra pessoa e toda edição ficam no registro.
-- =====================================================================

create table if not exists public.fichas (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  -- Pessoal
  nome_completo text,
  data_nascimento date,
  telefone text,
  contato_emergencia text,
  -- Saúde
  tipo_sanguineo text,
  alergias text,
  condicoes_saude text,
  medicamentos jsonb not null default '[]',   -- [{nome, dose, horarios, para_que, continuo, observacao}]
  -- Espiritual
  orixa_cabeca text,
  orixa_ajunto text,
  outros_orixas text,
  nome_de_santo text,
  data_iniciacao date,
  guias text,
  mestres text,
  entidades text,
  observacoes text,
  -- Controle
  consentimento_em timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id) on delete set null,
  primary key (perfil_id, terreiro_id)
);

create index if not exists fichas_terreiro_idx on public.fichas (terreiro_id);

-- Abre a ficha (a própria ou, com permissão, a de um filho da casa)
create or replace function public.abrir_ficha(p_perfil uuid, p_terreiro uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ficha jsonb;
begin
  if p_perfil = auth.uid() then
    if not exists (select 1 from public.membros where perfil_id = auth.uid() and terreiro_id = p_terreiro) then
      raise exception 'Você não é desta casa';
    end if;
  elsif not public.tem_permissao(p_terreiro, 'fichas')
        or not exists (select 1 from public.membros where perfil_id = p_perfil and terreiro_id = p_terreiro) then
    raise exception 'Você não tem permissão para ver esta ficha';
  end if;
  select to_jsonb(f) into v_ficha from public.fichas f where perfil_id = p_perfil and terreiro_id = p_terreiro;
  if p_perfil <> auth.uid() then
    perform public.registrar(p_terreiro, 'ficha.vista', 'Abriu a ficha', p_perfil);
  end if;
  return v_ficha;
end $$;

create or replace function public.salvar_ficha(p_perfil uuid, p_terreiro uuid, p_dados jsonb, p_consentimento boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_proprio boolean := p_perfil = auth.uid();
  v_atual public.fichas%rowtype;
  v_saude text[] := array['nome_completo', 'data_nascimento', 'telefone', 'contato_emergencia',
                          'tipo_sanguineo', 'alergias', 'condicoes_saude', 'medicamentos'];
  v_espiritual text[] := array['orixa_cabeca', 'orixa_ajunto', 'outros_orixas', 'nome_de_santo',
                               'data_iniciacao', 'guias', 'mestres', 'entidades', 'observacoes'];
  v_campos text[];
  v_d jsonb := coalesce(p_dados, '{}');
begin
  if v_proprio then
    if not public.eh_membro_de(p_terreiro) then
      raise exception 'Você não é desta casa';
    end if;
  elsif not public.eh_zelador_de(p_terreiro)
        or not exists (select 1 from public.membros where perfil_id = p_perfil and terreiro_id = p_terreiro) then
    raise exception 'Somente o próprio filho ou o zelador edita a ficha';
  end if;

  select * into v_atual from public.fichas where perfil_id = p_perfil and terreiro_id = p_terreiro;
  if v_proprio and v_atual.consentimento_em is null and not coalesce(p_consentimento, false) then
    raise exception 'Para salvar a ficha, marque que você concorda em guardar estes dados';
  end if;
  -- O zelador só mexe na parte espiritual: tira do pacote o que for pessoal ou de saúde.
  if not v_proprio then
    v_d := v_d - v_saude;
  end if;

  insert into public.fichas (perfil_id, terreiro_id, consentimento_em)
  values (p_perfil, p_terreiro, case when v_proprio then now() end)
  on conflict (perfil_id, terreiro_id) do nothing;

  update public.fichas f set
    nome_completo      = case when v_d ? 'nome_completo' then nullif(trim(v_d ->> 'nome_completo'), '') else f.nome_completo end,
    data_nascimento    = case when v_d ? 'data_nascimento' then nullif(v_d ->> 'data_nascimento', '')::date else f.data_nascimento end,
    telefone           = case when v_d ? 'telefone' then nullif(trim(v_d ->> 'telefone'), '') else f.telefone end,
    contato_emergencia = case when v_d ? 'contato_emergencia' then nullif(trim(v_d ->> 'contato_emergencia'), '') else f.contato_emergencia end,
    tipo_sanguineo     = case when v_d ? 'tipo_sanguineo' then nullif(trim(v_d ->> 'tipo_sanguineo'), '') else f.tipo_sanguineo end,
    alergias           = case when v_d ? 'alergias' then nullif(trim(v_d ->> 'alergias'), '') else f.alergias end,
    condicoes_saude    = case when v_d ? 'condicoes_saude' then nullif(trim(v_d ->> 'condicoes_saude'), '') else f.condicoes_saude end,
    medicamentos       = case when v_d ? 'medicamentos' and jsonb_typeof(v_d -> 'medicamentos') = 'array' then v_d -> 'medicamentos' else f.medicamentos end,
    orixa_cabeca       = case when v_d ? 'orixa_cabeca' then nullif(trim(v_d ->> 'orixa_cabeca'), '') else f.orixa_cabeca end,
    orixa_ajunto       = case when v_d ? 'orixa_ajunto' then nullif(trim(v_d ->> 'orixa_ajunto'), '') else f.orixa_ajunto end,
    outros_orixas      = case when v_d ? 'outros_orixas' then nullif(trim(v_d ->> 'outros_orixas'), '') else f.outros_orixas end,
    nome_de_santo      = case when v_d ? 'nome_de_santo' then nullif(trim(v_d ->> 'nome_de_santo'), '') else f.nome_de_santo end,
    data_iniciacao     = case when v_d ? 'data_iniciacao' then nullif(v_d ->> 'data_iniciacao', '')::date else f.data_iniciacao end,
    guias              = case when v_d ? 'guias' then nullif(trim(v_d ->> 'guias'), '') else f.guias end,
    mestres            = case when v_d ? 'mestres' then nullif(trim(v_d ->> 'mestres'), '') else f.mestres end,
    entidades          = case when v_d ? 'entidades' then nullif(trim(v_d ->> 'entidades'), '') else f.entidades end,
    observacoes        = case when v_d ? 'observacoes' then nullif(trim(v_d ->> 'observacoes'), '') else f.observacoes end,
    consentimento_em   = coalesce(f.consentimento_em, case when v_proprio then now() end),
    atualizado_em      = now(),
    atualizado_por     = auth.uid()
  where f.perfil_id = p_perfil and f.terreiro_id = p_terreiro;

  -- Registro: só os nomes dos campos que mudaram, nunca os valores.
  select array_agg(k) into v_campos
  from jsonb_object_keys(v_d) k
  where k = any (v_saude || v_espiritual)
    and (to_jsonb(v_atual) -> k) is distinct from
        (select to_jsonb(f) -> k from public.fichas f where f.perfil_id = p_perfil and f.terreiro_id = p_terreiro);
  if v_campos is not null then
    perform public.registrar(p_terreiro, 'ficha.editada',
                             case when v_proprio then 'Editou a própria ficha' else 'Editou a ficha' end,
                             p_perfil, jsonb_build_object('campos', v_campos));
  end if;
end $$;

-- Copia a ficha de outra casa da mesma pessoa (para não digitar tudo de novo)
create or replace function public.copiar_minha_ficha(p_de uuid, p_para uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_origem jsonb;
begin
  if not public.eh_membro_de(p_para) then
    raise exception 'Você não é desta casa';
  end if;
  select to_jsonb(f) - array['perfil_id', 'terreiro_id', 'consentimento_em', 'atualizado_em', 'atualizado_por']
    into v_origem
  from public.fichas f where perfil_id = auth.uid() and terreiro_id = p_de;
  if v_origem is null then
    raise exception 'Não há ficha na outra casa';
  end if;
  perform public.salvar_ficha(auth.uid(), p_para, v_origem, true);
end $$;

-- Lista de fichas da casa (zelador e autorizados), para a tela de fichas e relatórios.
create or replace function public.listar_fichas(p_terreiro uuid)
returns table (perfil_id uuid, apelido text, preenchida boolean, data_nascimento date, orixa_cabeca text,
               orixa_ajunto text, nome_de_santo text, data_iniciacao date, alergias text, condicoes_saude text,
               remedios_continuos integer, total_remedios integer, atualizado_em timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_permissao(p_terreiro, 'fichas') then
    raise exception 'Você não tem permissão para ver as fichas';
  end if;
  perform public.registrar(p_terreiro, 'fichas.listadas', 'Abriu a lista de fichas');
  return query
  select m.perfil_id, p.apelido, f.perfil_id is not null, f.data_nascimento, f.orixa_cabeca,
         f.orixa_ajunto, f.nome_de_santo, f.data_iniciacao, f.alergias, f.condicoes_saude,
         coalesce((select count(*)::int from jsonb_array_elements(f.medicamentos) r where (r ->> 'continuo')::boolean), 0),
         coalesce(jsonb_array_length(f.medicamentos), 0),
         f.atualizado_em
  from public.membros m
  join public.perfis p on p.id = m.perfil_id
  left join public.fichas f on f.perfil_id = m.perfil_id and f.terreiro_id = m.terreiro_id
  where m.terreiro_id = p_terreiro and m.aprovado
  order by p.apelido;
end $$;

alter table public.fichas enable row level security;
revoke all on public.fichas from anon, authenticated;
grant select, insert, update, delete on public.fichas to service_role;
-- Sem acesso direto: tudo passa pelas funções acima (que conferem e registram).

-- =====================================================================
-- 4. FUNÇÕES / OBRIGAÇÕES COM ITENS DE TODO TIPO
--
-- Itens podem ser folhas, bichos, sementes, velas... com quantidade.
-- Os filhos se oferecem para levar ("eu levo 2"), e o zelador (ou quem
-- ele autorizar) também distribui: escolhe o filho, o item e a quantidade.
-- =====================================================================

alter table public.obrigacoes add column if not exists filho_id uuid references public.perfis (id) on delete set null;

alter table public.obrigacao_itens alter column folha_id drop not null;
alter table public.obrigacao_itens add column if not exists nome text;
alter table public.obrigacao_itens add column if not exists categoria text not null default 'folha';
alter table public.obrigacao_itens add column if not exists quantidade_total numeric(12, 2);
alter table public.obrigacao_itens add column if not exists unidade text;
alter table public.obrigacao_itens add column if not exists aberto boolean not null default true;
alter table public.obrigacao_itens drop constraint if exists obrigacao_itens_tem_nome;
alter table public.obrigacao_itens add constraint obrigacao_itens_tem_nome check (folha_id is not null or nome is not null);

create table if not exists public.item_contribuicoes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.obrigacao_itens (id) on delete cascade,
  obrigacao_id uuid not null references public.obrigacoes (id) on delete cascade,
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  quantidade numeric(12, 2) not null default 1 check (quantidade > 0),
  status text not null default 'combinado' check (status in ('combinado', 'entregue')),
  atribuido_por uuid references public.perfis (id) on delete set null,   -- vazio = o filho se ofereceu
  entregue_em timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, perfil_id)
);

create index if not exists contribuicoes_obrigacao_idx on public.item_contribuicoes (obrigacao_id);
create index if not exists contribuicoes_terreiro_idx on public.item_contribuicoes (terreiro_id, perfil_id);

-- Quem organiza a função: quem criou, a equipe ou quem tem a permissão "funcoes"
create or replace function public.organiza_obrigacao(p_obrigacao uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.obrigacoes o
                 where o.id = p_obrigacao
                   and (o.criado_por = auth.uid()
                        or (o.visibilidade = 'terreiro'
                            and (public.eh_equipe_de(o.terreiro_id) or public.tem_permissao(o.terreiro_id, 'funcoes')))))
$$;

-- Itens: quem organiza também pode adicionar e remover
drop policy if exists itens_criar on public.obrigacao_itens;
create policy itens_criar on public.obrigacao_itens for insert to authenticated
  with check (public.posso_editar_obrigacao(obrigacao_id) or public.organiza_obrigacao(obrigacao_id));
drop policy if exists itens_apagar on public.obrigacao_itens;
create policy itens_apagar on public.obrigacao_itens for delete to authenticated
  using (public.posso_editar_obrigacao(obrigacao_id) or public.organiza_obrigacao(obrigacao_id));

-- Quanto ainda cabe num item para esta pessoa (vazio = item sem quantidade definida).
-- Trava a linha do item: dois filhos marcando ao mesmo tempo não passam do total.
create or replace function public.vaga_no_item(p_item uuid, p_perfil uuid) returns numeric
language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric;
  v_outros numeric;
begin
  select quantidade_total into v_total from public.obrigacao_itens where id = p_item for update;
  if v_total is null then
    return null;
  end if;
  select coalesce(sum(quantidade), 0) into v_outros
  from public.item_contribuicoes where item_id = p_item and perfil_id <> p_perfil;
  return greatest(v_total - v_outros, 0);
end $$;

-- Números no jeito brasileiro: 2 → "2"; 2,5 → "2,5"; dinheiro → "R$ 70,00"
create or replace function public.texto_quantidade(p_quantidade numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(regexp_replace(to_char(p_quantidade, 'FM999999990.99'), '\.$', ''), '.', ',')
$$;

create or replace function public.texto_reais(p_valor numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',')
$$;

create or replace function public.contribuir_item(p_item uuid, p_quantidade numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.obrigacao_itens%rowtype;
  v_ob public.obrigacoes%rowtype;
  v_vaga numeric;
begin
  select * into v_item from public.obrigacao_itens where id = p_item;
  select * into v_ob from public.obrigacoes where id = v_item.obrigacao_id;
  if not found or v_ob.visibilidade <> 'terreiro' or not public.eh_membro_de(v_ob.terreiro_id) then
    raise exception 'Item não encontrado';
  end if;
  if not v_item.aberto and not public.organiza_obrigacao(v_ob.id) then
    raise exception 'Este item é distribuído pelo zelador';
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    raise exception 'Informe a quantidade';
  end if;
  v_vaga := public.vaga_no_item(p_item, auth.uid());
  if v_vaga is not null and p_quantidade > v_vaga then
    raise exception '%', case when v_vaga = 0 then 'Este item já está completo'
                              else 'Só faltam ' || public.texto_quantidade(v_vaga) || coalesce(' ' || v_item.unidade, '') || ' deste item' end;
  end if;
  insert into public.item_contribuicoes (item_id, obrigacao_id, terreiro_id, perfil_id, quantidade)
  values (p_item, v_ob.id, v_ob.terreiro_id, auth.uid(), p_quantidade)
  on conflict (item_id, perfil_id) do update set quantidade = excluded.quantidade;
end $$;

create or replace function public.atribuir_item(p_item uuid, p_perfil uuid, p_quantidade numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.obrigacao_itens%rowtype;
  v_ob public.obrigacoes%rowtype;
  v_vaga numeric;
begin
  select * into v_item from public.obrigacao_itens where id = p_item;
  select * into v_ob from public.obrigacoes where id = v_item.obrigacao_id;
  if not found or v_ob.visibilidade <> 'terreiro' or not public.organiza_obrigacao(v_ob.id) then
    raise exception 'Somente quem organiza a função distribui os itens';
  end if;
  if not exists (select 1 from public.membros where perfil_id = p_perfil and terreiro_id = v_ob.terreiro_id and aprovado) then
    raise exception 'Esta pessoa não é da casa';
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    raise exception 'Informe a quantidade';
  end if;
  v_vaga := public.vaga_no_item(p_item, p_perfil);
  if v_vaga is not null and p_quantidade > v_vaga then
    raise exception '%', case when v_vaga = 0 then 'Este item já está completo'
                              else 'Só faltam ' || public.texto_quantidade(v_vaga) || coalesce(' ' || v_item.unidade, '') || ' deste item' end;
  end if;
  insert into public.item_contribuicoes (item_id, obrigacao_id, terreiro_id, perfil_id, quantidade, atribuido_por)
  values (p_item, v_ob.id, v_ob.terreiro_id, p_perfil, p_quantidade, auth.uid())
  on conflict (item_id, perfil_id) do update set quantidade = excluded.quantidade, atribuido_por = auth.uid();

  if p_perfil <> auth.uid() then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    values (p_perfil, 'Você ficou com um item: ' || v_ob.nome,
            'Levar ' || public.texto_quantidade(p_quantidade) || coalesce(' ' || v_item.unidade, '') || ' de '
              || coalesce(v_item.nome, (select nome_popular from public.folhas where id = v_item.folha_id), 'item')
              || coalesce(' até ' || to_char(v_ob.data, 'DD/MM'), '') || '.',
            '#/obrigacoes/' || v_ob.id);
  end if;
end $$;

create or replace function public.marcar_entrega(p_contribuicao uuid, p_entregue boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.item_contribuicoes%rowtype;
begin
  select * into v from public.item_contribuicoes where id = p_contribuicao;
  if not found or (v.perfil_id <> auth.uid() and not public.organiza_obrigacao(v.obrigacao_id)) then
    raise exception 'Contribuição não encontrada';
  end if;
  update public.item_contribuicoes
     set status = case when p_entregue then 'entregue' else 'combinado' end,
         entregue_em = case when p_entregue then now() end
   where id = p_contribuicao;
end $$;

create or replace function public.desistir_item(p_contribuicao uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.item_contribuicoes%rowtype;
begin
  select * into v from public.item_contribuicoes where id = p_contribuicao;
  if not found then
    raise exception 'Contribuição não encontrada';
  end if;
  if not public.organiza_obrigacao(v.obrigacao_id)
     and (v.perfil_id <> auth.uid() or v.atribuido_por is not null) then
    raise exception 'Este item foi distribuído pelo zelador: fale com ele para trocar';
  end if;
  delete from public.item_contribuicoes where id = p_contribuicao;
end $$;

create or replace function public.atualizar_item_completo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.obrigacao_itens i
     set colhida = (select coalesce(sum(c.quantidade), 0) from public.item_contribuicoes c where c.item_id = i.id) >= i.quantidade_total
   where i.id = v_item and i.quantidade_total is not null;
  return null;
end $$;

drop trigger if exists item_completo on public.item_contribuicoes;
create trigger item_completo after insert or update or delete on public.item_contribuicoes
  for each row execute function public.atualizar_item_completo();

-- Itens que já passaram do total antes desta regra: ficam marcados como concluídos.
update public.obrigacao_itens i
   set colhida = true
 where i.quantidade_total is not null and not i.colhida
   and (select coalesce(sum(c.quantidade), 0) from public.item_contribuicoes c where c.item_id = i.id) >= i.quantidade_total;

alter table public.item_contribuicoes enable row level security;
revoke all on public.item_contribuicoes from anon, authenticated;
grant select on public.item_contribuicoes to authenticated;
grant select, insert, update, delete on public.item_contribuicoes to service_role;
drop policy if exists contribuicoes_ler on public.item_contribuicoes;
create policy contribuicoes_ler on public.item_contribuicoes for select to authenticated
  using (public.eh_membro_de(terreiro_id));

-- =====================================================================
-- 5. ESCALAS (limpeza, cozinha, portão...)
--
-- Modos: "todos" (toda a casa é convocada), "escolhidos" (o zelador
-- escolhe) ou "vagas" (precisa de N filhos: todos são avisados e os
-- primeiros que confirmarem ficam com as vagas).
-- =====================================================================

create table if not exists public.escalas (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  titulo text not null,
  descricao text,
  data date not null,
  hora time,
  local text,
  modo text not null check (modo in ('todos', 'escolhidos', 'vagas')),
  vagas integer check (vagas is null or vagas > 0),
  obrigacao_id uuid references public.obrigacoes (id) on delete set null,
  criado_por uuid references public.perfis (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists escalas_terreiro_idx on public.escalas (terreiro_id, data);

create table if not exists public.escala_pessoas (
  escala_id uuid not null references public.escalas (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  status text not null default 'convocado' check (status in ('convocado', 'confirmado', 'recusou')),
  presenca text check (presenca in ('presente', 'faltou')),
  respondeu_em timestamptz,
  created_at timestamptz not null default now(),
  primary key (escala_id, perfil_id)
);

create index if not exists escala_pessoas_terreiro_idx on public.escala_pessoas (terreiro_id, perfil_id);

create or replace function public.criar_escala(
  p_terreiro uuid, p_titulo text, p_descricao text, p_data date, p_hora time, p_local text,
  p_modo text, p_vagas integer, p_pessoas uuid[], p_obrigacao uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_quando text;
begin
  if not (public.eh_equipe_de(p_terreiro) or public.tem_permissao(p_terreiro, 'escalas')) then
    raise exception 'Somente o zelador ou quem ele autorizar cria escalas';
  end if;
  if coalesce(trim(p_titulo), '') = '' or p_data is null then
    raise exception 'Informe o nome e a data';
  end if;
  if p_modo = 'vagas' and coalesce(p_vagas, 0) <= 0 then
    raise exception 'Informe quantas pessoas são necessárias';
  end if;
  if p_modo = 'escolhidos' and coalesce(array_length(p_pessoas, 1), 0) = 0 then
    raise exception 'Escolha quem vai participar';
  end if;

  insert into public.escalas (terreiro_id, titulo, descricao, data, hora, local, modo, vagas, obrigacao_id, criado_por)
  values (p_terreiro, trim(p_titulo), nullif(trim(p_descricao), ''), p_data, p_hora, nullif(trim(p_local), ''),
          p_modo, case when p_modo = 'vagas' then p_vagas end, p_obrigacao, auth.uid())
  returning id into v_id;

  if p_modo = 'todos' then
    insert into public.escala_pessoas (escala_id, perfil_id, terreiro_id)
    select v_id, perfil_id, p_terreiro from public.membros where terreiro_id = p_terreiro and aprovado;
  elsif p_modo = 'escolhidos' then
    insert into public.escala_pessoas (escala_id, perfil_id, terreiro_id)
    select v_id, m.perfil_id, p_terreiro from public.membros m
    where m.terreiro_id = p_terreiro and m.aprovado and m.perfil_id = any (p_pessoas);
  end if;

  v_quando := to_char(p_data, 'DD/MM') || coalesce(' às ' || to_char(p_hora, 'HH24:MI'), '');
  if p_modo = 'vagas' then
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    select perfil_id, 'Precisamos de ' || p_vagas || ' filho(s): ' || trim(p_titulo),
           v_quando || '. Os primeiros que confirmarem ficam com as vagas.', '#/casa/escalas'
    from public.membros where terreiro_id = p_terreiro and aprovado and perfil_id <> auth.uid();
  else
    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    select perfil_id, 'Você foi convocado(a): ' || trim(p_titulo), v_quando || '. Confirme no app.', '#/casa/escalas'
    from public.escala_pessoas where escala_id = v_id and perfil_id <> auth.uid();
  end if;
  return v_id;
end $$;

-- O filho responde: vou / não vou. Nas escalas com vagas, quem chegar primeiro entra.
create or replace function public.responder_escala(p_escala uuid, p_vou boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v public.escalas%rowtype;
  v_confirmados integer;
begin
  select * into v from public.escalas where id = p_escala for update;   -- uma resposta por vez
  if not found or not public.eh_membro_de(v.terreiro_id) then
    raise exception 'Escala não encontrada';
  end if;
  if v.data < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Esta escala já passou';
  end if;

  if v.modo = 'vagas' then
    if not p_vou then
      delete from public.escala_pessoas where escala_id = p_escala and perfil_id = auth.uid();
      return 'saiu';
    end if;
    if exists (select 1 from public.escala_pessoas where escala_id = p_escala and perfil_id = auth.uid() and status = 'confirmado') then
      return 'confirmado';
    end if;
    select count(*) into v_confirmados from public.escala_pessoas where escala_id = p_escala and status = 'confirmado';
    if v_confirmados >= v.vagas then
      raise exception 'As vagas já foram preenchidas';
    end if;
    insert into public.escala_pessoas (escala_id, perfil_id, terreiro_id, status, respondeu_em)
    values (p_escala, auth.uid(), v.terreiro_id, 'confirmado', now())
    on conflict (escala_id, perfil_id) do update set status = 'confirmado', respondeu_em = now();
    if v_confirmados + 1 = v.vagas and v.criado_por is not null then
      insert into public.notificacoes (perfil_id, titulo, corpo, url)
      values (v.criado_por, 'Escala completa: ' || v.titulo, 'Todas as ' || v.vagas || ' vagas foram preenchidas.', '#/casa/escalas');
    end if;
    return 'confirmado';
  end if;

  update public.escala_pessoas
     set status = case when p_vou then 'confirmado' else 'recusou' end, respondeu_em = now()
   where escala_id = p_escala and perfil_id = auth.uid();
  if not found then
    raise exception 'Você não foi convocado(a) para esta escala';
  end if;
  return case when p_vou then 'confirmado' else 'recusou' end;
end $$;

-- Depois da escala: quem foi e quem faltou (vale para os relatórios)
create or replace function public.marcar_presenca(p_escala uuid, p_perfil uuid, p_presenca text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.escalas%rowtype;
begin
  select * into v from public.escalas where id = p_escala;
  if not found or not (public.eh_equipe_de(v.terreiro_id) or public.tem_permissao(v.terreiro_id, 'escalas')) then
    raise exception 'Somente o zelador ou quem ele autorizar marca presença';
  end if;
  if p_presenca is not null and p_presenca not in ('presente', 'faltou') then
    raise exception 'Presença inválida';
  end if;
  insert into public.escala_pessoas (escala_id, perfil_id, terreiro_id, status, presenca)
  values (p_escala, p_perfil, v.terreiro_id, 'confirmado', p_presenca)
  on conflict (escala_id, perfil_id) do update set presenca = excluded.presenca;
end $$;

create or replace function public.apagar_escala(p_escala uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.escalas e
  where e.id = p_escala and (public.eh_equipe_de(e.terreiro_id) or public.tem_permissao(e.terreiro_id, 'escalas'));
  if not found then
    raise exception 'Escala não encontrada';
  end if;
end $$;

alter table public.escalas enable row level security;
alter table public.escala_pessoas enable row level security;
revoke all on public.escalas, public.escala_pessoas from anon, authenticated;
grant select on public.escalas, public.escala_pessoas to authenticated;
grant select, insert, update, delete on public.escalas, public.escala_pessoas to service_role;
drop policy if exists escalas_ler on public.escalas;
create policy escalas_ler on public.escalas for select to authenticated using (public.eh_membro_de(terreiro_id));
drop policy if exists escala_pessoas_ler on public.escala_pessoas;
create policy escala_pessoas_ler on public.escala_pessoas for select to authenticated using (public.eh_membro_de(terreiro_id));

-- =====================================================================
-- 6. SENHAS DE ATENDIMENTO (giras de Umbanda e afins)
--
-- Na porta: anota o primeiro nome e entrega a senha 01, 02...
-- Na hora dos atendimentos: chama na ordem. Os nomes são apagados
-- sozinhos depois de 30 dias (fica só a contagem).
-- =====================================================================

create table if not exists public.senhas (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros (id) on delete cascade,
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  numero integer not null,
  nome text,
  status text not null default 'aguardando' check (status in ('aguardando', 'chamada', 'atendida', 'ausente')),
  chamada_em timestamptz,
  criado_por uuid references public.perfis (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (terreiro_id, data, numero)
);

create or replace function public.emitir_senha(p_terreiro uuid, p_nome text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_numero integer;
begin
  if not public.tem_permissao(p_terreiro, 'senhas') then
    raise exception 'Somente o zelador ou quem ele autorizar entrega senhas';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o primeiro nome';
  end if;
  perform pg_advisory_xact_lock(hashtext('senhas:' || p_terreiro::text || v_hoje::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.senhas where terreiro_id = p_terreiro and data = v_hoje;
  insert into public.senhas (terreiro_id, data, numero, nome, criado_por)
  values (p_terreiro, v_hoje, v_numero, initcap(split_part(trim(p_nome), ' ', 1)), auth.uid());
  return v_numero;
end $$;

-- Chama a próxima senha que ainda está aguardando
create or replace function public.chamar_proxima_senha(p_terreiro uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.senhas%rowtype;
begin
  if not public.tem_permissao(p_terreiro, 'senhas') then
    raise exception 'Somente o zelador ou quem ele autorizar chama as senhas';
  end if;
  select * into v from public.senhas
  where terreiro_id = p_terreiro and data = (now() at time zone 'America/Sao_Paulo')::date and status = 'aguardando'
  order by numero limit 1 for update skip locked;
  if not found then
    return null;
  end if;
  update public.senhas set status = 'chamada', chamada_em = now() where id = v.id;
  return jsonb_build_object('id', v.id, 'numero', v.numero, 'nome', v.nome);
end $$;

create or replace function public.marcar_senha(p_senha uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('aguardando', 'chamada', 'atendida', 'ausente') then
    raise exception 'Situação inválida';
  end if;
  update public.senhas s
     set status = p_status, chamada_em = case when p_status = 'chamada' then now() else s.chamada_em end
   where s.id = p_senha and public.tem_permissao(s.terreiro_id, 'senhas');
  if not found then
    raise exception 'Senha não encontrada';
  end if;
end $$;

alter table public.senhas enable row level security;
revoke all on public.senhas from anon, authenticated;
grant select on public.senhas to authenticated;
grant select, insert, update, delete on public.senhas to service_role;
drop policy if exists senhas_ler on public.senhas;
create policy senhas_ler on public.senhas for select to authenticated
  using (public.tem_permissao(terreiro_id, 'senhas'));

-- =====================================================================
-- 7. LEMBRETES DE PAGAMENTO (o zelador escolhe quando avisar)
-- =====================================================================

alter table public.financeiro_casa add column if not exists lembrete_dias integer[] not null default '{3,0}';
alter table public.financeiro_casa add column if not exists lembrar_atrasados boolean not null default true;
alter table public.financeiro_casa add column if not exists atraso_intervalo integer not null default 7;

create or replace function public.configurar_lembretes(p_terreiro uuid, p_dias integer[], p_atrasados boolean, p_intervalo integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_gestor_financeiro_de(p_terreiro) then
    raise exception 'Somente o zelador ou o contador configura os lembretes';
  end if;
  if exists (select 1 from unnest(coalesce(p_dias, '{}')) d where d < 0 or d > 30) then
    raise exception 'Os dias de aviso vão de 0 a 30';
  end if;
  insert into public.financeiro_casa (terreiro_id, lembrete_dias, lembrar_atrasados, atraso_intervalo)
  values (p_terreiro, coalesce(p_dias, '{}'), coalesce(p_atrasados, false), greatest(coalesce(p_intervalo, 7), 1))
  on conflict (terreiro_id) do update
    set lembrete_dias = excluded.lembrete_dias, lembrar_atrasados = excluded.lembrar_atrasados,
        atraso_intervalo = excluded.atraso_intervalo, atualizado_em = now();
end $$;

-- Geração das mensalidades sem conferir quem chama (uso interno do agendador)
create or replace function public.gerar_mensalidades(p_terreiro uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_config public.financeiro_casa%rowtype;
  v_mes date;
  v_nomes text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
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

create or replace function public.garantir_mensalidades(p_terreiro uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.eh_membro_de(p_terreiro) or public.sou_admin() then
    perform public.gerar_mensalidades(p_terreiro);
  end if;
end $$;

revoke execute on function public.gerar_mensalidades(uuid) from public, anon, authenticated;

create or replace function public.lembrar_pagamentos() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_casa record;
begin
  for v_casa in select f.* from public.financeiro_casa f where public.modulo_ligado(f.terreiro_id, 'financeiro') loop
    perform public.gerar_mensalidades(v_casa.terreiro_id);

    insert into public.notificacoes (perfil_id, titulo, corpo, url)
    select m.perfil_id,
           case when c.vencimento > v_hoje then 'Lembrete: ' || c.titulo
                when c.vencimento = v_hoje then 'Vence hoje: ' || c.titulo
                else 'Em atraso: ' || c.titulo end,
           case when c.vencimento >= v_hoje then 'Vencimento ' || to_char(c.vencimento, 'DD/MM') || '. Quando pagar, envie o comprovante pelo app.'
                else 'Venceu em ' || to_char(c.vencimento, 'DD/MM') || '. Se já pagou, envie o comprovante pelo app.' end,
           '#/casa/financeiro'
    from public.cobrancas c
    join public.membros m on m.terreiro_id = c.terreiro_id and m.aprovado
    where c.terreiro_id = v_casa.terreiro_id
      and (c.para_todos or exists (select 1 from public.cobranca_alvos a where a.cobranca_id = c.id and a.perfil_id = m.perfil_id))
      and (c.tipo = 'contribuicao'
           or (v_casa.cobra_mensalidade and not m.isento
               and (m.aprovado_em is null or date_trunc('month', m.aprovado_em)::date <= c.competencia)))
      and not exists (select 1 from public.pagamentos p
                      where p.cobranca_id = c.id and p.perfil_id = m.perfil_id
                        and p.status in ('informado', 'confirmado', 'isento'))
      and ((c.vencimento - v_hoje) = any (v_casa.lembrete_dias)
           or (v_casa.lembrar_atrasados and c.vencimento < v_hoje
               and (v_hoje - c.vencimento) % greatest(v_casa.atraso_intervalo, 1) = 0
               and c.vencimento > v_hoje - 120));
  end loop;
end $$;

-- =====================================================================
-- 8. LEMBRETES DIÁRIOS, ANIVERSÁRIOS E LIMPEZA
-- =====================================================================

create or replace function public.lembretes_diarios() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform public.lembrar_pagamentos();

  -- Escalas de amanhã: quem confirmou ou foi convocado
  insert into public.notificacoes (perfil_id, titulo, corpo, url)
  select ep.perfil_id, 'Amanhã você está na escala: ' || e.titulo,
         coalesce('Às ' || to_char(e.hora, 'HH24:MI'), 'Dia inteiro') || coalesce(' · ' || e.local, ''), '#/casa/escalas'
  from public.escalas e
  join public.escala_pessoas ep on ep.escala_id = e.id and ep.status in ('convocado', 'confirmado')
  where e.data = v_hoje + 1 and public.modulo_ligado(e.terreiro_id, 'escalas');

  -- Escalas com vagas sobrando, 2 dias antes: avisa de novo quem ainda não entrou
  insert into public.notificacoes (perfil_id, titulo, corpo, url)
  select m.perfil_id, 'Ainda faltam pessoas: ' || e.titulo,
         to_char(e.data, 'DD/MM') || '. Toque para pegar uma vaga.', '#/casa/escalas'
  from public.escalas e
  join public.membros m on m.terreiro_id = e.terreiro_id and m.aprovado
  where e.modo = 'vagas' and e.data = v_hoje + 2 and public.modulo_ligado(e.terreiro_id, 'escalas')
    and (select count(*) from public.escala_pessoas x where x.escala_id = e.id and x.status = 'confirmado') < e.vagas
    and not exists (select 1 from public.escala_pessoas x where x.escala_id = e.id and x.perfil_id = m.perfil_id);

  -- Aniversariantes do dia: avisa o zelador
  insert into public.notificacoes (perfil_id, titulo, corpo, url)
  select z.perfil_id, '🎂 Aniversário de ' || p.apelido, 'Hoje é aniversário de ' || p.apelido || '.', '#/casa/relatorios'
  from public.fichas f
  join public.membros m on m.perfil_id = f.perfil_id and m.terreiro_id = f.terreiro_id and m.aprovado
  join public.perfis p on p.id = f.perfil_id
  join public.membros z on z.terreiro_id = f.terreiro_id and z.aprovado and z.papel = 'zelador' and z.perfil_id <> f.perfil_id
  where f.data_nascimento is not null
    and extract(month from f.data_nascimento) = extract(month from v_hoje)
    and extract(day from f.data_nascimento) = extract(day from v_hoje);

  -- Privacidade: nomes das senhas somem depois de 30 dias; registros depois de 1 ano
  update public.senhas set nome = null where nome is not null and data < v_hoje - 30;
  delete from public.registros where created_at < now() - interval '1 year';
end $$;

create extension if not exists pg_cron;
select cron.unschedule('lembretes-diarios') where exists (select 1 from cron.job where jobname = 'lembretes-diarios');
select cron.schedule('lembretes-diarios', '0 11 * * *', 'select public.lembretes_diarios()');

-- =====================================================================
-- 8b. NÚMEROS PRONTOS PARA OS RELATÓRIOS DO ZELADOR
-- (contas feitas no banco: não dependem de baixar milhares de linhas)
-- =====================================================================

create or replace function public.uso_do_app(p_terreiro uuid)
returns table (perfil_id uuid, ultimo_acesso timestamptz, acessos_30d integer, acoes_30d integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_zelador_de(p_terreiro) then
    raise exception 'Somente o zelador vê os relatórios';
  end if;
  return query
  select m.perfil_id,
         max(r.created_at) filter (where r.acao = 'app.aberto'),
         (count(*) filter (where r.acao = 'app.aberto' and r.created_at > now() - interval '30 days'))::integer,
         (count(*) filter (where r.acao <> 'app.aberto' and r.created_at > now() - interval '30 days'))::integer
  from public.membros m
  left join public.registros r on r.terreiro_id = m.terreiro_id and r.perfil_id = m.perfil_id
  where m.terreiro_id = p_terreiro and m.aprovado
  group by m.perfil_id;
end $$;

create or replace function public.resumo_senhas(p_terreiro uuid)
returns table (data date, total integer, atendidas integer, ausentes integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_permissao(p_terreiro, 'senhas') then
    raise exception 'Sem permissão';
  end if;
  return query
  select s.data, count(*)::integer,
         (count(*) filter (where s.status = 'atendida'))::integer,
         (count(*) filter (where s.status = 'ausente'))::integer
  from public.senhas s
  where s.terreiro_id = p_terreiro
  group by s.data
  order by s.data desc
  limit 20;
end $$;

revoke execute on function public.uso_do_app(uuid), public.resumo_senhas(uuid) from public, anon;
grant execute on function public.uso_do_app(uuid), public.resumo_senhas(uuid) to authenticated;

-- =====================================================================
-- 9. O QUE ENTRA NO REGISTRO DE ATIVIDADES
-- =====================================================================

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['pagamentos', 'cobrancas', 'eventos', 'materiais', 'movimentos_material',
                                  'obrigacoes', 'obrigacao_itens', 'item_contribuicoes', 'escalas',
                                  'escala_pessoas', 'pontos', 'membros', 'casa_config', 'financeiro_casa'] loop
    execute format('drop trigger if exists registrar on public.%I', v_tabela);
    execute format('create trigger registrar after insert or update or delete on public.%I
                    for each row execute function public.registrar_mudanca()', v_tabela);
  end loop;
end $$;

-- =====================================================================
-- 10. QUEM PODE CHAMAR AS FUNÇÕES
-- =====================================================================

revoke execute on function
  public.tem_permissao(uuid, text), public.definir_permissoes(uuid, uuid, text[]),
  public.modulo_ligado(uuid, text), public.configurar_modulos(uuid, jsonb), public.apelidos_da_casa(uuid),
  public.registrar(uuid, text, text, uuid, jsonb), public.registrar_acesso(uuid),
  public.abrir_ficha(uuid, uuid), public.salvar_ficha(uuid, uuid, jsonb, boolean),
  public.copiar_minha_ficha(uuid, uuid), public.listar_fichas(uuid),
  public.organiza_obrigacao(uuid), public.contribuir_item(uuid, numeric), public.atribuir_item(uuid, uuid, numeric),
  public.marcar_entrega(uuid, boolean), public.desistir_item(uuid),
  public.criar_escala(uuid, text, text, date, time, text, text, integer, uuid[], uuid),
  public.responder_escala(uuid, boolean), public.marcar_presenca(uuid, uuid, text), public.apagar_escala(uuid),
  public.emitir_senha(uuid, text), public.chamar_proxima_senha(uuid), public.marcar_senha(uuid, text),
  public.configurar_lembretes(uuid, integer[], boolean, integer),
  public.lembrar_pagamentos(), public.lembretes_diarios()
  from public, anon;
revoke execute on function public.vaga_no_item(uuid, uuid), public.atualizar_item_completo() from public, anon, authenticated;
revoke execute on function public.registrar(uuid, text, text, uuid, jsonb), public.lembrar_pagamentos(),
  public.lembretes_diarios() from authenticated;
grant execute on function
  public.tem_permissao(uuid, text), public.definir_permissoes(uuid, uuid, text[]),
  public.modulo_ligado(uuid, text), public.configurar_modulos(uuid, jsonb), public.apelidos_da_casa(uuid),
  public.registrar_acesso(uuid),
  public.abrir_ficha(uuid, uuid), public.salvar_ficha(uuid, uuid, jsonb, boolean),
  public.copiar_minha_ficha(uuid, uuid), public.listar_fichas(uuid),
  public.organiza_obrigacao(uuid), public.contribuir_item(uuid, numeric), public.atribuir_item(uuid, uuid, numeric),
  public.marcar_entrega(uuid, boolean), public.desistir_item(uuid),
  public.criar_escala(uuid, text, text, date, time, text, text, integer, uuid[], uuid),
  public.responder_escala(uuid, boolean), public.marcar_presenca(uuid, uuid, text), public.apagar_escala(uuid),
  public.emitir_senha(uuid, text), public.chamar_proxima_senha(uuid), public.marcar_senha(uuid, text),
  public.configurar_lembretes(uuid, integer[], boolean, integer)
  to authenticated;
