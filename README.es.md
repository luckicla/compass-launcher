# Compass Launcher

**Minecraft con tus amigos, sin complicaciones.** Un launcher para Windows con el que jugar juntos y montar tus propios servidores con mods en un clic: tus amigos entran solo con tu IP y los mods les llegan solos. Incluye una app de Android para encender tu PC y controlar tus servidores desde donde estés.

🌐 **Web:** https://luckicla.github.io/compass-launcher · 🇬🇧 [English](README.md)

## Descargar

Última versión en **[Releases](https://github.com/luckicla/compass-launcher/releases/latest)**:

| Archivo | Qué es |
|---|---|
| `Compass-Launcher-Instalador-X.Y.Z.exe` | Instalador para Windows. Se actualiza solo. |
| `Compass-Launcher-Portable-X.Y.Z.exe` | Un solo .exe, sin instalar (avisa cuando hay versión nueva). |
| `Compass-Movil.apk` | App para Android (7 o más nuevo). Se actualiza sola. |

## Cómo se publica una versión

1. Se cambia `version` en `package.json`.
2. Se sube a `main`.
3. GitHub Actions crea los `.exe` y la `.apk`, los publica en Releases y actualiza la web. Las copias instaladas se actualizan solas.

## Licencia

© 2026 luckicla. Todos los derechos reservados. Compass Launcher es gratis de usar, pero no se permite copiarlo, modificarlo ni redistribuirlo sin permiso. Mira [LICENSE](LICENSE).

No es un producto oficial de Minecraft ni está aprobado ni asociado con Mojang o Microsoft.
