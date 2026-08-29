from __future__ import annotations

from pathlib import Path
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "Auditoria_Tecnica_Blog_Adecco_Peru_2026-08-28.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4
NAVY = colors.HexColor("#10243E")
BLUE = colors.HexColor("#168EEA")
TEAL = colors.HexColor("#22B8A7")
AMBER = colors.HexColor("#F6B94A")
CORAL = colors.HexColor("#EF6A64")
INK = colors.HexColor("#17212F")
MUTED = colors.HexColor("#617083")
LINE = colors.HexColor("#D9E2EC")
PALE_BLUE = colors.HexColor("#EEF7FF")
PALE_TEAL = colors.HexColor("#ECFBF8")
PALE_AMBER = colors.HexColor("#FFF7E5")
PALE_CORAL = colors.HexColor("#FFF0EF")
PALE_GRAY = colors.HexColor("#F5F7FA")


def register_fonts() -> tuple[str, str]:
    candidates = [
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
        ),
        (
            Path("C:/Windows/Fonts/calibri.ttf"),
            Path("C:/Windows/Fonts/calibrib.ttf"),
        ),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("AuditRegular", str(regular)))
            pdfmetrics.registerFont(TTFont("AuditBold", str(bold)))
            return "AuditRegular", "AuditBold"
    return "Helvetica", "Helvetica-Bold"


REGULAR, BOLD = register_fonts()


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_brand": ParagraphStyle(
            "cover_brand",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=13,
            leading=16,
            textColor=BLUE,
            spaceAfter=22,
            tracking=2,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName=BOLD,
            fontSize=29,
            leading=34,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=16,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=14,
            leading=21,
            textColor=MUTED,
            spaceAfter=12,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName=BOLD,
            fontSize=21,
            leading=26,
            textColor=NAVY,
            spaceBefore=2,
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName=BOLD,
            fontSize=14,
            leading=18,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=7,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName=BOLD,
            fontSize=11,
            leading=15,
            textColor=BLUE,
            spaceBefore=7,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=9.4,
            leading=14,
            textColor=INK,
            spaceAfter=7,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=7.8,
            leading=11,
            textColor=MUTED,
            wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "table",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=7.3,
            leading=10.2,
            textColor=INK,
            wordWrap="CJK",
        ),
        "table_bold": ParagraphStyle(
            "table_bold",
            parent=base["BodyText"],
            fontName=BOLD,
            fontSize=7.3,
            leading=10.2,
            textColor=INK,
            wordWrap="CJK",
        ),
        "table_header": ParagraphStyle(
            "table_header",
            parent=base["BodyText"],
            fontName=BOLD,
            fontSize=7.3,
            leading=10.2,
            textColor=colors.white,
            wordWrap="CJK",
        ),
        "callout": ParagraphStyle(
            "callout",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=9,
            leading=14,
            textColor=NAVY,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["BodyText"],
            fontName=REGULAR,
            fontSize=9,
            leading=13.2,
            leftIndent=12,
            firstLineIndent=-8,
            bulletIndent=0,
            textColor=INK,
            spaceAfter=4,
        ),
        "section_label": ParagraphStyle(
            "section_label",
            parent=base["Normal"],
            fontName=BOLD,
            fontSize=8,
            leading=10,
            textColor=BLUE,
            tracking=1.2,
            spaceAfter=5,
        ),
        "center_small": ParagraphStyle(
            "center_small",
            parent=base["Normal"],
            fontName=REGULAR,
            fontSize=8,
            leading=11,
            alignment=TA_CENTER,
            textColor=MUTED,
        ),
    }


S = styles()


def P(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, S[style])


def bullet(text: str) -> Paragraph:
    return Paragraph(f"- {text}", S["bullet"])


def callout(text: str, background=PALE_BLUE, border=BLUE):
    table = Table([[P(text, "callout")]], colWidths=[164 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.8, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def story_page_header():
    header = Table(
        [[P("I HERE | AUDITORIA TECNICA", "table_bold"), P("Blog Adecco Peru | 28 agosto 2026", "small")]],
        colWidths=[82 * mm, 82 * mm],
    )
    header.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return header


def table(
    rows: Iterable[Iterable[str | Paragraph]],
    widths: list[float],
    header=True,
    repeat_rows=1,
) -> Table:
    converted = []
    for row_index, row in enumerate(rows):
        converted.append(
            [
                cell
                if isinstance(cell, Paragraph)
                else P(str(cell), "table_header" if header and row_index == 0 else "table")
                for cell in row
            ]
        )
    result = Table(converted, colWidths=widths, repeatRows=repeat_rows if header else 0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ]
        )
    for row_index in range(1 if header else 0, len(converted)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PALE_GRAY))
    result.setStyle(TableStyle(commands))
    return result


def finding(
    priority: str,
    title: str,
    evidence: str,
    risk: str,
    action: str,
    acceptance: str,
    owner: str,
):
    color = {"P0": CORAL, "P1": AMBER, "P2": TEAL}[priority]
    pale = {"P0": PALE_CORAL, "P1": PALE_AMBER, "P2": PALE_TEAL}[priority]
    rows = [
        [P(priority, "table_header"), P(title, "table_bold")],
        [P("Evidencia", "table"), P(evidence, "table")],
        [P("Riesgo", "table"), P(risk, "table")],
        [P("Corrección solicitada", "table"), P(action, "table")],
        [P("Prueba de aceptación", "table"), P(acceptance, "table")],
        [P("Responsable", "table"), P(owner, "table")],
    ]
    card = Table(rows, colWidths=[38 * mm, 126 * mm], repeatRows=1)
    commands = [
        ("BACKGROUND", (0, 0), (0, 0), color),
        ("BACKGROUND", (1, 0), (1, 0), pale),
        ("BOX", (0, 0), (-1, 0), 0.7, color),
        ("GRID", (0, 1), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_index in range(1, len(rows)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), PALE_GRAY))
    card.setStyle(TableStyle(commands))
    card.spaceAfter = 6 * mm
    return card


def draw_header_footer(canvas, doc):
    canvas.setFillColor(colors.white)
    canvas.rect(0, PAGE_HEIGHT - 18 * mm, PAGE_WIDTH, 18 * mm, stroke=0, fill=1)
    canvas.rect(0, 0, PAGE_WIDTH, 16 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(23 * mm, PAGE_HEIGHT - 15 * mm, PAGE_WIDTH - 23 * mm, PAGE_HEIGHT - 15 * mm)
    canvas.setFont(BOLD, 7.5)
    canvas.setFillColor(NAVY)
    canvas.drawString(23 * mm, PAGE_HEIGHT - 11.5 * mm, "I HERE | AUDITORIA TECNICA")
    canvas.setFont(REGULAR, 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(
        PAGE_WIDTH - 23 * mm,
        PAGE_HEIGHT - 11.5 * mm,
        "Blog Adecco Peru | 28 agosto 2026",
    )
    canvas.line(23 * mm, 14 * mm, PAGE_WIDTH - 23 * mm, 14 * mm)
    canvas.setFont(REGULAR, 7.2)
    canvas.drawString(23 * mm, 9.5 * mm, "Revision de superficie publica - no sustituye auditoria de codigo fuente")
    canvas.drawRightString(PAGE_WIDTH - 23 * mm, 9.5 * mm, f"Pagina {doc.page}")


def header_footer(canvas, doc, reset=False):
    canvas.saveState()
    if reset:
        canvas.resetTransforms()
    draw_header_footer(canvas, doc)
    canvas.restoreState()


class AuditDocTemplate(SimpleDocTemplate):
    def afterPage(self):
        if self.page > 1 and self.page != 8:
            header_footer(self.canv, self, reset=True)
            header_footer(self.canv, self)


def first_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PALE_BLUE)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
    canvas.setFillColor(BLUE)
    canvas.circle(PAGE_WIDTH - 24 * mm, PAGE_HEIGHT - 28 * mm, 34 * mm, stroke=0, fill=1)
    canvas.setFillColor(TEAL)
    canvas.circle(PAGE_WIDTH - 14 * mm, 22 * mm, 18 * mm, stroke=0, fill=1)
    canvas.setFillColor(AMBER)
    canvas.circle(18 * mm, PAGE_HEIGHT - 12 * mm, 9 * mm, stroke=0, fill=1)
    canvas.restoreState()


def reset_page_transform(canvas, doc):
    canvas.resetTransforms()


def build_story():
    story = [
        Spacer(1, 24 * mm),
        P("I HERE", "cover_brand"),
        P("Auditoría técnica SEO, GEO y AEO del blog de Adecco Perú", "cover_title"),
        P(
            "Diagnóstico de la superficie pública, prioridades técnicas y plan de aceptación para Tecnología, Marketing y la agencia.",
            "cover_subtitle",
        ),
        Spacer(1, 12 * mm),
        callout(
            "Objetivo: corregir señales técnicas que pueden dividir URLs, alterar metadatos o debilitar la medición de contenidos. I HERE seguirá operando en modo de solo lectura y no modifica el CMS de Adecco.",
            colors.white,
            BLUE,
        ),
        Spacer(1, 21 * mm),
        table(
            [
                ["Documento", "Auditoría pública del blog"],
                ["Fecha de revisión", "28 de agosto de 2026"],
                ["Sitio", "https://www.adecco.com/es-pe/blog"],
                ["Preparado por", "I HERE - Automatización editorial y analítica"],
                ["Destinatarios", "Tecnología de Adecco Perú, Marketing y agencia"],
                ["Clasificación", "Uso de trabajo - evidencia pública"],
            ],
            [38 * mm, 126 * mm],
            header=False,
            repeat_rows=0,
        ),
        Spacer(1, 15 * mm),
        P("ALCANCE", "section_label"),
        P(
            "Se revisaron páginas públicas, robots.txt, sitemaps y muestras de artículos. No se accedió al CMS, repositorio, Tag Manager ni configuraciones de GA4 o Search Console.",
            "body",
        ),
        PageBreak(),
        P("01  Resumen ejecutivo", "h1"),
        P(
            "La auditoría encontró dos hallazgos críticos y cinco observaciones de prioridad alta o media. Los problemas principales están en la plantilla pública y en la política de URLs: canonicales contradictorios, redirecciones repetitivas, metadatos duplicados, fechas inconsistentes y sitemap con variantes incompletas.",
        ),
        callout(
            "Decisión recomendada: Tecnología de Adecco corrige primero los dos P0. Después limpia la plantilla, las fechas, BlogPosting y el sitemap. La agencia mantiene la medición y documenta el antes y después.",
            PALE_AMBER,
            AMBER,
        ),
        Spacer(1, 6 * mm),
        P("Resultado esperado", "h2"),
        bullet("Una sola URL canónica por artículo, consistente con og:url."),
        bullet("Cero bucles de redirección y máximo una redirección 301 hacia una página 200."),
        bullet("Una sola estructura html, title, metadescripción y h1 por documento."),
        bullet("Fechas visibles y estructuradas coherentes, sin publicaciones futuras visibles."),
        bullet("BlogPosting completo y sitemap compuesto solo por URLs canónicas 200."),
        Spacer(1, 5 * mm),
        P("Matriz de prioridades", "h2"),
        table(
            [
                ["Prioridad", "Hallazgo", "Impacto", "Responsable"],
                ["P0", "Canonical duplicado y og:url hacia Contacto", "Consolidación y atribución", "Tecnología Adecco"],
                ["P0", "Bucle en slugs con caracteres acentuados", "Rastreo y acceso", "Tecnología Adecco"],
                ["P1", "html, title, descripción y h1 duplicados", "Interpretación y mantenimiento", "Tecnología Adecco"],
                ["P1", "Fechas incompatibles o futuras", "Orden editorial y frescura", "Tecnología + Marketing"],
                ["P1", "Falta BlogPosting completo", "Claridad semántica", "Tecnología Adecco"],
                ["P1", "Sitemap con variantes truncadas", "Indexación y canibalización", "Tecnología Adecco"],
                ["P2", "Lectura y formato de fecha inconsistentes", "Confianza editorial", "Marketing + Tecnología"],
            ],
            [18 * mm, 68 * mm, 45 * mm, 33 * mm],
        ),
        PageBreak(),
        P("02  Hallazgos técnicos", "h1"),
        finding(
            "P0",
            "Dos canonicales y uno apunta a Contacto",
            "En la muestra inteligencia-artificial-en-recursos-humanos aparecen dos link rel=canonical. Uno apunta al artículo y otro a /es-pe/servicios/servicios-contactanos. El og:url también apunta a Contacto.",
            "Google y otras plataformas reciben señales contradictorias sobre la URL principal. La medición y los compartidos pueden atribuirse a una página distinta.",
            "Renderizar un único canonical absoluto y autorreferente. Alinear og:url con esa misma URL. Mantener Contacto solamente como destino del CTA.",
            "El HTML final contiene exactamente un canonical y un og:url; ambos son iguales a la URL pública normalizada del artículo.",
            "Tecnología de Adecco - plantilla del artículo",
        ),
        finding(
            "P0",
            "Redirección repetitiva en URLs con acentos",
            "La variante percent-encoded de selección especializada redirige a una versión con escapes en minúsculas. La nueva solicitud vuelve a recibir la misma redirección. La comprobación automatizada de I HERE la clasifica como bucle.",
            "Los clientes HTTP, rastreadores y herramientas pueden abandonar la URL antes de llegar a contenido 200. Se retrasan o pierden señales.",
            "Adoptar slugs ASCII sin acentos para nuevos artículos. Resolver variantes existentes con una única redirección 301 hacia la URL canónica final.",
            "curl -IL termina en 200 con cero o una redirección. La ubicación no se repite por diferencias de mayúsculas en escapes.",
            "Tecnología de Adecco - enrutamiento y CMS",
        ),
        PageBreak(),
        Spacer(1, 14 * mm),
        finding(
            "P1",
            "Estructura documental y metadatos duplicados",
            "La muestra pública contiene dos html, dos title, dos metadescripciones y dos h1. Los segundos valores no siempre coinciden con los primeros.",
            "Buscadores, navegadores y plataformas sociales pueden interpretar bloques distintos. La plantilla se vuelve difícil de mantener.",
            "Revisar la composición del documento y cualquier componente embebido. Emitir un solo head y un solo bloque editorial principal.",
            "El HTML contiene un html, un head, un title, una metadescripción principal y un h1 editorial.",
            "Tecnología de Adecco - frontend y plantilla",
        ),
        finding(
            "P1",
            "Fechas públicas incompatibles o futuras",
            "Se observaron dos fechas distintas en un mismo artículo o extracto. Selección especializada figuraba con 31 de agosto de 2026 aunque ya era visible el 28 de agosto.",
            "El orden editorial, los informes mensuales y las señales de frescura pueden quedar desalineados.",
            "Mantener una fuente de verdad para datePublished y otra para dateModified. No exponer una fecha futura mientras la página sea accesible o indexable.",
            "La fecha visible, el listado, BlogPosting y el sitemap coinciden. dateModified solo cambia ante una actualización real.",
            "Tecnología de Adecco + Marketing de contenidos",
        ),
        PageBreak(),
        finding(
            "P1",
            "Falta BlogPosting completo",
            "La muestra incluye BreadcrumbList, pero no un BlogPosting o Article que identifique título, canonical, autor, editor, imagen y fechas.",
            "Se reduce la claridad semántica para buscadores y sistemas generativos; no implica por sí sola pérdida de posición.",
            "Añadir JSON-LD BlogPosting con headline, description, mainEntityOfPage, datePublished, dateModified, author, publisher, image e inLanguage.",
            "La prueba de resultados enriquecidos no presenta errores y cada valor coincide con el contenido visible.",
            "Tecnología de Adecco - datos estructurados",
        ),
        finding(
            "P1",
            "Sitemap con rutas probablemente incompletas",
            "El sitemap contiene a la vez una ruta terminada en ...preparar-a-tus y otra en ...preparar-a-tus-equipos.",
            "Una variante truncada indexable puede competir con la versión completa o diluir señales.",
            "Conservar en el sitemap solo URLs canónicas que respondan 200. Redirigir o retirar la variante incompleta y añadir lastmod confiable.",
            "Cada URL del sitemap responde 200, coincide con su canonical y no es una variante truncada, paginada o redirigida.",
            "Tecnología de Adecco - generación de sitemap",
        ),
        PageBreak(),
        finding(
            "P2",
            "Tiempo de lectura y formato de fechas inconsistentes",
            "Tiempo de lectura 15 minutos se repite aunque otro bloque muestra 3 minutos. También aparecen cadenas de fecha sin espacios.",
            "La experiencia transmite menor control editorial y puede reducir la confianza del lector.",
            "Calcular el tiempo sobre el contenido final y renderizar fechas con una única función localizada para es-PE.",
            "Listado, artículo y metadatos muestran fecha y tiempo de lectura consistentes.",
            "Marketing de contenidos + Tecnología",
        ),
        P("Aprendizaje operativo", "h2"),
        P(
            "El principal aprendizaje es que la calidad editorial no termina al aprobar el texto: la plantilla, el routing, las fechas y los datos estructurados también forman parte del entregable. Por eso el cierre futuro debe conservar una evidencia técnica posterior a la publicación.",
        ),
        bullet("Validar primero la URL pública definitiva y luego iniciar los cortes de medición."),
        bullet("Separar la aprobación del contenido de la aceptación técnica de la publicación."),
        bullet("Registrar cada corrección observada para evitar que el mismo patrón reaparezca."),
        PageBreak(),
        P("03  Plan de remediación", "h1"),
        P(
            "El plan separa correcciones de infraestructura editorial y validación de resultados. Los plazos son una propuesta operativa y deben ajustarse al ciclo de despliegue de Adecco.",
        ),
        table(
            [
                ["Fase", "Ventana sugerida", "Trabajo", "Criterio de salida"],
                ["1. Contención", "0-3 días hábiles", "Canonical, og:url y bucles de redirección", "P0 validados en producción"],
                ["2. Plantilla", "4-7 días hábiles", "Estructura única, fechas y BlogPosting", "Muestras sin duplicados ni errores de schema"],
                ["3. Rastreo", "8-10 días hábiles", "Sitemap, lastmod y variantes truncadas", "Sitemap solo con canonicales 200"],
                ["4. Verificación", "Después del despliegue", "Rastreo técnico, GSC y comparación", "Acta de aceptación y monitoreo"],
            ],
            [29 * mm, 31 * mm, 61 * mm, 43 * mm],
        ),
        Spacer(1, 7 * mm),
        P("RACI operativo", "h2"),
        table(
            [
                ["Actividad", "Tecnología Adecco", "Marketing Adecco", "Agencia / I HERE"],
                ["Cambiar plantilla y routing", "Responsable", "Informado", "Consultado"],
                ["Validar fechas y autoría", "Consultado", "Responsable", "Apoyo"],
                ["Sincronizar GA4 y GSC", "Informado", "Informado", "Responsable"],
                ["Confirmar URL y fecha en I HERE", "Informado", "Consultado", "Responsable"],
                ["Reauditar producción", "Consultado", "Informado", "Responsable"],
            ],
            [49 * mm, 38 * mm, 38 * mm, 39 * mm],
        ),
        Spacer(1, 7 * mm),
        callout(
            "La implementación técnica en la web pertenece a Adecco. I HERE puede detectar, validar y agrupar URLs, pero no debe corregir silenciosamente el HTML que entrega el CMS.",
            PALE_CORAL,
            CORAL,
        ),
        PageBreak(),
        story_page_header(),
        Spacer(1, 8 * mm),
        P("04  Integración y control en I HERE", "h1"),
        P(
            "I HERE complementa la corrección técnica sin intervenir la plataforma de Adecco. El flujo conserva trazabilidad y aprobación humana.",
        ),
        bullet("Sincronización automática cada seis horas y sincronización manual disponible."),
        bullet("Lectura de GA4 y Search Console sin permisos de escritura."),
        bullet("Detección de artículos publicados por Tecnología aunque no exista una nota en I HERE."),
        bullet("Validación de HTTP, redirecciones, canonical y dominio configurado."),
        bullet("Agrupación de canonicales coincidentes y posibles variantes truncadas."),
        bullet("Selección de una URL recomendada, sin aprobación automática."),
        bullet("Confirmación humana de URL y fecha antes de activar cortes de 30, 60 y 90 días."),
        bullet("Archivo de variantes del mismo grupo después de confirmar la dirección elegida."),
        Spacer(1, 7 * mm),
        P("Estados de validación", "h2"),
        table(
            [
                ["Estado", "Significado", "Acción humana"],
                ["URL válida", "HTTP 200 y canonical autorreferente", "Confirmar fecha y URL"],
                ["Redirección válida", "Termina en 200 dentro del límite", "Revisar destino final"],
                ["Requiere revisión", "Canonical ausente, múltiple o distinto", "Validar con Tecnología"],
                ["URL con error", "404, bucle o exceso de redirecciones", "No confirmar; corregir origen"],
                ["Validación no disponible", "Timeout o error temporal", "Reintentar en la siguiente sincronización"],
            ],
            [34 * mm, 78 * mm, 52 * mm],
        ),
        Spacer(1, 7 * mm),
        P("Limitación de interpretación", "h2"),
        P(
            "Una variación de tráfico no debe atribuirse automáticamente a SEO, GEO, automatización o IA. Debe contrastarse con impresiones, clics, CTR, posición, páginas, consultas, estacionalidad, cambios técnicos y calidad de la medición.",
        ),
        Spacer(1, 47 * mm),
        HRFlowable(width="100%", thickness=0.5, color=LINE),
        P("Revision de superficie publica | Pagina 8", "center_small"),
        PageBreak(),
        P("05  Lista de aceptación", "h1"),
        P("Tecnología de Adecco puede usar esta lista como evidencia de cierre:"),
        table(
            [
                ["Control", "Evidencia requerida", "Estado"],
                ["Canonical único", "Conteo HTML = 1 y coincide con la URL pública", "Pendiente Adecco"],
                ["og:url correcto", "Coincide con canonical", "Pendiente Adecco"],
                ["Redirecciones", "curl -IL termina en 200 con máximo una 301", "Pendiente Adecco"],
                ["Estructura", "Un html, head, title, descripción y h1", "Pendiente Adecco"],
                ["Fechas", "Visible, BlogPosting y sitemap coherentes", "Pendiente Adecco"],
                ["BlogPosting", "Sin errores y alineado con contenido visible", "Pendiente Adecco"],
                ["Sitemap", "Solo canonicales 200, sin truncadas", "Pendiente Adecco"],
                ["I HERE", "Validación, agrupación y confirmación humana", "Implementado"],
            ],
            [49 * mm, 80 * mm, 35 * mm],
        ),
        Spacer(1, 8 * mm),
        P("Evidencia pública revisada", "h2"),
        P("https://www.adecco.com/es-pe/blog", "small"),
        P("https://www.adecco.com/robots.txt", "small"),
        P("https://www.adecco.com/sitemap.xml", "small"),
        P("https://www.adecco.com/es-pe-static-sitemap.xml", "small"),
        P("https://www.adecco.com/es-pe/blog/inteligencia-artificial-en-recursos-humanos", "small"),
        P("https://www.adecco.com/es-pe/blog/compensacion-total-por-que-el-salario-ya-no-es-el-unico-factor-para-atraer", "small"),
        P("https://www.adecco.com/es-pe/blog/seleccion-especializada-como-encontrar-perfiles-de-dificil-cobertura-en-un-mercado-cada", "small"),
        Spacer(1, 6 * mm),
        P("Referencias técnicas", "h2"),
        P("Google Search Central - Canonicalización: https://developers.google.com/search/docs/crawling-indexing/canonicalization", "small"),
        P("Google Search Central - Article structured data: https://developers.google.com/search/docs/appearance/structured-data/article", "small"),
        P("Google Search Central - Publication dates: https://developers.google.com/search/docs/appearance/publication-dates", "small"),
        P("Google Search Central - Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap", "small"),
        Spacer(1, 8 * mm),
        HRFlowable(width="100%", thickness=0.7, color=LINE),
        Spacer(1, 4 * mm),
        P(
            "Estas prácticas ayudan a entregar señales consistentes, pero no garantizan por sí solas indexación, posiciones ni presencia en respuestas generativas.",
            "center_small",
        ),
    ]
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = AuditDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=23 * mm,
        rightMargin=23 * mm,
        topMargin=22 * mm,
        bottomMargin=20 * mm,
        title="Auditoría técnica SEO, GEO y AEO del blog de Adecco Perú",
        author="I HERE",
        subject="Hallazgos, prioridades y pruebas de aceptación",
    )
    document.build(
        build_story(),
        onFirstPage=first_page,
        onLaterPages=reset_page_transform,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
