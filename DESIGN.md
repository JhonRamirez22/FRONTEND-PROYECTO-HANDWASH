---
name: HandWash Cloud
description: Interfaz operativa para observar estados reales del backend Java.
colors:
  primary: "hsl(221 71% 49%)"
  background: "hsl(220 20% 98%)"
  surface: "hsl(0 0% 100%)"
  foreground: "hsl(222 25% 14%)"
  muted-text: "hsl(218 11% 39%)"
  border: "hsl(218 16% 86%)"
  accent-soft: "hsl(221 80% 96%)"
  warning: "hsl(36 93% 42%)"
  success: "hsl(150 67% 34%)"
  destructive: "hsl(0 67% 48%)"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(28px, 3vw, 42px)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 670
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "9px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "8px"
    padding: "0 11px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "11px"
    padding: "19px"
---

# Design System: HandWash Cloud

## Overview

**Creative North Star: “Tablero clínico operativo”.**

La interfaz prioriza lectura rápida y estados verificables. Conserva convenciones conocidas de un dashboard, con superficies claras, texto oscuro y azul reservado para la acción primaria. El diseño no imita una app nativa ni usa una metáfora decorativa.

El operador sigue una ruta concreta: vista local de Continuity, relay RTX/YOLO pendiente y API Java como autoridad. La consola ADMIN se mantiene de solo lectura. Las referencias a Linear, Notion y Stripe aportan densidad, calma y claridad operativa; no se copian marcas, componentes ni sistemas visuales.

## Colors

### Primary
- **Azul de acción** (`hsl(221 71% 49%)`): acción primaria y énfasis de navegación.
- **Azul suave** (`hsl(221 80% 96%)`): navegación activa y estados seleccionados.

### Semantic
- **Ámbar de advertencia** (`hsl(36 93% 42%)`): configuración pendiente, entorno no verificado o relay sin conectar.
- **Verde de servicio** (`hsl(150 67% 34%)`): conexión verificada, nunca aprobación clínica.
- **Rojo de error** (`hsl(0 67% 48%)`): error recuperable o acceso denegado.

### Neutral
- **Fondo frío** (`hsl(220 20% 98%)`), **superficie** (`hsl(0 0% 100%)`), **tinta** (`hsl(222 25% 14%)`), **texto secundario** (`hsl(218 11% 39%)`) y **borde** (`hsl(218 16% 86%)`).

**Regla de estado visible.** El texto siempre acompaña al color; el color por sí solo nunca comunica conectado, pendiente o error.

## Typography

**Display y cuerpo:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

### Hierarchy
- **Display** (650, `clamp(28px, 3vw, 42px)`, 1.08): encabezados de acceso.
- **Headline** (670, 23–26px, 1.2): tarea principal de cada pantalla.
- **Title** (640, 14–16px): paneles, controles y listas.
- **Body** (400, 14px, 1.5): instrucciones y descripción.
- **Label** (600, mínimo 11–12px): estado y metadatos; números de medición usan tabulares.

## Layout

En escritorio, una navegación lateral de 244px acompaña un área de trabajo de hasta 1530px. La estación dispone cámara y secuencia en la primera fila; controles e infracciones en la siguiente. A 1050px se reduce la navegación; a 820px pasa a encabezado y las secciones se apilan en el orden cámara, secuencia, control, infracciones. A 560px se compactan encabezados y formularios sin ocultar estados.

El ritmo usa pasos frecuentes de 8, 12, 16 y 24px. La consola de auditoría conserva tablas legibles con desplazamiento horizontal cuando el contenido supera el ancho disponible.

## Elevation & Depth

La profundidad es principalmente estructural: fondos tonales y bordes neutrales. El panel usa `0 1px 2px rgb(20 20 20 / 4%), 0 4px 12px rgb(20 20 20 / 3%)`; el acceso usa una elevación más amplia y tenue. No se usan halos cromáticos.

## Shapes

Los controles y paneles usan radios discretos de 6–12px. Los botones y campos se delimitan con un borde de 1px; los chips reservan formas más compactas. El recorte del video es oscuro por función, para distinguir la imagen real del resto de la superficie.

## Components

### Buttons
- Primario azul, 44px de alto, texto blanco; hover oscurece el fondo, focus muestra contorno y active reduce escala a 0.98.
- Quiet blanco con borde neutral, texto tinta y la misma altura táctil.
- Los controles se deshabilitan cuando falta configuración real; el estado explica qué falta.

### Status tags
- Superficie tenue con texto legible; estado escrito junto al indicador.
- “Propuesto” y “confirmado por Java” son estados separados.

### Cards / Containers
- Superficie blanca, borde neutral de 1px, radio de 11px y sombra tenue.
- Padding habitual 15–19px; no anidar paneles por decoración.

### Inputs / Fields
- Fondo blanco, borde neutral, radio 7px y foco visible de 3px.
- El error nombra el problema y, cuando existe, cómo recuperarse.

### Navigation
- Navegación lateral compacta en escritorio; navegación horizontal etiquetada en pantallas estrechas.
- Estado activo usa fondo azul suave y texto, no color solo.

### Ruta de procesamiento
- Tres pasos numerados porque representan la secuencia técnica: cámara local, relay RTX/YOLO aún pendiente y API Java.
- La cámara conectada indica únicamente vista previa local. Java solo se muestra disponible tras una respuesta REST válida.

### Movimiento
- El icono del botón de cámara cruza entre enlazar/desconectar mediante una transición CSS corta.
- Se respeta `prefers-reduced-motion`; no hay dependencia de animación.

## Do's and Don'ts

### Do:
- **Do** mantener CORS, Cognito, backend y productor RTX en estados explícitos y comprobados.
- **Do** ofrecer foco visible, controles táctiles de al menos 44px y compatibilidad con mayor contraste y movimiento reducido.
- **Do** mostrar valores y eventos confirmados por Java como fuente de verdad.

### Don't:
- **Don't** presentar la vista previa de Continuity como inferencia YOLO o como video transmitido al PC.
- **Don't** convertir una clase de modelo, estado del dashboard o evento de software en aprobación clínica.
- **Don't** guardar o transmitir fotos/video desde esta interfaz.
- **Don't** afirmar que CORS, Cognito o el relay RTX están configurados mientras las verificaciones fallen o falten.

## Provenance

Guías de método: [Taste redesign skill](https://github.com/Leonxlnx/taste-skill), [Transitions.dev](https://github.com/Jakubantalik/transitions.dev), [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) e Impeccable local. Solo se incorporó el patrón CSS de intercambio de iconos de Transitions.dev; no se empaquetan las skills ni se copiaron imágenes externas.
