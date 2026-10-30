"""Avisos operacionais: atribuição, prazo próximo, alteração de prazo, conclusão, dependência liberada e plano
sem atualização (o resumo semanal fica em resumo_semanal.py). Mesma central e mesma fila de e-mails de sempre.

Regras comuns (em `avisar`), para todos os tipos:
- Destinatários pelos vínculos reais: responsável pelo item e "Responsável pelo plano" (é o gestor do plano —
  um campo só para os dois papéis). Sem repetidos; quem fez a operação não é avisado.
- Só contas ativas e sem convite pendente, com acesso ao plano ou ao item (o responsável por um sub-item vê o
  próprio item sem ver o plano). A participação em várias equipes não duplica nada: o acesso é um teste só.
- Plano arquivado, excluído ou em rascunho, e item arquivado ou excluído, não geram aviso.
- Preferências de Meu Perfil: "sistema" no canal da central; "e-mail" na fila (padrões em
  preferencias_notificacao.py).
- Cada aviso tem uma chave da ocorrência (ex.: o registro do histórico que o gerou): a central e a fila não
  repetem a mesma chave, então reexecuções e novas tentativas não duplicam.
- Antes de cada envio de e-mail, a fila revalida conta, acesso e situação do item (validadores abaixo).
- Nada aqui altera status, prazos ou pontuação: só lê e avisa.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissoes import PERFIL_ADMINISTRADOR
from app.core.tempo import data_local, fuso_local
from app.models import Acao, AcaoContraproposta, AcaoSolicitacaoAlteracao, EnvioEmail, Perfil, PlanoDeAcao, Usuario
from app.models.enums import STATUS_ACAO_ABERTOS, ReferenciaNotificacao, StatusContraproposta, StatusPlano, StatusSolicitacao
from app.services import dependencias, gestores_area
from app.services.email_notificacoes import _data, _link, enfileirar_aviso, registrar_validador
from app.services.escopo import filtro_planos_visiveis
from app.services.eventos import Evento, TipoEvento, publicar
from app.services.preferencias_notificacao import POR_TIPO, recebem


def _fmt(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else "—"


def rotulo_item(acao: Acao) -> str:
    return f"{'Sub-item' if acao.eh_subacao else 'Ação'} {acao.numero_exibicao}"


def _artigo(acao: Acao) -> str:
    return f"o sub-item {acao.numero_exibicao}" if acao.eh_subacao else f"a ação {acao.numero_exibicao}"


# ---- elegibilidade -----------------------------------------------------------------------------------


def destinatario_valido(usuario: Usuario | None) -> bool:
    return usuario is not None and usuario.ativo and not usuario.convite_pendente


def plano_operacional(plano: PlanoDeAcao | None) -> bool:
    return plano is not None and plano.arquivado_em is None and plano.excluido_em is None and not plano.rascunho


def item_operacional(acao: Acao | None) -> bool:
    # Arquivar uma ação arquiva os sub-itens abaixo no mesmo instante: basta olhar o próprio item.
    return acao is not None and acao.arquivado_em is None and acao.excluido_em is None and plano_operacional(acao.plano)


def acessa_plano(db: Session, usuario: Usuario, plano: PlanoDeAcao) -> bool:
    """Mesma regra das telas (áreas autorizadas, papéis e equipes ativas); plano arquivado fica de fora."""
    return db.scalar(select(PlanoDeAcao.id).where(PlanoDeAcao.id == plano.id, filtro_planos_visiveis(usuario))) is not None


def acessa_item(db: Session, usuario: Usuario, acao: Acao) -> bool:
    """Quem vê o plano vê o item; o responsável por um sub-item (ou por um item acima dele) vê o próprio,
    dentro das áreas autorizadas (a mesma regra de AcaoService._acessivel)."""
    if acessa_plano(db, usuario, acao.plano):
        return True
    return usuario.acessa_area(acao.plano.area_id) and any(a.responsavel_id == usuario.id for a in (acao, *acao.ancestrais))


# ---- entrega -----------------------------------------------------------------------------------------


@dataclass
class Aviso:
    tipo: str
    chave: str  # identifica a ocorrência (sem o destinatário)
    titulo: str
    mensagem: str
    plano: PlanoDeAcao
    destinatarios: Iterable[int | None]
    acao: Acao | None = None
    autor_id: int | None = None
    # Variáveis do modelo de e-mail; None = este aviso não tem e-mail (ex.: atribuição na criação, que já
    # tem o e-mail de "Nova ação").
    email: dict | None = None
    contexto: dict = field(default_factory=dict)
    # Modelo de e-mail de um tipo fora de Meu Perfil (ex.: solicitação de prazo); os configuráveis usam POR_TIPO.
    evento_email: str | None = None


def avisar(db: Session, aviso: Aviso) -> int:
    """Entrega na central e enfileira os e-mails. Devolve quantas notificações novas a central gravou."""
    if not (item_operacional(aviso.acao) if aviso.acao is not None else plano_operacional(aviso.plano)):
        return 0
    ids = list(dict.fromkeys(i for i in aviso.destinatarios if i is not None and i != aviso.autor_id))
    validos: list[Usuario] = []
    for usuario_id in ids:
        usuario = db.get(Usuario, usuario_id)
        if not destinatario_valido(usuario):
            continue
        if aviso.acao is not None and not acessa_item(db, usuario, aviso.acao):
            continue
        if aviso.acao is None and not acessa_plano(db, usuario, aviso.plano):
            continue
        validos.append(usuario)
    if not validos:
        return 0
    ref_tipo = ReferenciaNotificacao.ACAO if aviso.acao is not None else ReferenciaNotificacao.PLANO
    ref_id = aviso.acao.id if aviso.acao is not None else aviso.plano.id
    criadas = publicar(db, Evento(
        tipo=aviso.tipo, destinatarios=tuple(u.id for u in validos), titulo=aviso.titulo[:200], mensagem=aviso.mensagem,
        referencia_tipo=ref_tipo, referencia_id=ref_id, chave_deduplicacao=aviso.chave,
    ))
    if aviso.email is not None:
        querem = recebem(db, aviso.tipo, [u.id for u in validos], "email")
        destinatarios = [u for u in validos if u.id in querem]
        contexto = {("acao_id" if aviso.acao is not None else "plano_id"): ref_id, **aviso.contexto}
        # Gestores da área do plano/item em CCO (gestores_area.py), resolvidos no envio. Mesmo sem nenhum
        # destinatário com o e-mail ligado, eles recebem (numa cópia só deles); quem é destinatário do aviso mas
        # desligou o e-mail deste tipo não o recebe em cópia.
        area = gestores_area.area_do_evento(plano=aviso.plano, acao=aviso.acao)
        if destinatarios or area is not None:
            evento_email = aviso.evento_email or POR_TIPO[aviso.tipo].evento_email
            enfileirar_aviso(db, evento_email, ref_tipo.value, ref_id, destinatarios, aviso.email,
                             chave_evento=aviso.chave, contexto=contexto, area=area, fora_da_copia=[u.id for u in validos],
                             ref_copia=validos[0])
    return criadas


def _valores_item(acao: Acao) -> dict[str, str | None]:
    plano = acao.plano
    return {
        "numero_pa": plano.codigo,
        "titulo_pa": plano.nome,
        "item": rotulo_item(acao),
        "descricao": acao.descricao,
        "responsavel": acao.responsavel.nome,
        "prazo_inicial": _data(acao.prazo_inicio),
        "prazo_conclusao": _data(acao.prazo),
        "link_registro": _link(f"/acoes/{acao.id}"),
    }


# ---- 1. ação atribuída ----------------------------------------------------------------------------------


def acao_atribuida_na_criacao(db: Session, acao: Acao, autor: Usuario) -> int:
    """Item criado (ou liberado com o rascunho) já com responsável. O e-mail é o de "Nova ação"/"Novo sub-item"
    (email_notificacoes.enfileirar_criacao_item), que já respeita a preferência de e-mail deste tipo."""
    if acao.status not in STATUS_ACAO_ABERTOS:
        return 0
    return avisar(db, Aviso(
        tipo=TipoEvento.ACAO_ATRIBUIDA,
        chave=f"{TipoEvento.ACAO_ATRIBUIDA}:{acao.id}:criacao:{acao.responsavel_id}",
        titulo=f"{'Novo sub-item atribuído' if acao.eh_subacao else 'Nova ação atribuída'} a você — {acao.plano.codigo}",
        mensagem=f"{autor.nome} atribuiu a você {_artigo(acao)} “{acao.descricao}” (prazo {_fmt(acao.prazo)}).",
        plano=acao.plano, acao=acao, destinatarios=(acao.responsavel_id,), autor_id=autor.id,
    ))


def acao_atribuida_na_troca(db: Session, acao: Acao, autor: Usuario, anterior: Usuario | None, historico_id: int) -> int:
    """Troca de responsável: avisa só o novo responsável (quem trocou para si mesmo não é avisado)."""
    nome_anterior = anterior.nome if anterior else "—"
    return avisar(db, Aviso(
        tipo=TipoEvento.ACAO_ATRIBUIDA,
        chave=f"{TipoEvento.ACAO_ATRIBUIDA}:{acao.id}:troca:{historico_id}",
        titulo=f"{'Sub-item atribuído' if acao.eh_subacao else 'Ação atribuída'} a você — {acao.plano.codigo}",
        mensagem=(
            f"{autor.nome} passou para você {_artigo(acao)} “{acao.descricao}” (antes com {nome_anterior}). "
            f"Prazo: {_fmt(acao.prazo)}."
        ),
        plano=acao.plano, acao=acao, destinatarios=(acao.responsavel_id,), autor_id=autor.id,
        email={**_valores_item(acao), "responsavel_anterior": nome_anterior, "atribuido_por": autor.nome},
    ))


# ---- 2. prazo próximo ---------------------------------------------------------------------------------


def _vence(dias: int, prazo: date) -> str:
    if dias == 0:
        return "hoje"
    if dias == 1:
        return "amanhã"
    return f"em {dias} dias ({prazo:%d/%m})"


def prazo_proximo(db: Session, acao: Acao, hoje: date) -> int:
    """Item em aberto que entrou na antecedência configurada (quem chama já conferiu a janela). Uma vez por
    responsável e prazo vigente: a chave leva o prazo e o destinatário (o responsável)."""
    dias = (acao.prazo - hoje).days
    if dias < 0 or acao.status not in STATUS_ACAO_ABERTOS:
        return 0
    quando = _vence(dias, acao.prazo)
    return avisar(db, Aviso(
        tipo=TipoEvento.ACAO_VENCENDO,
        chave=f"{TipoEvento.ACAO_VENCENDO}:{acao.id}:{acao.prazo}",
        titulo=f"{'Sub-item' if acao.eh_subacao else 'Ação'} vence {quando} — {acao.plano.codigo}",
        mensagem=(
            f"{'O sub-item' if acao.eh_subacao else 'A ação'} “{acao.descricao}” vence {quando} "
            f"({_fmt(acao.prazo)}; {dias} dia(s) restante(s)) e ainda está em aberto ({acao.progresso}% concluída)."
        ),
        plano=acao.plano, acao=acao, destinatarios=(acao.responsavel_id,),
        email={**_valores_item(acao), "dias_restantes": str(dias), "vence": quando, "progresso": f"{acao.progresso}%"},
        contexto={"prazo": acao.prazo.isoformat(), "responsavel_id": acao.responsavel_id},
    ))


# ---- 3. alteração de prazo ----------------------------------------------------------------------------


def _mudancas(antes: tuple[date | None, date | None], depois: tuple[date | None, date | None]) -> str:
    partes = []
    if antes[0] != depois[0]:
        partes.append(f"início {_fmt(antes[0])} → {_fmt(depois[0])}")
    if antes[1] != depois[1]:
        partes.append(f"conclusão {_fmt(antes[1])} → {_fmt(depois[1])}")
    return "; ".join(partes)


def _valores_prazo(antes, depois, autor: Usuario, motivo: str | None) -> dict[str, str | None]:
    return {
        "prazo_inicial_anterior": _data(antes[0]), "prazo_inicial_novo": _data(depois[0]),
        "prazo_conclusao_anterior": _data(antes[1]), "prazo_conclusao_novo": _data(depois[1]),
        "alterado_por": autor.nome, "motivo": motivo,
    }


def prazo_alterado_item(
    db: Session, acao: Acao, autor: Usuario, antes: tuple[date | None, date], motivo: str | None, historico_id: int,
    excluir: Iterable[int] = (),
) -> int:
    """Data inicial e/ou final de uma ação ou sub-item: responsável pelo item e gestor do plano (sem o autor).
    `excluir`: quem já recebe outro aviso da mesma mudança (ex.: o autor da solicitação aprovada)."""
    depois = (acao.prazo_inicio, acao.prazo)
    if antes == depois:
        return 0
    fora = set(excluir)
    texto = _mudancas(antes, depois)
    return avisar(db, Aviso(
        tipo=TipoEvento.PRAZO_ALTERADO,
        chave=f"{TipoEvento.PRAZO_ALTERADO}:acao:{acao.id}:{historico_id}",
        titulo=f"Prazo alterado: {rotulo_item(acao)} — {acao.plano.codigo}",
        mensagem=f"{autor.nome} alterou as datas de {_artigo(acao)} “{acao.descricao}”: {texto}."
        + (f" Motivo: {motivo}" if motivo else ""),
        plano=acao.plano, acao=acao, autor_id=autor.id,
        destinatarios=[i for i in (acao.responsavel_id, acao.plano.responsavel_id) if i not in fora],
        email={**_valores_item(acao), **_valores_prazo(antes, depois, autor, motivo)},
    ))


def prazo_alterado_plano(
    db: Session, plano: PlanoDeAcao, autor: Usuario, antes: tuple[date, date], motivo: str | None, historico_id: int,
) -> int:
    """Início/fim estimados do plano: o responsável pelo registro e o gestor são o mesmo campo do plano."""
    depois = (plano.data_inicio_estimado, plano.data_fim_estimado)
    if antes == depois:
        return 0
    return avisar(db, Aviso(
        tipo=TipoEvento.PRAZO_ALTERADO,
        chave=f"{TipoEvento.PRAZO_ALTERADO}:plano:{plano.id}:{historico_id}",
        titulo=f"Prazo do plano alterado — {plano.codigo}",
        mensagem=f"{autor.nome} alterou as datas do plano “{plano.nome}”: {_mudancas(antes, depois)}."
        + (f" Motivo: {motivo}" if motivo else ""),
        plano=plano, autor_id=autor.id, destinatarios=(plano.responsavel_id,),
        email={
            "numero_pa": plano.codigo, "titulo_pa": plano.nome, "item": "Plano de Ação", "descricao": plano.nome,
            "responsavel": plano.responsavel.nome, "prazo_inicial": _data(depois[0]), "prazo_conclusao": _data(depois[1]),
            "link_registro": _link(f"/planos/{plano.id}"), **_valores_prazo(antes, depois, autor, motivo),
        },
    ))


# ---- 4. ação concluída --------------------------------------------------------------------------------


def situacao_prazo(prazo: date, concluida: date) -> str:
    dias = (concluida - prazo).days
    if dias > 0:
        return f"Com {dias} dia(s) de atraso"
    if dias < 0:
        return f"No prazo ({-dias} dia(s) antes do vencimento)"
    return "No prazo (no dia do vencimento)"


def acao_concluida(db: Session, acao: Acao, autor: Usuario) -> int:
    """Transição efetiva para Concluído: responsável, gestor do plano e, no sub-item, o responsável pelo item
    imediatamente acima (quem acompanha). Quem concluiu não é avisado."""
    instante = acao.concluida_em or datetime.min
    dia = data_local(acao.concluida_em) if acao.concluida_em else None
    situacao = situacao_prazo(acao.prazo, dia) if dia else "—"
    plano = acao.plano
    return avisar(db, Aviso(
        tipo=TipoEvento.ACAO_CONCLUIDA,
        chave=f"{TipoEvento.ACAO_CONCLUIDA}:{acao.id}:{instante:%Y%m%d%H%M%S%f}",
        titulo=f"{'Sub-item concluído' if acao.eh_subacao else 'Ação concluída'} — {plano.codigo}",
        mensagem=(
            f"{autor.nome} concluiu {_artigo(acao)} “{acao.descricao}” do plano “{plano.nome}” em {_fmt(dia)} "
            f"(prazo {_fmt(acao.prazo)}): {situacao[0].lower()}{situacao[1:]}."
        ),
        plano=plano, acao=acao, autor_id=autor.id,
        destinatarios=(acao.responsavel_id, plano.responsavel_id, acao.acao_pai.responsavel_id if acao.acao_pai else None),
        email={**_valores_item(acao), "concluido_por": autor.nome, "data_conclusao": _data(dia), "situacao_prazo": situacao},
    ))


# ---- 5. dependência liberada --------------------------------------------------------------------------


def dependencias_liberadas(db: Session, concluida: Acao, autor: Usuario) -> list[Acao]:
    """`concluida` acabou de ser concluída: avisa o responsável por cada item que dependia dela (direto ou por
    um item acima) e agora não tem mais pré-requisito pendente. Só itens em aberto, ainda não iniciados e não
    arquivados. Não inicia o item nem mexe nas datas."""
    candidatos: dict[int, Acao] = {}
    for dependente in concluida.dependentes:
        for item in (dependente, *dependente.descendentes()):
            candidatos.setdefault(item.id, item)
    liberados = [
        item for item in candidatos.values()
        if item.status in STATUS_ACAO_ABERTOS and item.iniciada_em is None and item.arquivado_em is None
        and not dependencias.pendentes(item)
    ]
    instante = concluida.concluida_em or datetime.min
    for item in liberados:
        atendidas = list({p.id: p for a in (item, *item.ancestrais) for p in a.depende_de}.values())
        lista = "; ".join(f"{rotulo_item(p)} — {p.descricao}" for p in sorted(atendidas, key=dependencias.chave_ordem))
        avisar(db, Aviso(
            tipo=TipoEvento.DEPENDENCIA_LIBERADA,
            chave=f"{TipoEvento.DEPENDENCIA_LIBERADA}:{item.id}:{concluida.id}:{instante:%Y%m%d%H%M%S%f}",
            titulo=f"Liberado para iniciar: {rotulo_item(item)} — {item.plano.codigo}",
            mensagem=(
                f"Todos os pré-requisitos de {_artigo(item)} “{item.descricao}” foram concluídos ({lista}). "
                "Ele já pode ser iniciado (nada foi iniciado nem alterado automaticamente)."
            ),
            plano=item.plano, acao=item, autor_id=autor.id, destinatarios=(item.responsavel_id,),
            email={**_valores_item(item), "dependencias": lista},
        ))
    return liberados


# ---- 6. plano sem atualização (o job está em avisos_agendados.py) ---------------------------------------


def plano_sem_atualizacao(db: Session, plano: PlanoDeAcao, ultima: datetime, descricao: str, dias: int, ciclo: int) -> int:
    return avisar(db, Aviso(
        tipo=TipoEvento.PLANO_SEM_ATUALIZACAO,
        chave=f"{TipoEvento.PLANO_SEM_ATUALIZACAO}:{plano.id}:{ultima:%Y%m%d%H%M%S}:{ciclo}",
        titulo=f"Plano sem atualização há {dias} dias — {plano.codigo}",
        mensagem=f"O plano “{plano.nome}” está sem movimentações relevantes há {dias} dias. Última: {descricao}.",
        plano=plano, destinatarios=(plano.responsavel_id,),
        email={"numero_pa": plano.codigo, "titulo_pa": plano.nome, "ultima_movimentacao": descricao,
               "dias_sem_atualizacao": str(dias), "link_registro": _link(f"/planos/{plano.id}")},
        contexto={"ultima": ultima.isoformat()},
    ))


# ---- 7. solicitação de alteração de datas (início e/ou conclusão) e a resposta ------------------------------


def campos_solicitacao(s: AcaoSolicitacaoAlteracao) -> str:
    if s.altera_inicio and s.altera_conclusao:
        return "das datas de início e conclusão"
    return "da data de início" if s.altera_inicio else "da data de conclusão"


def alvo_solicitacao(s: AcaoSolicitacaoAlteracao) -> str:
    """O que o pedido muda, para a frase "Fulano solicitou mudar …"."""
    if s.altera_inicio and s.altera_conclusao:
        return "as datas de início e conclusão"
    return "o início" if s.altera_inicio else "a conclusão"


def linhas_datas_solicitacao(s: AcaoSolicitacaoAlteracao) -> list[str]:
    """Uma linha "De → Para" por data pedida (datas planejadas; as reais não entram em solicitação)."""
    linhas = []
    if s.altera_inicio:
        linhas.append(f"Início — De: {_fmt(s.prazo_inicio_anterior)} → Para: {_fmt(s.novo_prazo_inicio_sugerido)}")
    if s.altera_conclusao:
        linhas.append(f"Conclusão — De: {_fmt(s.prazo_anterior)} → Para: {_fmt(s.novo_prazo_sugerido)}")
    return linhas


def alerta_solicitacao(s: AcaoSolicitacaoAlteracao, plano: PlanoDeAcao) -> str | None:
    if s.altera_conclusao and s.novo_prazo_sugerido > plano.data_fim_estimado:
        return f"A data de conclusão solicitada ultrapassa o término estimado do plano, em {_fmt(plano.data_fim_estimado)}."
    return None


def _do_item(acao: Acao) -> str:
    return f"do sub-item {acao.numero_exibicao}" if acao.eh_subacao else f"da ação {acao.numero_exibicao}"


def _momento(instante: datetime) -> str:
    return instante.replace(tzinfo=UTC).astimezone(fuso_local()).strftime("%d/%m/%Y às %H:%M")


def aprovadores_solicitacao(db: Session, acao: Acao, solicitante_id: int) -> list[int]:
    """Quem avalia o pedido: o gestor do plano (responsável pelo plano), quem criou o plano e, no sub-item, o
    responsável pelo item imediatamente acima — todos podem responder (AcaoService._eh_gestor). Só contas ativas,
    com acesso ao item e diferentes do solicitante. Sem nenhum (ex.: quem pediu é o próprio gestor e criador do
    plano), vão os Administradores ativos, que sempre podem responder."""
    plano = acao.plano
    candidatos = (plano.responsavel_id, plano.criado_por_id, acao.acao_pai.responsavel_id if acao.acao_pai else None)
    ids = []
    for usuario_id in dict.fromkeys(i for i in candidatos if i is not None and i != solicitante_id):
        usuario = db.get(Usuario, usuario_id)
        if destinatario_valido(usuario) and acessa_item(db, usuario, acao):
            ids.append(usuario_id)
    if ids:
        return ids
    admins = db.scalars(select(Usuario).join(Usuario.perfil).where(Perfil.nome == PERFIL_ADMINISTRADOR, Usuario.ativo.is_(True)))
    return [u.id for u in admins if u.id != solicitante_id and destinatario_valido(u)]


def _valores_solicitacao(acao: Acao, s: AcaoSolicitacaoAlteracao) -> dict[str, str | None]:
    alerta = alerta_solicitacao(s, acao.plano)
    return {
        **_valores_item(acao),
        "solicitado_por": s.solicitado_por.nome,
        "solicitado_em": _momento(s.criado_em),
        "resumo_solicitacao": f"{s.solicitado_por.nome} solicitou mudar {alvo_solicitacao(s)} {_do_item(acao)}.",
        "datas_solicitadas": "\n".join(linhas_datas_solicitacao(s) + ([f"Atenção: {alerta}"] if alerta else [])),
        "justificativa": s.motivo,
    }


def solicitacao_prazo(db: Session, acao: Acao, s: AcaoSolicitacaoAlteracao) -> int:
    """Pedido criado: avisa quem avalia, no sistema e por e-mail (o tipo não é configurável em Meu Perfil)."""
    nome = s.solicitado_por.nome
    alerta = alerta_solicitacao(s, acao.plano)
    return avisar(db, Aviso(
        tipo=TipoEvento.SOLICITACAO_PRAZO,
        chave=f"{TipoEvento.SOLICITACAO_PRAZO}:{s.id}",
        titulo=f"Solicitação de alteração de datas: {rotulo_item(acao)} — {acao.plano.codigo}",
        mensagem=(
            f"{nome} solicitou mudar {alvo_solicitacao(s)} {_do_item(acao)} “{acao.descricao}”. "
            + " · ".join(linhas_datas_solicitacao(s)) + "." + (f" {alerta}" if alerta else "") + f" Justificativa: {s.motivo}"
            + f" Pedido enviado em {_momento(s.criado_em)}."
        ),
        plano=acao.plano, acao=acao, autor_id=s.solicitado_por_id,
        destinatarios=aprovadores_solicitacao(db, acao, s.solicitado_por_id),
        email=_valores_solicitacao(acao, s), evento_email="solicitacao_prazo",
        contexto={"solicitacao_id": s.id},
    ))


def resposta_solicitacao_prazo(db: Session, acao: Acao, s: AcaoSolicitacaoAlteracao, autor: Usuario) -> int:
    """Pedido aprovado ou recusado: avisa quem pediu, com as datas vigentes depois da resposta."""
    aprovada = s.status == StatusSolicitacao.ACEITA
    resultado = "aprovada" if aprovada else "recusada"
    vigentes = f"Datas vigentes: início {_fmt(acao.prazo_inicio)}, conclusão {_fmt(acao.prazo)}."
    justificativa = s.resposta_justificativa
    return avisar(db, Aviso(
        tipo=TipoEvento.RESPOSTA_SOLICITACAO_PRAZO,
        chave=f"{TipoEvento.RESPOSTA_SOLICITACAO_PRAZO}:{s.id}",
        titulo=f"Solicitação de alteração de datas {resultado}: {rotulo_item(acao)} — {acao.plano.codigo}",
        mensagem=(
            f"{autor.nome} {'aprovou' if aprovada else 'recusou'} a sua solicitação de alteração {campos_solicitacao(s)} "
            f"{_do_item(acao)} “{acao.descricao}”. " + " · ".join(linhas_datas_solicitacao(s)) + f". {vigentes}"
            + (f" Justificativa: {justificativa}" if justificativa else "")
        ),
        plano=acao.plano, acao=acao, autor_id=autor.id, destinatarios=(s.solicitado_por_id,),
        email={
            **_valores_solicitacao(acao, s),
            "resultado": resultado,
            "respondido_por": autor.nome,
            "datas_vigentes": f"Data de início: {_fmt(acao.prazo_inicio)}\nData de conclusão: {_fmt(acao.prazo)}",
            "justificativa_resposta": justificativa,
        },
        evento_email="resposta_solicitacao_prazo",
    ))


# ---- 8. contraproposta do gestor e a resposta do solicitante ------------------------------------------------


def linhas_comparacao(s: AcaoSolicitacaoAlteracao, cp: AcaoContraproposta) -> list[str]:
    """Vigente × solicitada × proposta, de cada data que o pedido ou a contraproposta mexe."""
    linhas = []
    if s.altera_inicio or cp.altera_inicio:
        linhas += [
            f"Data de início vigente: {_fmt(cp.prazo_inicio_vigente)}",
            f"Data de início solicitada: {_fmt(s.novo_prazo_inicio_sugerido) if s.altera_inicio else 'sem alteração'}",
            f"Data de início proposta pelo gestor: {_fmt(cp.novo_prazo_inicio) if cp.altera_inicio else 'sem alteração'}",
        ]
    if s.altera_conclusao or cp.altera_conclusao:
        linhas += [
            f"Data de conclusão vigente: {_fmt(cp.prazo_vigente)}",
            f"Data de conclusão solicitada: {_fmt(s.novo_prazo_sugerido) if s.altera_conclusao else 'sem alteração'}",
            f"Data de conclusão proposta pelo gestor: {_fmt(cp.novo_prazo) if cp.altera_conclusao else 'sem alteração'}",
        ]
    return linhas


def alerta_contraproposta(cp: AcaoContraproposta, plano: PlanoDeAcao) -> str | None:
    if cp.altera_conclusao and cp.novo_prazo > plano.data_fim_estimado:
        return f"A data de conclusão proposta ultrapassa o término estimado do plano, em {_fmt(plano.data_fim_estimado)}."
    return None


def _comparacao(s: AcaoSolicitacaoAlteracao, cp: AcaoContraproposta, plano: PlanoDeAcao) -> str:
    alerta = alerta_contraproposta(cp, plano)
    return "\n".join(linhas_comparacao(s, cp) + ([f"Atenção: {alerta}"] if alerta else []))


def contraproposta_prazo(db: Session, acao: Acao, s: AcaoSolicitacaoAlteracao, cp: AcaoContraproposta, autor: Usuario) -> int:
    """O gestor sugeriu outras datas: avisa quem pediu, no sistema e por e-mail, para aceitar ou não."""
    alerta = alerta_contraproposta(cp, acao.plano)
    resumo = f"O gestor {autor.nome} sugeriu outra data para {'este sub-item' if acao.eh_subacao else 'esta ação'}."
    return avisar(db, Aviso(
        tipo=TipoEvento.CONTRAPROPOSTA_PRAZO,
        chave=f"{TipoEvento.CONTRAPROPOSTA_PRAZO}:{cp.id}",
        titulo=f"Contraproposta de datas: {rotulo_item(acao)} — {acao.plano.codigo}",
        mensagem=(
            f"O gestor {autor.nome} sugeriu outra data para {_artigo(acao)} “{acao.descricao}”, em resposta à sua solicitação. "
            + " · ".join(linhas_comparacao(s, cp)) + "." + (f" {alerta}" if alerta else "")
            + f" Justificativa do gestor: {cp.justificativa} Acesse o item para aceitar ou não a contraproposta."
        ),
        plano=acao.plano, acao=acao, autor_id=autor.id, destinatarios=(s.solicitado_por_id,),
        email={
            **_valores_item(acao), "proposto_por": autor.nome, "resumo_contraproposta": resumo,
            "comparacao_datas": _comparacao(s, cp, acao.plano), "justificativa_gestor": cp.justificativa,
            "solicitado_em": _momento(s.criado_em), "justificativa": s.motivo,
        },
        evento_email="contraproposta_prazo",
        contexto={"contraproposta_id": cp.id},
    ))


def resposta_contraproposta_prazo(
    db: Session, acao: Acao, s: AcaoSolicitacaoAlteracao, cp: AcaoContraproposta, autor: Usuario
) -> int:
    """O solicitante respondeu: avisa o gestor que propôs (acordo concluído, ou o pedido voltou para a análise dele)."""
    aceita = cp.status == StatusContraproposta.ACEITA
    resultado = "aceita" if aceita else "não aceita"
    vigentes = f"Datas vigentes: início {_fmt(acao.prazo_inicio)}, conclusão {_fmt(acao.prazo)}."
    if aceita:
        proximo = "Acordo concluído: as datas propostas já valem para o item."
    else:
        proximo = "O pedido voltou para a sua análise: aprove o pedido original, recuse-o ou envie nova contraproposta."
    return avisar(db, Aviso(
        tipo=TipoEvento.RESPOSTA_CONTRAPROPOSTA_PRAZO,
        chave=f"{TipoEvento.RESPOSTA_CONTRAPROPOSTA_PRAZO}:{cp.id}",
        titulo=f"Contraproposta {resultado}: {rotulo_item(acao)} — {acao.plano.codigo}",
        mensagem=(
            f"{autor.nome} {'aceitou' if aceita else 'não aceitou'} a sua contraproposta {_do_item(acao)} “{acao.descricao}”. "
            + (f"Justificativa: {cp.resposta_justificativa} " if cp.resposta_justificativa else "") + f"{proximo} {vigentes}"
        ),
        plano=acao.plano, acao=acao, autor_id=autor.id, destinatarios=(cp.proposto_por_id,),
        email={
            **_valores_item(acao), "respondido_por": autor.nome, "resultado": resultado,
            "comparacao_datas": _comparacao(s, cp, acao.plano), "justificativa_resposta": cp.resposta_justificativa,
            "proximo_passo": proximo,
            "datas_vigentes": f"Data de início: {_fmt(acao.prazo_inicio)}\nData de conclusão: {_fmt(acao.prazo)}",
        },
        evento_email="resposta_contraproposta_prazo",
    ))


# ---- revalidação antes do envio do e-mail -----------------------------------------------------------------


def _atual(db: Session, model, id_: int | None):
    """Lê de novo do banco (a sessão da fila não expira objetos no commit)."""
    if id_ is None:
        return None
    return db.scalar(select(model).where(model.id == id_).execution_options(populate_existing=True))


def revalidar(db: Session, envio: EnvioEmail) -> str | None:
    usuario = _atual(db, Usuario, envio.usuario_id)
    if not destinatario_valido(usuario):
        return "Destinatário inativo, removido ou com convite pendente."
    ctx = envio.contexto or {}
    if "acao_id" in ctx:
        acao = _atual(db, Acao, ctx["acao_id"])
        if acao is not None:
            _atual(db, PlanoDeAcao, acao.plano_id)
        if not item_operacional(acao):
            return "Item ou plano arquivado, excluído ou em rascunho."
        if not acessa_item(db, usuario, acao):
            return "Destinatário sem acesso ao item."
        if "prazo" in ctx and (
            acao.prazo.isoformat() != ctx["prazo"] or acao.responsavel_id != ctx.get("responsavel_id")
            or acao.status not in STATUS_ACAO_ABERTOS
        ):
            return "Prazo, responsável ou situação do item mudou depois do aviso."
        if "solicitacao_id" in ctx:
            s = _atual(db, AcaoSolicitacaoAlteracao, ctx["solicitacao_id"])
            if s is None or s.status != StatusSolicitacao.PENDENTE:
                return "A solicitação já foi respondida."
        if "contraproposta_id" in ctx:
            cp = _atual(db, AcaoContraproposta, ctx["contraproposta_id"])
            if cp is None or cp.status != StatusContraproposta.PENDENTE:
                return "A contraproposta já foi respondida, substituída ou encerrada."
    elif "plano_id" in ctx:
        plano = _atual(db, PlanoDeAcao, ctx["plano_id"])
        if not plano_operacional(plano):
            return "Plano arquivado, excluído ou em rascunho."
        if not acessa_plano(db, usuario, plano):
            return "Destinatário sem acesso ao plano."
        if envio.evento == "plano_sem_atualizacao" and plano.status == StatusPlano.CONCLUIDO:
            return "Plano concluído."
    return None


for _evento in ("acao_criada", "subitem_criado", "acao_atribuida", "prazo_proximo", "prazo_alterado", "acao_concluida",
                "dependencia_liberada", "plano_sem_atualizacao", "solicitacao_prazo", "resposta_solicitacao_prazo",
                "contraproposta_prazo", "resposta_contraproposta_prazo"):
    registrar_validador(_evento, revalidar)
