"""Geração de arquivos CSV, XLSX e PDF a partir de linhas já filtradas."""

import csv
import io
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from xml.sax.saxutils import escape

from app.core.tempo import fuso_local


@dataclass(frozen=True)
class Coluna:
    titulo: str
    valor: Callable[[Any], Any]
    largura: int = 14  # em caracteres (XLSX) / peso relativo (PDF)
    formato: str | None = None  # "data", "data_hora" ou "percentual"


def _texto(valor: Any, formato: str | None) -> str:
    if valor is None:
        return ""
    if formato == "percentual":
        return f"{valor}%"
    if isinstance(valor, datetime):
        return valor.strftime("%d/%m/%Y %H:%M")
    if isinstance(valor, date):
        return valor.strftime("%d/%m/%Y")
    return str(valor)


def _local(valor: Any) -> Any:
    """DATETIMEs do banco estão em UTC naive; exportamos no horário local."""
    if isinstance(valor, datetime) and valor.tzinfo is not None:
        return valor.astimezone(fuso_local()).replace(tzinfo=None)
    return valor


def gerar_csv(colunas: Sequence[Coluna], linhas: Sequence[Any]) -> bytes:
    # ";" + BOM UTF-8: é o que o Excel em pt-BR abre corretamente com duplo clique.
    buffer = io.StringIO()
    escritor = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    escritor.writerow([c.titulo for c in colunas])
    for linha in linhas:
        escritor.writerow([_texto(_local(c.valor(linha)), c.formato) for c in colunas])
    return buffer.getvalue().encode("utf-8-sig")


@dataclass
class ArquivoGerado:
    conteudo: bytes
    media_type: str
    nome: str


MEDIA_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


@dataclass(frozen=True)
class Aba:
    """Aba adicional do XLSX (ex.: totais, histórico). CSV e PDF levam só a aba principal."""

    titulo: str
    colunas: Sequence[Coluna]
    linhas: Sequence[Any]


def gerar_arquivo(
    formato: str, titulo: str, nome_base: str, cabecalho: Sequence[str], colunas: Sequence[Coluna], linhas: Sequence[Any],
    abas: Sequence[Aba] = (),
) -> ArquivoGerado:
    """Um só ponto de geração: o mesmo conjunto de linhas vira CSV, XLSX ou PDF.

    `cabecalho` (geração, filtros aplicados) vai no topo do PDF e numa aba "Filtros" do XLSX;
    o CSV leva só os dados, para continuar importável por outras ferramentas.
    """
    from app.core.security import utcnow

    nome = f"{nome_base}_{utcnow().strftime('%Y%m%d_%H%M')}.{formato}"
    if formato == "csv":
        conteudo = gerar_csv(colunas, linhas)
    elif formato == "xlsx":
        conteudo = gerar_xlsx(titulo, colunas, linhas, cabecalho, abas)
    else:
        conteudo = gerar_pdf(titulo, cabecalho, colunas, linhas)
    return ArquivoGerado(conteudo, MEDIA_TYPES[formato], nome)


def gerar_xlsx(
    titulo: str, colunas: Sequence[Coluna], linhas: Sequence[Any], cabecalho: Sequence[str] = (), abas: Sequence[Aba] = ()
) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    _preencher_aba(wb.active, titulo, colunas, linhas)
    for aba in abas:
        _preencher_aba(wb.create_sheet(), aba.titulo, aba.colunas, aba.linhas)

    if cabecalho:
        info = wb.create_sheet("Filtros")
        info.append([titulo])
        info["A1"].font = Font(bold=True)
        for linha in cabecalho:
            info.append([linha])
        info.column_dimensions["A"].width = 100

    saida = io.BytesIO()
    wb.save(saida)
    return saida.getvalue()


def _preencher_aba(ws, titulo: str, colunas: Sequence[Coluna], linhas: Sequence[Any]) -> None:
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    ws.title = titulo[:31]  # limite do Excel
    ws.append([c.titulo for c in colunas])
    for celula in ws[1]:
        celula.font = Font(bold=True)
        celula.fill = PatternFill("solid", fgColor="E2E8F0")

    for linha in linhas:
        valores = []
        for c in colunas:
            v = _local(c.valor(linha))
            valores.append(v / 100 if c.formato == "percentual" and v is not None else v)
        ws.append(valores)

    for i, c in enumerate(colunas, start=1):
        letra = get_column_letter(i)
        ws.column_dimensions[letra].width = c.largura
        formato = {"data": "DD/MM/YYYY", "data_hora": "DD/MM/YYYY HH:MM", "percentual": "0%"}.get(c.formato or "")
        if formato:
            for (celula,) in ws.iter_rows(min_row=2, min_col=i, max_col=i):
                celula.number_format = formato

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions


def gerar_pdf(titulo: str, subtitulos: Sequence[str], colunas: Sequence[Coluna], linhas: Sequence[Any]) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    saida = io.BytesIO()
    margem = 10 * mm
    doc = SimpleDocTemplate(
        saida, pagesize=landscape(A4), leftMargin=margem, rightMargin=margem, topMargin=margem, bottomMargin=margem,
        title=titulo,
    )
    estilos = getSampleStyleSheet()
    celula = estilos["BodyText"].clone("celula", fontSize=7, leading=8.5)
    cabecalho = celula.clone("cabecalho", fontName="Helvetica-Bold")

    # Paragraph interpreta marcação (<b>, &amp;...): todo texto vindo do banco é escapado.
    dados = [[Paragraph(escape(c.titulo), cabecalho) for c in colunas]]
    for linha in linhas:
        dados.append([Paragraph(escape(_texto(_local(c.valor(linha)), c.formato)), celula) for c in colunas])

    peso_total = sum(c.largura for c in colunas)
    larguras = [doc.width * c.largura / peso_total for c in colunas]
    tabela = Table(dados, colWidths=larguras, repeatRows=1)
    tabela.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]
        )
    )

    elementos = [Paragraph(escape(titulo), estilos["Title"])]
    elementos += [Paragraph(escape(s), estilos["Normal"]) for s in subtitulos]
    elementos += [Spacer(1, 4 * mm), tabela]

    def rodape(canvas, documento):
        canvas.setFont("Helvetica", 7)
        canvas.drawRightString(documento.pagesize[0] - margem, 5 * mm, f"Página {documento.page}")

    doc.build(elementos, onFirstPage=rodape, onLaterPages=rodape)
    return saida.getvalue()
