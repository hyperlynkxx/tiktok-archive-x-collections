# TikTok archive x collections

**Bajá todos los videos que guardaste en TikTok, ordenados por las colecciones que armaste, y miralos
sin conexión en un visor donde decidís qué se queda.**

[Read in English](README.md)

**[Probá la demo en vivo](https://hyperlynkxx.github.io/tiktok-archive-x-collections/)**, con medios de muestra generados: dos colecciones, tres videos y tres slideshows.

TikTok deja guardar videos en colecciones, pero no deja exportarlas. La descarga oficial de datos
trae los favoritos como una lista de links sueltos, sin las colecciones. Esta herramienta cubre eso:

- **Las colecciones siguen siendo colecciones.** Cada item se guarda una sola vez, por su id, y el
  visor muestra en qué colecciones está.
- **Los videos bajan en H.264.** TikTok sirve casi todo en HEVC, y Chrome en Windows muchas veces no
  lo reproduce.
- **Los slideshows (posts de fotos) entran**, como sus imágenes más su audio. La mayoría de los
  descargadores los saltea.
- **Las tapas quedan en disco**, porque las del CDN de TikTok vencen en días.
- **Es incremental.** Si la volvés a correr en seis meses, baja solo lo nuevo.
- **Cada fallido es una línea** en `failed.json`, con su motivo.
- **El visor es un solo html**, que anda sin conexión con doble click. Tiene estrella y tacho por
  item, navegación con teclado, búsqueda y exportación de las decisiones.

## Cómo funciona

1. **`extract.js`**, en una pestaña de tiktok.com con tu sesión abierta, lista las colecciones y sus
   items desde la misma API que usa el sitio. Baja un manifiesto en json.
2. **`download.mjs`**, en la terminal, baja todo con yt-dlp a `archive/`: videos en H.264, fotos,
   audio y tapas.
3. **`archive/viewer.html`** se abre en cualquier navegador. Ahí marcás con estrella o tacho, y
   exportás lo que decidiste.
4. **`build.mjs --apply`** toma esas decisiones y mueve lo del tacho a `archive/trash/`.

**La lista tiene que salir del navegador.** Desde la terminal, el firewall de TikTok responde su API
con un challenge de JavaScript o con un cuerpo vacío, porque cada llamada lleva una firma que pone
el propio script de la página. Adentro de una pestaña de tiktok.com, ese script firma cada `fetch()`.

## Qué hace falta

- **Node.js 18 o más**
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)**, actualizado, porque TikTok cambia seguido
- **[ffmpeg](https://ffmpeg.org/)**
- **Un navegador Chromium** con TikTok abierto en tu cuenta
- **Un exportador de cookies.txt**, como [Get cookies.txt LOCALLY](https://github.com/kairi003/Get-cookies.txt-LOCALLY)
  (Chrome/Edge) o [cookies.txt](https://addons.mozilla.org/firefox/addon/cookies-txt/) (Firefox)

```bash
# Windows
winget install yt-dlp.yt-dlp Gyan.FFmpeg
# macOS
brew install yt-dlp ffmpeg
```

## Paso a paso

### 1. Exportá las cookies

Algunos videos tienen restricción de edad o solo se ven con sesión, así que yt-dlp necesita la tuya.

1. Abrí https://www.tiktok.com con tu cuenta.
2. Tocá la extensión y después **Export** del sitio actual.
3. Guardá el archivo **fuera de cualquier repo o carpeta sincronizada**, por ejemplo en
   `~/Downloads/www.tiktok.com_cookies.txt`.

> **Ese archivo es tu sesión.** Quien lo tenga entra como vos. No lo compartas ni lo commitees, y
> borralo cuando termine la corrida. El `.gitignore` de acá excluye `*cookies*.txt` por las dudas.

### 2. Sacá el manifiesto

Abrí https://www.tiktok.com/explore con tu sesión. Sirve cualquier página común, pero no todas traen
los datos de la cuenta que necesita `extract.js`. Abrí DevTools (F12) y andá a **Console**. Pegá entero
[`extract.js`](extract.js) y apretá Enter. Si Chrome lo pide, escribí antes `allow pasting`.

Va mostrando una línea por colección, y al final baja `tiktok-collections-AAAA-MM-DD.json`. Tarda:
unos 20 minutos para 50 colecciones y 9.000 items.

> **Corré el paso 3 el mismo día.** Las URLs de las imágenes y del audio de los slideshows vienen
> firmadas y vencen en días.

### 3. Bajá

```bash
# Primero probá con una colección chica
node download.mjs ~/Downloads/tiktok-collections-2026-10-23.json --cookies ~/Downloads/www.tiktok.com_cookies.txt --only "mi colección chica"

# Después, todo
node download.mjs ~/Downloads/tiktok-collections-2026-10-23.json --cookies ~/Downloads/www.tiktok.com_cookies.txt --threads 6
```

Todo va a `./archive`, salvo que pases `--archive <carpeta>`. Mientras corre, el visor se rearma
cada cinco minutos, así que podés empezar a mirar antes de que termine.

**Cuando termine, corré exactamente lo mismo otra vez.** Casi todos los fallidos de la primera pasada
(`Your IP address is blocked from accessing this post`, `Video not available`) son TikTok frenando
el ritmo, no videos que falten. En una corrida real de 7.856 items fallaron 35, y en la segunda pasada
bajaron los 35.

### 4. Mirá y decidí

Abrí `archive/viewer.html`.

| Tecla | Qué hace |
|---|---|
| ↑ ↓ / rueda | Item siguiente o anterior |
| ← → | Foto siguiente o anterior del slideshow |
| Espacio | Pausa o play |
| S | Estrella |
| D | Tacho |
| Esc | Cierra |

Las marcas se guardan en el navegador. **Export decisions** las baja como
`tiktok-decisions-AAAA-MM-DD.json`.

### 5. Aplicá lo que decidiste

```bash
node build.mjs --apply ~/Downloads/tiktok-decisions-2026-10-23.json
```

Lo del tacho pasa a `archive/trash/` y sale del visor, y lo que tiene estrella la conserva. **No se
borra nada.** Vaciar `trash/` lo decidís vos.

## El archivo

```
archive/
├── viewer.html          el visor (abrí este)
├── data.js              todo lo que muestra el visor; lo rearma build.mjs
├── videos/{id}.mp4      un archivo por video, en H.264
├── photos/{id}/         01.jpg, 02.jpg, … y audio.mp3 de cada slideshow
├── covers/{id}.jpg      la tapa de cada item
├── manifests/           cada manifiesto con el que corriste; el más nuevo define las colecciones
├── failed.json          lo que no bajó, y por qué
├── decisions.json       lo que --apply aplicó hasta ahora
└── trash/               lo que mandaste al tacho, esperando que lo borres
```

Para tener el visor en otro lado, por ejemplo en una bóveda de notas, con los videos en un disco grande:

```bash
node build.mjs --archive "D:/tiktok/archive" --out "~/notas/visor de tiktok.html"
```

## Con un agente de IA

Cada paso está pensado para que lo corra un agente, y así se corrió la primera vez: con
[Claude Code](https://claude.com/claude-code) y [Claude in Chrome](https://claude.com/chrome), que
deja al agente actuar en tu Chrome real, con tu sesión.

- **El agente corre `extract.js` en tu pestaña.** Puede lanzarlo sin esperar y consultar
  `window.__tiktokProgress` hasta que aparezca `window.__tiktokResult`.
- **Corre `download.mjs` en segundo plano**, lo repite para los fallidos y verifica el archivo contra
  el manifiesto.
- **Exportar las cookies sigue siendo un paso tuyo.** El agente nunca necesita ver el archivo: solo
  le pasa la ruta.

Un pedido que funciona:

> Hacé el backup de mis colecciones de TikTok con tiktok-archive-x-collections. Las cookies están en
> `~/Downloads/www.tiktok.com_cookies.txt`. Corré extract.js en una pestaña de tiktok.com con Claude
> in Chrome, probá download.mjs con la colección más chica que tenga slideshows, después corré todo
> con 6 hilos en segundo plano, repetí los fallidos y verificá que cada item del manifiesto esté en
> disco.

## Lo que aprendimos, para que no tengas que hacerlo

- **`_waftokenid` rompe yt-dlp.** Con las cookies enteras, TikTok devolvía 403 a todo. Esa cookie es
  un token del firewall atado al navegador, y `download.mjs` la saca de una copia temporal.
- **Las colecciones declaran más items de los que devuelven.** TikTok sigue contando los borrados y
  los que se hicieron privados. En una cuenta, 8.990 declarados fueron 8.185 reales.
- **La paginación de TikTok a veces miente.** Puede responder `hasMore: false` mucho antes del final:
  una extracción trajo 77 de 236 items de una colección, y 240 de 410 de otra. `extract.js` vuelve a
  leer cada colección hasta que una pasada no sume nada nuevo.
- **Dos manifiestos del mismo día no son problema.** `build.mjs` elige el más nuevo por la fecha de
  extracción que trae adentro, no por el nombre del archivo.
- **Hilos.** Con 3 bajaba unos 25 videos por minuto, y con 6, unos 75. El freno es la latencia de
  TikTok por pedido, no el ancho de banda. Muy por encima de 6 se arriesga un bloqueo de verdad.
- **Tamaño.** H.264 pesa más que HEVC. El promedio fue de unos 11,5 MB por item, así que contá unos
  90 GB cada 8.000 items.
- **Nubes.** Si el archivo vive en Google Drive, OneDrive o Dropbox en streaming, marcá la carpeta
  como disponible sin conexión, o el visor espera que cada archivo baje.
- **Algunos posts llegan como audio solo.** yt-dlp deja un `.mp3`, y `download.mjs` lo convierte en
  un mp4 con la tapa fija.

## Alcance y uso justo

Es una herramienta para tener **un backup personal de lo que guardaste**, para verlo vos. Los videos
son de sus creadores, así que no los republiques. El acceso automatizado puede ir contra los términos
de TikTok: usala bajo tu responsabilidad y a un ritmo razonable. No tiene relación con TikTok ni con
ByteDance.

## Licencia

[MIT](LICENSE)
