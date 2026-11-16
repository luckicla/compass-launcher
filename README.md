# Compass Launcher

Launcher de Minecraft para jugar con tus amigos y montar tus propios servidores con mods.

## Descargar

Última versión en **[Releases](https://github.com/luckicla/compass-launcher/releases/latest)**:

- `Compass-Launcher-Instalador-X.Y.Z.exe`: se instala y se actualiza solo.
- `Compass-Launcher-Portable-X.Y.Z.exe`: un solo .exe, sin instalar (avisa cuando hay versión nueva).

## Cómo se publica una versión

1. Se cambia `version` en `package.json`.
2. Se sube a `main`.
3. GitHub Actions crea los `.exe` y los publica en Releases. Los Compass instalados la descargan solos.
