-- Ajuste: números e valores no formato brasileiro nos avisos (v0.16)

-- Números no jeito brasileiro: 2 → "2"; 2,5 → "2,5"; dinheiro → "R$ 70,00"
create or replace function public.texto_quantidade(p_quantidade numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(regexp_replace(to_char(p_quantidade, 'FM999999990.99'), '\.$', ''), '.', ',')
$$;

create or replace function public.texto_reais(p_valor numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',')
$$;

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

revoke execute on function public.texto_quantidade(numeric), public.texto_reais(numeric) from public, anon;

select public.texto_quantidade(1) as um, public.texto_quantidade(2.5) as dois_e_meio, public.texto_reais(70) as setenta;
