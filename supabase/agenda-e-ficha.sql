-- =====================================================================
-- Cada coisa na sua casa, agenda geral e ficha configurável (v0.17)
--
-- Rode depois de fichas-escalas-senhas.sql. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Funções e obrigações: cada uma pertence à casa onde foi criada.
--    Quem é de várias casas lê as de todas (para a agenda geral), e o app
--    mostra na tela de cada casa só as daquela casa.
-- ---------------------------------------------------------------------

drop policy if exists obrigacoes_ler on public.obrigacoes;
create policy obrigacoes_ler on public.obrigacoes for select to authenticated
  using (public.eh_membro_de(terreiro_id)
         and (criado_por = auth.uid() or visibilidade = 'terreiro'));

-- ---------------------------------------------------------------------
-- 2. Ficha configurável por casa
--    casa_config.ficha = {"ocultos": ["mestres", ...],
--                         "extras": [{"id": "x1", "titulo": "...", "ajuda": "...",
--                                     "secao": "pessoal|saude|espiritual",
--                                     "tipo": "texto|longo|data|simnao"}]}
--    fichas.extras = {"x1": "valor", ...}
-- ---------------------------------------------------------------------

alter table public.casa_config add column if not exists ficha jsonb not null default '{}';
alter table public.fichas add column if not exists extras jsonb not null default '{}';

create or replace function public.configurar_ficha(p_terreiro uuid, p_ficha jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_extras jsonb := coalesce(p_ficha -> 'extras', '[]');
begin
  if not public.eh_zelador_de(p_terreiro) then
    raise exception 'Somente o zelador configura a ficha da casa';
  end if;
  if jsonb_typeof(v_extras) <> 'array' or jsonb_array_length(v_extras) > 30 then
    raise exception 'No máximo 30 campos próprios';
  end if;
  if exists (select 1 from jsonb_array_elements(v_extras) e
             where coalesce(trim(e ->> 'titulo'), '') = ''
                or coalesce(e ->> 'id', '') = ''
                or coalesce(e ->> 'secao', '') not in ('pessoal', 'saude', 'espiritual')
                or coalesce(e ->> 'tipo', '') not in ('texto', 'longo', 'data', 'simnao')) then
    raise exception 'Cada campo precisa de um título, uma parte da ficha e um tipo';
  end if;
  insert into public.casa_config (terreiro_id, ficha, atualizado_em)
  values (p_terreiro, jsonb_build_object('ocultos', coalesce(p_ficha -> 'ocultos', '[]'), 'extras', v_extras), now())
  on conflict (terreiro_id) do update set ficha = excluded.ficha, atualizado_em = now();
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
  v_extras_cfg jsonb;
  v_extras jsonb;
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

  -- Campos criados pela casa: só os que existem na configuração; o zelador só altera os da parte espiritual.
  if jsonb_typeof(v_d -> 'extras') = 'object' then
    select coalesce(ficha -> 'extras', '[]') into v_extras_cfg from public.casa_config where terreiro_id = p_terreiro;
    select coalesce(jsonb_object_agg(e.key, to_jsonb(left(nullif(trim(e.value #>> '{}'), ''), 1000))), '{}')
      into v_extras
    from jsonb_each(v_d -> 'extras') e
    where exists (select 1 from jsonb_array_elements(coalesce(v_extras_cfg, '[]')) c
                  where c ->> 'id' = e.key and (v_proprio or c ->> 'secao' = 'espiritual'));
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
    extras             = case when v_extras is not null then jsonb_strip_nulls(coalesce(f.extras, '{}') || v_extras) else f.extras end,
    consentimento_em   = coalesce(f.consentimento_em, case when v_proprio then now() end),
    atualizado_em      = now(),
    atualizado_por     = auth.uid()
  where f.perfil_id = p_perfil and f.terreiro_id = p_terreiro;

  -- Registro: só os nomes dos campos que mudaram, nunca os valores.
  select array_agg(k) into v_campos
  from jsonb_object_keys(v_d) k
  where k = any (v_saude || v_espiritual || array['extras'])
    and (to_jsonb(v_atual) -> k) is distinct from
        (select to_jsonb(f) -> k from public.fichas f where f.perfil_id = p_perfil and f.terreiro_id = p_terreiro);
  if v_campos is not null then
    perform public.registrar(p_terreiro, 'ficha.editada',
                             case when v_proprio then 'Editou a própria ficha' else 'Editou a ficha' end,
                             p_perfil, jsonb_build_object('campos', v_campos));
  end if;
end $$;

-- Copiar a ficha de outra casa: os campos próprios de cada casa não são copiados.
create or replace function public.copiar_minha_ficha(p_de uuid, p_para uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_origem jsonb;
begin
  if not public.eh_membro_de(p_para) then
    raise exception 'Você não é desta casa';
  end if;
  select to_jsonb(f) - array['perfil_id', 'terreiro_id', 'consentimento_em', 'atualizado_em', 'atualizado_por', 'extras']
    into v_origem
  from public.fichas f where perfil_id = auth.uid() and terreiro_id = p_de;
  if v_origem is null then
    raise exception 'Não há ficha na outra casa';
  end if;
  perform public.salvar_ficha(auth.uid(), p_para, v_origem, true);
end $$;

-- ---------------------------------------------------------------------
-- 3. Mensalidades acompanham a configuração
--    Mudou o início da cobrança para depois? As mensalidades anteriores que
--    ninguém pagou somem. Mudou o dia de vencimento? As do mês atual em diante
--    que ninguém pagou passam a vencer no dia novo.
-- ---------------------------------------------------------------------

create or replace function public.configurar_financeiro(
  p_terreiro uuid, p_cobra boolean, p_valor numeric, p_dia integer, p_instrucoes text, p_inicio date
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_inicio date := date_trunc('month', coalesce(p_inicio, now()))::date;
  v_dia integer := coalesce(p_dia, 10);
begin
  if not public.eh_gestor_financeiro_de(p_terreiro) then
    raise exception 'Somente o zelador ou o contador da casa pode configurar';
  end if;
  insert into public.financeiro_casa (terreiro_id, cobra_mensalidade, valor_padrao, dia_vencimento, instrucoes, inicio, atualizado_em)
  values (p_terreiro, p_cobra, coalesce(p_valor, 0), v_dia, nullif(trim(p_instrucoes), ''), v_inicio, now())
  on conflict (terreiro_id) do update
    set cobra_mensalidade = excluded.cobra_mensalidade, valor_padrao = excluded.valor_padrao,
        dia_vencimento = excluded.dia_vencimento, instrucoes = excluded.instrucoes,
        inicio = excluded.inicio, atualizado_em = now();

  delete from public.cobrancas c
  where c.terreiro_id = p_terreiro and c.tipo = 'mensalidade' and c.competencia < v_inicio
    and not exists (select 1 from public.pagamentos p where p.cobranca_id = c.id);

  update public.cobrancas c
     set vencimento = c.competencia + (v_dia - 1)
   where c.terreiro_id = p_terreiro and c.tipo = 'mensalidade'
     and c.competencia >= date_trunc('month', now())::date
     and c.vencimento <> c.competencia + (v_dia - 1)
     and not exists (select 1 from public.pagamentos p where p.cobranca_id = c.id);
end $$;

-- Arruma as casas que já mudaram o início: mensalidades antes do início, sem pagamento, saem.
delete from public.cobrancas c
using public.financeiro_casa f
where f.terreiro_id = c.terreiro_id and c.tipo = 'mensalidade' and c.competencia < f.inicio
  and not exists (select 1 from public.pagamentos p where p.cobranca_id = c.id);

revoke execute on function public.configurar_ficha(uuid, jsonb) from public, anon;
grant execute on function public.configurar_ficha(uuid, jsonb) to authenticated;
