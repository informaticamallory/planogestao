"""Modelos editáveis dos e-mails (tela Configurações de e-mail) e o ÚNICO renderizador da mensagem.

Prévia, e-mail de teste e envio real passam por `renderizar`: o que o administrador vê na prévia é o
que sai. O corpo é texto simples com variáveis `{{nome}}`; texto e valores são escapados e colocados no
layout visual fixo do sistema (cabeçalho, botão "Acessar no sistema" e rodapé), então não há HTML
injetável no modelo.

Sem linha salva para um evento, vale o texto padrão abaixo (ativo). Credenciais e remetente ficam só
nas variáveis de ambiente (core/config.py), nunca aqui.
"""

import re
from dataclasses import dataclass
from html import escape

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import ConfigEmail, HistoricoConfigEmail, ModeloEmail, Usuario


class ModeloInvalido(ValueError):
    pass


# ---- catálogo -----------------------------------------------------------------------------------

VAZIO = "—"  # campo sem informação (nunca "None"/"null"/"undefined")

_VARIAVEIS_COMUNS = {
    "destinatario": "Nome de quem recebe o e-mail.",
    "numero_pa": "Código do Plano de Ação (ex.: PA-2026-0015).",
    "titulo_pa": "Nome do Plano de Ação.",
    "responsavel": "Responsável pelo registro criado.",
    "area": "Área do registro.",
    "setor": f"Função/cargo do registro ({VAZIO} quando não houver).",
    "prazo_inicial": "Prazo inicial estimado (dd/mm/aaaa).",
    "prazo_conclusao": "Prazo de conclusão (dd/mm/aaaa).",
    "criado_por": "Quem cadastrou o registro.",
    "link_registro": "Endereço direto do registro (o botão “Acessar no sistema” já usa este link).",
}


@dataclass(frozen=True)
class DefModelo:
    evento: str
    nome: str
    variaveis: dict[str, str]
    assunto: str
    corpo: str
    botao: str = "Acessar no sistema"
    nota_botao: str = "O acesso exige login e respeita as suas permissões."
    # Convite: o link é pessoal (contém o token), então nunca vai para cópia oculta.
    com_cco: bool = True
    # Variáveis que o corpo precisa manter (ex.: o conteúdo do resumo semanal).
    obrigatorias: tuple[str, ...] = ()
    # Variáveis montadas pelo sistema como bloco visual (listas, seções e botões), não como texto simples.
    blocos: tuple[str, ...] = ()


_VARIAVEIS_ITEM = {
    "destinatario": _VARIAVEIS_COMUNS["destinatario"],
    "numero_pa": _VARIAVEIS_COMUNS["numero_pa"],
    "titulo_pa": _VARIAVEIS_COMUNS["titulo_pa"],
    "item": "Ação ou sub-item (ex.: Ação 2 ou Sub-item 2.1).",
    "descricao": "Descrição do item.",
    "responsavel": "Responsável atual pelo item.",
    "prazo_inicial": _VARIAVEIS_COMUNS["prazo_inicial"],
    "prazo_conclusao": _VARIAVEIS_COMUNS["prazo_conclusao"],
    "link_registro": "Endereço direto do item (o botão do e-mail já usa este link).",
}

_RODAPE_DADOS = """Responsável: {{responsavel}}
Área: {{area}}
Função/Cargo: {{setor}}
Prazo inicial estimado: {{prazo_inicial}}
Prazo de conclusão: {{prazo_conclusao}}
Criado por: {{criado_por}}"""

CATALOGO: dict[str, DefModelo] = {
    d.evento: d
    for d in (
        DefModelo(
            "plano_criado",
            "Novo Plano de Ação",
            {**_VARIAVEIS_COMUNS, "descricao": "Descrição do Plano de Ação."},
            "[Planos de Ação] Novo plano atribuído: {{numero_pa}}",
            "Olá, {{destinatario}}.\n\nUm novo Plano de Ação foi criado e você é o responsável por ele.\n\n"
            "Plano de Ação: {{numero_pa}} — {{titulo_pa}}\nDescrição: {{descricao}}\n" + _RODAPE_DADOS,
        ),
        DefModelo(
            "acao_criada",
            "Nova ação",
            {
                **_VARIAVEIS_COMUNS,
                "numero_item": "Número da ação (ex.: 2).",
                "descricao": "O que será feito (descrição da ação).",
            },
            "[Planos de Ação] Nova ação atribuída: Ação {{numero_item}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\nUma nova ação foi atribuída a você no Plano de Ação {{numero_pa}} — {{titulo_pa}}.\n\n"
            "Ação {{numero_item}}: {{descricao}}\n" + _RODAPE_DADOS,
        ),
        DefModelo(
            "subitem_criado",
            "Novo sub-item",
            {
                **_VARIAVEIS_COMUNS,
                "numero_item": "Número do sub-item (ex.: 2.1 ou 2.1.3).",
                "descricao": "O que será feito (descrição do sub-item).",
                "item_pai": "Ação ou sub-item imediatamente acima (ex.: Ação 2 — Revisar o processo).",
            },
            "[Planos de Ação] Novo sub-item: {{numero_item}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\nUm novo sub-item foi criado no Plano de Ação {{numero_pa}} — {{titulo_pa}}, abaixo de "
            "{{item_pai}}. Você recebe este aviso por ser o responsável pelo sub-item ou pelo item acima dele.\n\n"
            "Sub-item {{numero_item}}: {{descricao}}\n" + _RODAPE_DADOS,
        ),
        DefModelo(
            "convite_colaborador",
            "Convite de primeiro acesso",
            {
                "destinatario": "Nome do colaborador convidado.",
                "convidado_por": "Quem enviou o convite.",
                "area": "Área de lotação do colaborador.",
                "validade": "Até quando o link vale (dd/mm/aaaa hh:mm).",
                "link_registro": "Link pessoal de primeiro acesso (o botão “Definir senha e acessar” já usa este link).",
            },
            "[Planos de Ação] Convite para acessar o sistema",
            "Olá, {{destinatario}}.\n\n{{convidado_por}} convidou você para acessar o sistema de Planos de Ação "
            "(área {{area}}).\n\nUse o botão abaixo para definir a sua senha. O link é pessoal, vale até {{validade}} e só "
            "pode ser usado uma vez. Se você não esperava este convite, ignore esta mensagem.",
            botao="Definir senha e acessar",
            nota_botao="Nunca pedimos sua senha por e-mail.",
            com_cco=False,
        ),
        # ---- avisos operacionais (services/avisos.py) --------------------------------------------
        DefModelo(
            "acao_atribuida",
            "Ação atribuída (troca de responsável)",
            {**_VARIAVEIS_ITEM, "responsavel_anterior": "Quem respondia pelo item antes da troca.",
             "atribuido_por": "Quem fez a troca de responsável."},
            "[Planos de Ação] Item atribuído a você: {{item}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\n{{atribuido_por}} atribuiu a você o item {{item}} do Plano de Ação {{numero_pa}} — "
            "{{titulo_pa}}.\n\nDescrição: {{descricao}}\nResponsável: {{responsavel}}\nResponsável anterior: "
            "{{responsavel_anterior}}\nPrazo inicial estimado: {{prazo_inicial}}\nPrazo de conclusão: {{prazo_conclusao}}",
            botao="Ver item",
        ),
        DefModelo(
            "prazo_proximo",
            "Prazo próximo",
            {**_VARIAVEIS_ITEM, "dias_restantes": "Dias que faltam para o vencimento (ex.: 3; 0 = vence hoje).",
             "vence": "Quando vence, por extenso (ex.: em 3 dias, amanhã, hoje).",
             "progresso": "Progresso atual do item (ex.: 40%)."},
            "[Planos de Ação] Prazo próximo: {{item}} vence {{vence}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\nO item {{item}} do Plano de Ação {{numero_pa}} — {{titulo_pa}} vence {{vence}} e "
            "ainda está em aberto.\n\nDescrição: {{descricao}}\nVencimento: {{prazo_conclusao}}\nDias restantes: {{dias_restantes}}\n"
            "Progresso: {{progresso}}",
            botao="Ver item",
        ),
        DefModelo(
            "prazo_alterado",
            "Alteração de prazo",
            {**_VARIAVEIS_ITEM,
             "item": "Registro alterado (ex.: Ação 2, Sub-item 2.1 ou Plano de Ação).",
             "prazo_inicial_anterior": "Data inicial antes da alteração (dd/mm/aaaa).",
             "prazo_inicial_novo": "Data inicial depois da alteração.",
             "prazo_conclusao_anterior": "Data final antes da alteração.",
             "prazo_conclusao_novo": "Data final depois da alteração.",
             "alterado_por": "Quem alterou as datas.",
             "motivo": f"Motivo informado ({VAZIO} quando não houver)."},
            "[Planos de Ação] Prazo alterado: {{item}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\n{{alterado_por}} alterou as datas de {{item}} do Plano de Ação {{numero_pa}} — "
            "{{titulo_pa}}.\n\nDescrição: {{descricao}}\nData inicial: {{prazo_inicial_anterior}} → {{prazo_inicial_novo}}\n"
            "Data final: {{prazo_conclusao_anterior}} → {{prazo_conclusao_novo}}\nMotivo: {{motivo}}",
            botao="Ver registro",
        ),
        DefModelo(
            "acao_concluida",
            "Ação concluída",
            {**_VARIAVEIS_ITEM, "concluido_por": "Quem concluiu o item.", "data_conclusao": "Data da conclusão (dd/mm/aaaa).",
             "situacao_prazo": "Situação em relação ao prazo (no prazo, antecipado ou com atraso)."},
            "[Planos de Ação] Concluído: {{item}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\n{{concluido_por}} concluiu o item {{item}} do Plano de Ação {{numero_pa}} — "
            "{{titulo_pa}}.\n\nDescrição: {{descricao}}\nResponsável: {{responsavel}}\nData de conclusão: {{data_conclusao}}\n"
            "Prazo de conclusão: {{prazo_conclusao}}\nSituação em relação ao prazo: {{situacao_prazo}}",
            botao="Ver item",
        ),
        DefModelo(
            "dependencia_liberada",
            "Dependência liberada",
            {**_VARIAVEIS_ITEM, "dependencias": "Pré-requisitos atendidos (do item e dos itens acima dele)."},
            "[Planos de Ação] Liberado para iniciar: {{item}} — {{numero_pa}}",
            "Olá, {{destinatario}}.\n\nTodos os pré-requisitos do item {{item}} do Plano de Ação {{numero_pa}} — {{titulo_pa}} "
            "foram concluídos: ele já pode ser iniciado.\n\nItem liberado: {{item}} — {{descricao}}\nDependências atendidas: "
            "{{dependencias}}\nPrazo inicial estimado: {{prazo_inicial}}\nPrazo de conclusão: {{prazo_conclusao}}\n\n"
            "Este aviso não inicia o item nem altera as datas.",
            botao="Ver item",
        ),
        DefModelo(
            "plano_sem_atualizacao",
            "Plano sem atualização",
            {"destinatario": _VARIAVEIS_COMUNS["destinatario"], "numero_pa": _VARIAVEIS_COMUNS["numero_pa"],
             "titulo_pa": _VARIAVEIS_COMUNS["titulo_pa"],
             "ultima_movimentacao": "Última movimentação relevante (o quê, quem e quando).",
             "dias_sem_atualizacao": "Dias desde a última movimentação relevante.",
             "link_registro": "Endereço direto do plano (o botão “Ver plano” já usa este link)."},
            "[Planos de Ação] Plano sem atualização há {{dias_sem_atualizacao}} dias: {{numero_pa}}",
            "Olá, {{destinatario}}.\n\nO Plano de Ação {{numero_pa}} — {{titulo_pa}} está sem movimentações relevantes há "
            "{{dias_sem_atualizacao}} dias.\n\nÚltima movimentação: {{ultima_movimentacao}}\n\nAtualize o andamento das ações "
            "ou registre o que está pendente.",
            botao="Ver plano",
        ),
        DefModelo(
            "resumo_semanal",
            "Resumo semanal do plano",
            {"destinatario": _VARIAVEIS_COMUNS["destinatario"],
             "periodo_inicio": "Primeiro dia do período coberto (dd/mm/aaaa).",
             "periodo_fim": "Último dia do período coberto (dd/mm/aaaa).",
             "quantidade_planos": "Quantos planos o resumo traz (ex.: 2 planos).",
             "resumo": "Conteúdo montado pelo sistema: uma seção por plano, com o botão “Ver plano” (obrigatório)."},
            "[Planos de Ação] Resumo semanal: {{periodo_inicio}} a {{periodo_fim}}",
            "Olá, {{destinatario}}.\n\nEste é o resumo semanal dos planos sob sua responsabilidade, de {{periodo_inicio}} a "
            "{{periodo_fim}} ({{quantidade_planos}}).\n\n{{resumo}}",
            obrigatorias=("resumo",),
            blocos=("resumo",),
        ),
    )
}

# Dados fictícios da prévia e do e-mail de teste (nunca dados reais).
DADOS_FICTICIOS = {
    "destinatario": "Maria Exemplo",
    "numero_pa": "PA-2026-0015",
    "titulo_pa": "Excesso de refugo nas peças injetadas",
    "numero_item": "2",
    "descricao": "Calibrar o termopar do molde da injetora 3",
    "responsavel": "Maria Exemplo",
    "area": "Qualidade",
    "setor": "Controle de Qualidade",
    "prazo_inicial": "10/10/2026",
    "prazo_conclusao": "31/10/2026",
    "criado_por": "João Exemplo",
    "item_pai": "Ação 2 — Revisar o processo de injeção",
    "link_registro": "",  # preenchido com WEB_URL
    # avisos operacionais
    "item": "Ação 2",
    "responsavel_anterior": "João Exemplo",
    "atribuido_por": "João Exemplo",
    "dias_restantes": "3",
    "vence": "em 3 dias",
    "progresso": "40%",
    "prazo_inicial_anterior": "10/10/2026",
    "prazo_inicial_novo": "17/10/2026",
    "prazo_conclusao_anterior": "31/10/2026",
    "prazo_conclusao_novo": "14/11/2026",
    "alterado_por": "João Exemplo",
    "motivo": "Fornecedor adiou a entrega do termopar.",
    "concluido_por": "Maria Exemplo",
    "data_conclusao": "29/10/2026",
    "situacao_prazo": "No prazo (2 dias antes do vencimento)",
    "dependencias": "Ação 1 — Comprar o termopar novo",
    "ultima_movimentacao": "Progresso da Ação 2 atualizado por Maria Exemplo em 01/10/2026",
    "dias_sem_atualizacao": "8",
    "periodo_inicio": "28/09/2026",
    "periodo_fim": "04/10/2026",
    "quantidade_planos": "1 plano",
}


def blocos_ficticios(evento: str) -> dict[str, tuple[str, str]]:
    """Blocos montados pelo sistema, com dados fictícios (prévia e e-mail de teste)."""
    if evento != "resumo_semanal":
        return {}
    from app.services.resumo_semanal import exemplo_bloco  # evita import circular

    return {"resumo": exemplo_bloco(get_settings().WEB_URL.rstrip("/"))}


def dados_ficticios(evento: str) -> dict[str, str]:
    d = {**DADOS_FICTICIOS, "link_registro": f"{get_settings().WEB_URL.rstrip('/')}/acoes/0"}
    if evento == "plano_sem_atualizacao":
        d["link_registro"] = f"{get_settings().WEB_URL.rstrip('/')}/planos/0"
    if evento == "resumo_semanal":
        d["link_registro"] = ""
    if evento == "subitem_criado":
        d["numero_item"] = "2.1"
    if evento == "convite_colaborador":
        d.update(convidado_por="João Exemplo", validade="12/10/2026 14:00",
                 link_registro=f"{get_settings().WEB_URL.rstrip('/')}/primeiro-acesso")
    if evento == "plano_criado":
        d["descricao"] = "Reduzir o refugo da linha de injeção para menos de 2%."
        d["link_registro"] = f"{get_settings().WEB_URL.rstrip('/')}/planos/0"
    return {k: v for k, v in d.items() if k in CATALOGO[evento].variaveis}


# ---- validação e renderização -----------------------------------------------------------------------

_TOKEN = re.compile(r"\{\{(.*?)\}\}", re.S)
_NOME = re.compile(r"^[a-z_]+$")
_EMAIL = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")
MAX_CCO = 30


def validar_texto(evento: str, texto: str, campo: str) -> None:
    """Variáveis desconhecidas ou chaves sem fechar viram erro (antes de salvar, prever ou testar)."""
    permitidas = CATALOGO[evento].variaveis
    desconhecidas = []
    for bruto in _TOKEN.findall(texto):
        nome = bruto.strip()
        if not _NOME.match(nome) or nome not in permitidas:
            desconhecidas.append("{{" + bruto + "}}")
    if desconhecidas:
        raise ModeloInvalido(
            f"{campo}: variável(is) desconhecida(s) neste modelo: {', '.join(dict.fromkeys(desconhecidas))}. "
            f"Disponíveis: {', '.join('{{' + v + '}}' for v in permitidas)}."
        )
    resto = _TOKEN.sub("", texto)
    if "{{" in resto or "}}" in resto:
        raise ModeloInvalido(f"{campo}: há “{{{{” ou “}}}}” sem par. Use o formato {{{{nome_da_variavel}}}}.")


def validar_modelo(evento: str, assunto: str, corpo: str) -> tuple[str, str]:
    if evento not in CATALOGO:
        raise ModeloInvalido("Modelo inexistente.")
    assunto, corpo = " ".join(assunto.split()), corpo.replace("\r\n", "\n").strip()
    if not assunto:
        raise ModeloInvalido("Informe o assunto.")
    if len(assunto) > 255:
        raise ModeloInvalido("O assunto pode ter no máximo 255 caracteres.")
    if not corpo:
        raise ModeloInvalido("Informe o corpo da mensagem.")
    if len(corpo) > 20_000:
        raise ModeloInvalido("O corpo pode ter no máximo 20.000 caracteres.")
    validar_texto(evento, assunto, "Assunto")
    validar_texto(evento, corpo, "Corpo")
    presentes = {t.strip() for t in _TOKEN.findall(corpo)}
    if faltam := [v for v in CATALOGO[evento].obrigatorias if v not in presentes]:
        raise ModeloInvalido(f"Corpo: mantenha {', '.join('{{' + v + '}}' for v in faltam)} (conteúdo montado pelo sistema).")
    return assunto, corpo


def normalizar_cco(enderecos: list[str]) -> list[str]:
    """Valida, apara e remove repetidos (sem diferenciar maiúsculas). Erro lista os inválidos."""
    vistos: dict[str, str] = {}
    invalidos = []
    for bruto in enderecos:
        e = (bruto or "").strip()
        if not e:
            continue
        if len(e) > 255 or not _EMAIL.match(e):
            invalidos.append(e)
        else:
            vistos.setdefault(e.casefold(), e)
    if invalidos:
        raise ModeloInvalido(f"Endereço(s) de e-mail inválido(s): {', '.join(invalidos)}.")
    if len(vistos) > MAX_CCO:
        raise ModeloInvalido(f"Cadastre no máximo {MAX_CCO} endereços em cópia oculta.")
    return list(vistos.values())


def _substituir(texto: str, valores: dict[str, str], html: bool) -> str:
    def troca(m: re.Match) -> str:
        nome = m.group(1).strip()
        valor = valores.get(nome)
        valor = VAZIO if valor is None or str(valor).strip() == "" else str(valor)
        if not html:
            return valor
        if nome == "link_registro" and valor != VAZIO:
            return f'<a href="{escape(valor)}" style="color:{_COR}">{escape(valor)}</a>'
        return escape(valor)

    # No HTML o texto do modelo é escapado antes; os tokens {{…}} não contêm caracteres afetados.
    return _TOKEN.sub(troca, escape(texto) if html else texto)


@dataclass(frozen=True)
class Renderizado:
    assunto: str
    html: str
    texto: str


_COR = "#ff6600"  # laranja da marca (Mallory DS)


def renderizar(
    assunto: str, corpo: str, valores: dict[str, str], evento: str | None = None,
    blocos: dict[str, tuple[str, str]] | None = None,
) -> Renderizado:
    """Mesma renderização na prévia, no teste e no envio real. `valores` sem chave/vazio → "—".
    `evento` define o texto do botão (ex.: "Definir senha e acessar" no convite).
    `blocos`: variáveis montadas pelo sistema como (html, texto) — o HTML vem do próprio sistema, com os
    dados já escapados (ex.: as seções do resumo semanal); num parágrafo sozinho, entram sem <p> em volta."""
    d = CATALOGO.get(evento) if evento else None
    rotulo_botao = d.botao if d else "Acessar no sistema"
    nota_botao = d.nota_botao if d else "O acesso exige login e respeita as suas permissões."
    assunto_final = " ".join(_substituir(assunto, valores, html=False).split())[:255]
    blocos = blocos or {}
    marcas: dict[str, tuple[str, str]] = {}

    def marcar(m: re.Match) -> str:
        nome = m.group(1).strip()
        if nome not in blocos:
            return m.group(0)
        marca = f"\x00{len(marcas)}\x00"  # não é afetada pelo escape do HTML
        marcas[marca] = blocos[nome]
        return marca

    corpo = _TOKEN.sub(marcar, corpo)
    texto_corpo = _substituir(corpo, valores, html=False)
    corpo_html = _substituir(corpo, valores, html=True)
    for marca, (_, texto_bloco) in marcas.items():
        texto_corpo = texto_corpo.replace(marca, texto_bloco)

    def paragrafo(p: str) -> str:
        if p.strip() in marcas:
            return marcas[p.strip()][0]
        for marca, (html_bloco, _) in marcas.items():
            p = p.replace(marca, html_bloco)
        return f'<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#3d3632">{p.replace(chr(10), "<br>")}</p>'

    paragrafos = "".join(paragrafo(p) for p in re.split(r"\n\s*\n", corpo_html.strip()) if p.strip())
    link = valores.get("link_registro") or ""
    botao = (
        f'<p style="margin:22px 0 8px;text-align:center"><a href="{escape(link)}" style="display:inline-block;padding:12px 22px;'
        f'border-radius:10px;background:{_COR};color:#ffffff;font-weight:700;font-size:14px;text-decoration:none">{escape(rotulo_botao)}</a></p>'
        f'<p style="margin:0;text-align:center;font-size:12px;color:#8a817b">{escape(nota_botao)}</p>'
        if link
        else ""
    )
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>{escape(assunto_final)}</title></head>
<body style="margin:0;padding:0;background:#faf7f5;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #ece6e1;border-radius:16px;overflow:hidden">
<tr><td style="padding:18px 24px;border-bottom:1px solid #ece6e1">
<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:{_COR};color:#fff;font-weight:700">P</span>
<span style="margin-left:8px;font-size:16px;font-weight:700;color:#1f1b18;vertical-align:middle">PlanoGestão</span>
<span style="margin-left:6px;font-size:12px;color:#8a817b;vertical-align:middle">Mallory · Planos de Ação</span>
</td></tr>
<tr><td style="padding:24px">{paragrafos}{botao}</td></tr>
<tr><td style="padding:14px 24px;background:#faf7f5;font-size:11px;color:#8a817b">E-mail automático do sistema de Planos de Ação. Não responda a esta mensagem.</td></tr>
</table></td></tr></table></body></html>"""
    texto = texto_corpo.strip() + (f"\n\n{rotulo_botao}: {link}\n({nota_botao})" if link else "")
    return Renderizado(assunto=assunto_final, html=html, texto=texto)


# ---- persistência -----------------------------------------------------------------------------------


@dataclass(frozen=True)
class ModeloEfetivo:
    evento: str
    assunto: str
    corpo: str
    cco: list[str]
    ativo: bool
    personalizado: bool  # False = texto padrão (nunca salvo)


def modelo_efetivo(db: Session, evento: str) -> ModeloEfetivo:
    d = CATALOGO[evento]
    m = db.get(ModeloEmail, evento)
    if m is None:
        return ModeloEfetivo(evento, d.assunto, d.corpo, [], True, False)
    return ModeloEfetivo(evento, m.assunto, m.corpo, list(m.cco or []), m.ativo, True)


CHAVE_CCO_PADRAO = "cco_padrao"


def cco_padrao(db: Session) -> list[str]:
    c = db.get(ConfigEmail, CHAVE_CCO_PADRAO)
    return list(c.valor or []) if c else []


def _historico(db: Session, escopo: str, campo: str, anterior, novo, usuario: Usuario) -> None:
    fmt = lambda v: ", ".join(v) if isinstance(v, list) else (None if v is None else str(v))  # noqa: E731
    db.add(HistoricoConfigEmail(escopo=escopo, campo=campo, valor_anterior=fmt(anterior), valor_novo=fmt(novo), usuario_id=usuario.id))


def salvar_modelo(db: Session, evento: str, assunto: str, corpo: str, cco: list[str], ativo: bool, usuario: Usuario) -> ModeloEmail:
    assunto, corpo = validar_modelo(evento, assunto, corpo)
    cco = normalizar_cco(cco)
    atual = modelo_efetivo(db, evento)
    m = db.get(ModeloEmail, evento) or ModeloEmail(evento=evento)
    for campo, anterior, novo in (("assunto", atual.assunto, assunto), ("corpo", atual.corpo, corpo), ("cco", atual.cco, cco), ("ativo", atual.ativo, ativo)):
        if anterior != novo:
            _historico(db, evento, campo, anterior, novo, usuario)
    m.assunto, m.corpo, m.cco, m.ativo, m.atualizado_por_id = assunto, corpo, cco, ativo, usuario.id
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def salvar_cco_padrao(db: Session, enderecos: list[str], usuario: Usuario) -> ConfigEmail:
    novos = normalizar_cco(enderecos)
    c = db.get(ConfigEmail, CHAVE_CCO_PADRAO) or ConfigEmail(chave=CHAVE_CCO_PADRAO, valor=[])
    if list(c.valor or []) != novos:
        _historico(db, CHAVE_CCO_PADRAO, "cco", list(c.valor or []), novos, usuario)
    c.valor, c.atualizado_por_id = novos, usuario.id
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def historico(db: Session, limite: int = 30) -> list[HistoricoConfigEmail]:
    return list(db.scalars(select(HistoricoConfigEmail).order_by(HistoricoConfigEmail.id.desc()).limit(limite)))


def cco_do_envio(db: Session, modelo: ModeloEfetivo, principais: list[str]) -> list[str]:
    """CCO padrão + CCO do modelo, sem repetidos e sem quem já é destinatário principal do evento."""
    fora = {e.casefold() for e in principais if e}
    resultado: dict[str, str] = {}
    for e in [*cco_padrao(db), *modelo.cco]:
        if e.casefold() not in fora:
            resultado.setdefault(e.casefold(), e)
    return list(resultado.values())
