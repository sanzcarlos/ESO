# Geo
Aplicaciones de Geografía.

## Quiz del mapa de Europa

- **`europe_map_quiz_v5.html`** — versión actual. Mapa vectorial (nítido a cualquier zoom), accesible con teclado y lector de pantalla, tema claro/oscuro y adaptado a móvil. Los recursos están en `assets/`.
- `europe_map_quiz_v4.html` — versión anterior (mapa en imagen), conservada como referencia.

Funciona sin servidor ni instalación: basta con abrir el HTML (por ejemplo con doble clic) y mantener junto a él la carpeta `assets/`.

### Mapa
El mapa base es vectorial: costas, lagos, ríos y fronteras se dibujan como trazos que no se pixelan al ampliar, sobre una textura de relieve y fondo marino suave (`assets/europe-land.webp`, `assets/europe-sea.webp`). Usa la misma proyección (cónica conforme de Lambert) y las mismas coordenadas que el mapa anterior, por lo que los lugares y su corrección son idénticos.

Datos geográficos: [Natural Earth](https://www.naturalearthdata.com/) (dominio público).
