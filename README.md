# Compass Launcher

**Minecraft with your friends, hassle-free.** A Windows launcher to play together and host your own modded servers in one click — your friends join with just your IP and the mods reach them automatically. Comes with an Android app to turn on your PC and control your servers from anywhere.

🌐 **Website:** https://luckicla.github.io/compass-launcher · 🇪🇸 [Léeme en español](README.es.md)

## Download

Latest version on **[Releases](https://github.com/luckicla/compass-launcher/releases/latest)**:

| File | What it is |
|---|---|
| `Compass-Launcher-Instalador-X.Y.Z.exe` | Windows installer. Updates itself. |
| `Compass-Launcher-Portable-X.Y.Z.exe` | Single .exe, no install (tells you when there's a new version). |
| `Compass-Movil.apk` | Android app (Android 7+). Updates itself. |

## Features

- **Play with friends**: paste their IP or code and Compass downloads the version, Fabric and every mod.
- **Your own servers**: Fabric, Paper or both (Arclight), automatic port opening or tunnel, console, map, backups, 24/7 mode, scheduled tasks.
- **Chat commands** for your friends: `/tpa`, `/ctp` (like `/tp` without being OP), `/sethome`, `/home`… with Tab autocomplete thanks to the Compass server mod (Fabric 1.20, 1.21 and 26.1), or with `!` on any server. Homes per player, countdowns and cooldowns are set up in People.
- **Store**: mods, shaders, resource packs, modpacks and maps from Modrinth and CurseForge, with dependencies resolved before installing.
- **Every Minecraft version**, including snapshots (optional) and old versions with Legacy Fabric.
- **Themes** with animated pixel-art backgrounds, light and dark.
- **Android app**: Wake-on-LAN, start/stop servers, live console, players, settings… synced in real time.
- **Languages**: English, Spanish and Catalan (follows your system).

## How releases are published

1. Bump `version` in `package.json`.
2. Push to `main`.
3. GitHub Actions builds the Windows `.exe` files and the Android `.apk`, publishes them on Releases and updates the website. Installed copies update automatically.

## License

© 2026 luckicla. All rights reserved. Compass Launcher is free to use, but copying, modifying or redistributing it is not allowed without permission. See [LICENSE](LICENSE).

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
