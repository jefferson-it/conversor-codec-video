# Windows — Conversor de Vídeo TV 1080p

## O que já está preparado

- Tauri 2
- Windows x64
- FFmpeg nativo estático embutido como sidecar
- NSIS (`.exe`)
- MSI (`.msi`)
- Receita FFmpeg nativa compatível com a versão validada na TV
- GitHub Actions em `.github/workflows/windows.yml`

O sidecar atual é:

`src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`

Ele é um executável PE x64 do Windows, FFmpeg 9.0.2 Essentials, build estático. O build Essentials contém `libx264`.

## Build no Windows

Abra PowerShell na raiz do projeto:

```powershell
npm ci
npm run lint
npm run build
npm run tauri:build:windows
```

Os instaladores serão gerados em:

- `src-tauri/target/release/bundle/nsis/*.exe`
- `src-tauri/target/release/bundle/msi/*.msi`

## Build automático

O workflow `.github/workflows/windows.yml` usa `windows-latest`, baixa o FFmpeg x64 estático, coloca-o no nome de sidecar esperado pelo Tauri, verifica `libx264` e gera NSIS + MSI.

Ele pode ser executado manualmente pelo GitHub Actions ou disparado por uma tag `v*`.

## Importante

O FFmpeg Windows usado aqui é um build GPLv3. A distribuição do aplicativo deve respeitar as obrigações da licença GPLv3 e os termos do build utilizado.

Fonte do build: https://www.gyan.dev/ffmpeg/builds/