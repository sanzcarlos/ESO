# ESO
Single Page Application (SPA) de contenido de la ESO

Web estática: no necesita Node.js ni proceso de build. Puede abrirse con doble clic en `index.html`
o copiarse (junto con sus carpetas) a cualquier ubicación.

## Despliegue automático en Cloudflare Pages

Cada `git push` a `main` publica la web automáticamente.

1. En el panel de Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Autoriza GitHub y elige el repositorio `sanzcarlos/ESO`.
3. Configuración del proyecto:
   - **Production branch**: `main`
   - **Framework preset**: `None`
   - **Build command**: *(vacío)*
   - **Build output directory**: `/`
4. Pulsa **Save and Deploy**. La web quedará en `https://<proyecto>.pages.dev`.

Las ramas distintas de `main` generan automáticamente una URL de previsualización.
El archivo `_headers` define las cabeceras de seguridad y de caché que aplica Cloudflare.
