"""Enquadramento da foto de perfil (formato, encaixe, posição e zoom).

A imagem guardada é a foto inteira (sem recorte); o recorte é só visual, feito por quem exibe. O ajuste vai
junto da URL da foto, no fragmento (`…/abc.webp#f=c&m=p&x=0.5000&y=0.3000&z=1.400`): todo lugar que já mostra
`avatar_url` aplica o mesmo enquadramento, e o fragmento nunca é enviado ao servidor nas requisições.

- formato: "circular" | "quadrado" (cantos arredondados, o padrão do kit);
- encaixe: "preencher" (a foto cobre a moldura; x/y/zoom valem) | "inteira" (foto toda visível, sem cortes,
  com fundo neutro; x/y/zoom ficam guardados mas não se aplicam);
- x, y: 0..1, ponto da foto mantido no mesmo ponto da moldura (como object-position em %);
- zoom: 1..ZOOM_MAX sobre o "cobrir".
"""

from app.services.erros import RegraInvalida

FORMATOS = {"circular": "c", "quadrado": "q"}
ENCAIXES = {"preencher": "p", "inteira": "i"}
ZOOM_MAX = 3.0
AJUSTE_PADRAO = {"formato": "quadrado", "encaixe": "preencher", "x": 0.5, "y": 0.5, "zoom": 1.0}


def normalizar_ajuste(formato: str, encaixe: str, x: float, y: float, zoom: float) -> dict:
    if formato not in FORMATOS:
        raise RegraInvalida("Formato da foto inválido (circular ou quadrado).")
    if encaixe not in ENCAIXES:
        raise RegraInvalida("Encaixe da foto inválido (preencher ou inteira).")
    if not (0 <= x <= 1 and 0 <= y <= 1):
        raise RegraInvalida("Posição da foto fora da moldura.")
    if not (1 <= zoom <= ZOOM_MAX):
        raise RegraInvalida(f"Zoom da foto deve ficar entre 1 e {ZOOM_MAX:g}.")
    return {"formato": formato, "encaixe": encaixe, "x": round(x, 4), "y": round(y, 4), "zoom": round(zoom, 3)}


def fragmento(ajuste: dict | None) -> str:
    if not ajuste:
        return ""
    a = {**AJUSTE_PADRAO, **ajuste}
    return (
        f"#f={FORMATOS.get(a['formato'], 'q')}&m={ENCAIXES.get(a['encaixe'], 'p')}"
        f"&x={float(a['x']):.4f}&y={float(a['y']):.4f}&z={float(a['zoom']):.3f}"
    )


def sem_fragmento(url: str | None) -> str | None:
    if not url:
        return None
    return url.split("#", 1)[0] or None
