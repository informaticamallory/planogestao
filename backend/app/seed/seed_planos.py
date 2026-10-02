"""Seed de desenvolvimento: planos, ações e histórico com datas relativas a hoje.

Gerado de forma determinística (mesma semente) e coerente: status, datas de conclusão,
progresso e histórico batem entre si. Requer o seed_auth antes.

    python -m app.seed.seed_planos           # não faz nada se já houver planos
    python -m app.seed.seed_planos --reset   # apaga planos/ações/histórico e recria
"""

import random
import shutil
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import utcnow
from app.core.tempo import hoje_local, inicio_do_dia_utc
from app.models import (
    Acao,
    acao_dependencia,
    AcaoHistorico,
    AcaoSolicitacaoAlteracao,
    Area,
    GamificacaoLancamento,
    Notificacao,
    OrigemPlano,
    PlanoAnexo,
    PlanoDeAcao,
    PlanoHistorico,
    PlanoSequencia,
    TipoPlano,
    Usuario,
)
from app.models.enums import EventoHistorico, EventoPlano, Prioridade, StatusAcao, StatusPlano
from app.seed.seed_auth import _obter_ou_criar
from app.services.ciclo_plano import status_calculado
from app.services.historico import registrar_historico
from app.services.plano_codigo import gerar_codigo_plano
from app.services.pontuacao import creditar_historico

TIPOS = ["Corretivo", "Preventivo", "Melhoria"]
ORIGENS = ["Auditoria interna", "Reclamação de cliente", "Não conformidade", "Indicador de processo", "Segurança do trabalho"]

# (nome, área, problema)
PLANOS = [
    ("Redução de refugo na linha de usinagem", "Produção", "Índice de refugo acima de 4% nas peças usinadas."),
    ("Padronização do setup de máquinas CNC", "Produção", "Tempo de setup variando entre turnos."),
    ("Correção de vazamento no sistema hidráulico", "Manutenção", "Perda de óleo recorrente na prensa 02."),
    ("Implantação de manutenção preventiva em compressores", "Manutenção", "Paradas não planejadas dos compressores."),
    ("Tratamento de reclamação de cliente — riscos na pintura", "Produção", "Cliente reportou riscos em lote entregue."),
    ("Calibração dos instrumentos de medição", "Qualidade", "Instrumentos com calibração vencida na auditoria."),
    ("Revisão do plano de inspeção de recebimento", "Qualidade", "Material fora de especificação chegando à linha."),
    ("Organização 5S do almoxarifado", "Logística", "Dificuldade para localizar itens de estoque."),
    ("Redução de atrasos na expedição", "Logística", "OTIF abaixo da meta de 95%."),
    ("Adequação à NR-12 nas prensas", "Manutenção", "Proteções de máquinas incompletas."),
    ("Melhoria do fluxo de montagem final", "Produção", "Gargalo no posto 3 da montagem."),
    ("Controle de umidade na cabine de pintura", "Produção", "Defeitos de aderência em dias úmidos."),
    ("Análise de falhas no torno 05", "Manutenção", "Quebra recorrente do fuso."),
    ("Treinamento de operadores em controle estatístico", "Qualidade", "Cartas de controle preenchidas incorretamente."),
    ("Rastreabilidade de lotes na expedição", "Logística", "Falhas na identificação de lotes enviados."),
    ("Redução do consumo de energia nos fornos", "Produção", "Consumo 12% acima do orçamento."),
    ("Tratamento de não conformidade em solda", "Qualidade", "Porosidade identificada em ensaio."),
    ("Revisão de estoque mínimo de peças críticas", "Logística", "Falta de peças de reposição em paradas."),
    ("Melhoria da iluminação na metrologia", "Qualidade", "Iluminação abaixo do recomendado para inspeção visual."),
    ("Plano de lubrificação das esteiras", "Manutenção", "Desgaste prematuro de rolamentos."),
    ("Redução de retrabalho na montagem", "Produção", "Retrabalho de 6% nos conjuntos montados."),
    ("Adequação do layout do almoxarifado", "Logística", "Deslocamentos excessivos na separação."),
]

ACOES = [
    "Levantar dados históricos do problema",
    "Realizar análise de causa raiz (Ishikawa)",
    "Definir e documentar o novo procedimento",
    "Treinar a equipe no novo procedimento",
    "Instalar dispositivo de controle",
    "Revisar a instrução de trabalho",
    "Validar a eficácia com indicadores",
    "Solicitar orçamento e aprovar compra",
    "Executar ajuste no equipamento",
    "Auditar o processo após a mudança",
]


@dataclass
class Contexto:
    rng: random.Random
    hoje: date
    agora: datetime  # UTC naive
    gestores: list[Usuario]
    executores: list[Usuario]
    criador: Usuario


def _momento(dia: date, rng: random.Random, agora: datetime) -> datetime:
    """Horário comercial aleatório no dia (local), em UTC naive, nunca no futuro."""
    momento = inicio_do_dia_utc(dia) + timedelta(hours=rng.randint(8, 17), minutes=rng.randint(0, 59))
    return min(momento, agora)


def _destino_plano(ctx: Contexto, criado: date, prazo: date) -> str:
    """Roteiro do seed: "concluido", "em_andamento", "arquivado" (sem ações ativas) ou "rascunho".
    O status gravado é calculado depois pelas ações (mesma regra do sistema)."""
    r = ctx.rng.random()
    if prazo < ctx.hoje:
        return "concluido" if r < 0.6 else "em_andamento" if r < 0.9 else "arquivado"
    if (ctx.hoje - criado).days < 3 and r < 0.4:
        return "rascunho"
    return "concluido" if r < 0.1 else "em_andamento"


def _criar_acao(
    ctx: Contexto, db: Session, plano: PlanoDeAcao, criado_em: datetime, prazo: date, numero: int, destino_plano: str
) -> None:
    rng = ctx.rng
    responsavel = rng.choice(ctx.executores)
    acao = Acao(
        plano=plano,
        numero=numero,
        descricao=rng.choice(ACOES),
        responsavel_id=responsavel.id,
        area_id=plano.area_id,
        setor_id=plano.setor_id,
        prazo_inicio=max(plano.data_inicio_estimado, prazo - timedelta(days=rng.randint(3, 20))),
        prazo=prazo,
        criado_por_id=ctx.criador.id,
        prioridade=rng.choice(list(Prioridade)),
        status=StatusAcao.AGUARDANDO_ACEITE,
        progresso=0,
        criado_em=criado_em,
    )
    db.add(acao)
    registrar_historico(db, acao, ctx.criador.id, EventoHistorico.CRIACAO, quando=criado_em)

    def mudar(campo: str, novo, quando: datetime, usuario_id: int = responsavel.id) -> None:
        anterior = getattr(acao, campo)
        setattr(acao, campo, novo)
        registrar_historico(db, acao, usuario_id, EventoHistorico.ALTERACAO, campo, anterior, novo, quando)

    # Destino da ação conforme o roteiro do plano.
    if destino_plano == "rascunho":
        return
    if destino_plano == "arquivado":
        acao.motivo_cancelamento = "Plano encerrado sem execução."
        mudar("status", StatusAcao.CANCELADA, plano.atualizado_em, ctx.criador.id)
        return

    # Os eventos acontecem dentro da janela entre a criação e o fim (conclusão do plano ou agora).
    limite = plano.concluido_em or ctx.agora
    janela = limite - criado_em

    def instante(fracao_min: float, fracao_max: float) -> datetime:
        return criado_em + janela * rng.uniform(fracao_min, fracao_max)

    decorrido = (ctx.hoje - criado_em.date()).days
    if destino_plano == "concluido":
        destino = StatusAcao.CONCLUIDA
    elif decorrido < 2:
        destino = rng.choice([StatusAcao.AGUARDANDO_ACEITE, StatusAcao.ACEITA])
    elif decorrido < 10:
        destino = rng.choice([StatusAcao.AGUARDANDO_ACEITE, StatusAcao.ACEITA, StatusAcao.EM_ANDAMENTO])
    else:
        destino = rng.choices(
            [StatusAcao.CONCLUIDA, StatusAcao.EM_ANDAMENTO, StatusAcao.ACEITA,
             StatusAcao.AGUARDANDO_ACEITE, StatusAcao.BLOQUEADA, StatusAcao.RECUSADA],
            weights=[35, 30, 12, 10, 8, 5],
        )[0]

    if destino == StatusAcao.AGUARDANDO_ACEITE:
        return
    if destino == StatusAcao.RECUSADA:
        acao.motivo_recusa = "Ação fora do escopo da minha área."
        mudar("status", StatusAcao.RECUSADA, instante(0.02, 0.1))
        return

    t = instante(0.02, 0.15)
    acao.aceita_em = t
    mudar("status", StatusAcao.ACEITA, t)
    if destino == StatusAcao.ACEITA:
        return

    t = instante(0.15, 0.3)
    acao.iniciada_em = t
    mudar("status", StatusAcao.EM_ANDAMENTO, t)

    if destino == StatusAcao.CONCLUIDA:
        # ~75% concluídas até o prazo; o resto com atraso de alguns dias.
        if rng.random() < 0.75:
            alvo = prazo - timedelta(days=rng.randint(0, 5))
        else:
            alvo = prazo + timedelta(days=rng.randint(1, 10))
        fim = min(_momento(alvo, rng, ctx.agora), limite)
        fim = max(fim, t + timedelta(hours=1))
        mudar("progresso", 50, t + (fim - t) / 2)
        mudar("progresso", 100, fim)
        acao.concluida_em = fim
        mudar("status", StatusAcao.CONCLUIDA, fim)
        return

    mudar("progresso", rng.choice([10, 20, 30, 40, 50, 60, 70, 80]), instante(0.35, 0.7))
    if destino == StatusAcao.BLOQUEADA:
        acao.motivo_bloqueio = "Aguardando entrega de material."
        mudar("status", StatusAcao.BLOQUEADA, instante(0.7, 0.95))


def _criar_plano(ctx: Contexto, db: Session, idx: int, dias_atras: int, cadastros: dict) -> None:
    rng = ctx.rng
    nome, nome_area, problema = PLANOS[idx % len(PLANOS)]
    area: Area = cadastros["areas"][nome_area]
    criado_dia = ctx.hoje - timedelta(days=dias_atras)
    criado_em = _momento(criado_dia, rng, ctx.agora)
    data_fim_estimado = criado_dia + timedelta(days=rng.randint(30, 120))
    destino = _destino_plano(ctx, criado_dia, data_fim_estimado)

    concluido_em = None
    if destino == "concluido":
        dia_fim = min(data_fim_estimado + timedelta(days=rng.randint(-10, 15)), ctx.hoje)
        concluido_em = max(_momento(dia_fim, rng, ctx.agora), criado_em + timedelta(days=7))
        concluido_em = min(concluido_em, ctx.agora)

    plano = PlanoDeAcao(
        codigo=gerar_codigo_plano(db, criado_dia.year),
        nome=nome,
        tipo_id=rng.choice(cadastros["tipos"]).id,
        origem_id=rng.choice(cadastros["origens"]).id,
        area_id=area.id,
        setor_id=rng.choice(area.setores).id,
        responsavel_id=rng.choice(ctx.gestores).id,
        criado_por_id=ctx.criador.id,
        data_inicio_estimado=criado_dia,
        data_fim_estimado=data_fim_estimado,
        prioridade=rng.choice(list(Prioridade)),
        status=StatusPlano.NAO_INICIADO,  # recalculado pelas ações ao final do seed
        rascunho=destino == "rascunho",
        descricao_problema=problema,
        objetivo="Eliminar a causa do problema e evitar reincidência.",
        concluido_em=concluido_em,
        criado_em=criado_em,
        atualizado_em=concluido_em or criado_em,
    )
    if destino == "arquivado":
        plano.arquivado_em = plano.atualizado_em
        plano.arquivado_por_id = plano.responsavel_id
    db.add(plano)

    # Histórico do plano: criação e, se arquivado, o arquivamento.
    db.add(
        PlanoHistorico(
            plano=plano,
            usuario_id=ctx.criador.id,
            evento=EventoPlano.CRIACAO,
            campo_alterado="status",
            valor_novo=StatusPlano.NAO_INICIADO.value,
            criado_em=criado_em,
        )
    )
    if destino == "arquivado":
        db.add(
            PlanoHistorico(
                plano=plano, usuario_id=plano.responsavel_id, evento=EventoPlano.ARQUIVAMENTO, criado_em=plano.atualizado_em
            )
        )

    for numero in range(1, rng.randint(2, 6) + 1):
        # Prazos das ações entre a criação e o fim estimado do plano.
        prazo = criado_dia + timedelta(days=rng.randint(5, max(6, (data_fim_estimado - criado_dia).days)))
        if concluido_em:
            prazo = min(prazo, data_fim_estimado)
        _criar_acao(ctx, db, plano, criado_em, prazo, numero, destino)


def executar(db: Session, reset: bool = False) -> int:
    if reset:
        # Vínculos de dependência primeiro: o pré-requisito é RESTRICT.
        db.execute(delete(acao_dependencia))
        for model in (
            GamificacaoLancamento, Notificacao, AcaoSolicitacaoAlteracao, AcaoHistorico, Acao,
            PlanoAnexo, PlanoHistorico, PlanoDeAcao, PlanoSequencia,
        ):
            db.execute(delete(model))
        db.flush()
        # Os arquivos dos anexos apagados ficariam órfãos no disco.
        shutil.rmtree(Path(get_settings().UPLOAD_DIR) / "planos", ignore_errors=True)
    elif db.scalar(select(PlanoDeAcao.id).limit(1)) is not None:
        return 0

    cadastros = {
        "tipos": [_obter_ou_criar(db, TipoPlano, {"nome": n}) for n in TIPOS],
        "origens": [_obter_ou_criar(db, OrigemPlano, {"nome": n}) for n in ORIGENS],
        "areas": {a.nome: a for a in db.scalars(select(Area))},
    }
    # Compatibilidade Tipo ↔ Origem: no seed, toda origem vale para todo tipo (cada empresa ajusta depois).
    for tipo in cadastros["tipos"]:
        if not tipo.origens:
            tipo.origens = list(cadastros["origens"])
    usuarios = {u.email.split("@")[0]: u for u in db.scalars(select(Usuario))}
    if "joao.silva" not in usuarios:
        raise SystemExit("Rode antes: python -m app.seed.seed_auth")

    ctx = Contexto(
        rng=random.Random(20260923),
        hoje=hoje_local(),
        agora=utcnow(),
        gestores=[usuarios["joao.silva"], usuarios["maria.santos"]],
        executores=[usuarios[n] for n in ("carlos.lima", "fernanda.rocha", "joao.silva", "maria.santos")],
        criador=usuarios["joao.silva"],
    )

    # Alguns planos bem recentes (para os filtros hoje/7d/30d) e o resto espalhado no último ano.
    dias_atras = [0, 2, 4, 6, 9, 13, 18, 24] + sorted(ctx.rng.sample(range(31, 360), 22))
    dias_atras.sort(reverse=True)  # do mais antigo ao mais novo: códigos crescem com a data
    for idx, dias in enumerate(dias_atras):
        _criar_plano(ctx, db, idx, dias, cadastros)

    # Status global = regra do sistema, calculada pelas ações (a conclusão mantém a data do roteiro).
    db.flush()
    for plano in db.scalars(select(PlanoDeAcao)):
        concluido_em = plano.concluido_em
        plano.status = status_calculado(plano)
        plano.concluido_em = concluido_em if plano.status == StatusPlano.CONCLUIDO else None

    db.commit()
    # O seed grava direto no banco (sem os services): credita as conclusões geradas.
    creditar_historico(db)
    return len(dias_atras)


def main() -> None:
    if get_settings().ENVIRONMENT == "production":
        raise SystemExit("Seed de desenvolvimento não pode rodar em produção.")
    with SessionLocal() as db:
        total = executar(db, reset="--reset" in sys.argv)
    print(f"Seed de planos: {total} planos criados." if total else "Já existem planos; use --reset para recriar.")


if __name__ == "__main__":
    main()
