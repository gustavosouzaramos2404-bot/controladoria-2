/* ==========================================================================
   20261027120000_equipe.sql
   Gestão da equipe pelo próprio sistema (tela Configurações), sem SQL:
   - listar_equipe(): contas criadas e quem já foi liberado (só admin);
   - liberar_membro(e-mail, papel): libera (ou muda o papel de) uma conta
     já criada na tela de login;
   - remover_membro(user_id): tira o acesso (a conta continua existindo).
   Só administradores executam; ninguém remove o próprio acesso nem o
   último administrador.
   ========================================================================== */

create function public.listar_equipe()
returns table (user_id uuid, email text, nome text, papel text, confirmado boolean, criado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not controle.eh_admin() then
    raise exception 'Acesso negado: só administradores veem a equipe.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(m.nome, u.raw_user_meta_data ->> 'nome'), m.papel,
           u.email_confirmed_at is not null, u.created_at
      from auth.users u
      left join public.membros m on m.user_id = u.id
     order by m.papel is null desc, u.email;
end;
$$;

create function public.liberar_membro(p_email text, p_papel text default 'membro')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text;
begin
  if not controle.eh_admin() then
    raise exception 'Acesso negado: só administradores liberam usuários.' using errcode = '42501';
  end if;
  if p_papel not in ('admin', 'membro') then
    raise exception 'Papel inválido: use admin ou membro.' using errcode = '22023';
  end if;
  select id, raw_user_meta_data ->> 'nome' into v_id, v_nome
    from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'Nenhuma conta com o e-mail %. Peça para a pessoa criar a conta na tela de login.', trim(p_email) using errcode = 'P0002';
  end if;
  if v_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'Você não pode tirar o seu próprio papel de administrador.' using errcode = '42501';
  end if;
  insert into public.membros (user_id, nome, papel) values (v_id, v_nome, p_papel)
    on conflict (user_id) do update set papel = excluded.papel;
end;
$$;

create function public.remover_membro(p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not controle.eh_admin() then
    raise exception 'Acesso negado: só administradores removem usuários.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode remover o seu próprio acesso.' using errcode = '42501';
  end if;
  delete from public.membros where user_id = p_user_id;
end;
$$;

revoke all on function public.listar_equipe(), public.liberar_membro(text, text), public.remover_membro(uuid) from public, anon;
grant execute on function public.listar_equipe(), public.liberar_membro(text, text), public.remover_membro(uuid) to authenticated;
