// Pone nombre, descripción, versión e icono de Compass Launcher dentro del .exe
// (si no, Windows lo enseña como «Electron» en el cortafuegos, el administrador de tareas y la barra de tareas).
// Se hace aquí con rcedit para no depender de «signAndEditExecutable», que en algunos PC falla al descargar winCodeSign.
const path = require('path');
module.exports = async ctx => {
  if (ctx.electronPlatformName !== 'win32') return;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const m = require('rcedit'), rcedit = m.rcedit || m.default || m;
  const v = ctx.packager.appInfo.version;
  await rcedit(exe, {
    icon: path.join(__dirname, 'icon.ico'),
    'file-version': v, 'product-version': v,
    'version-string': { CompanyName: 'Compass', FileDescription: 'Compass Launcher', ProductName: 'Compass Launcher', InternalName: 'Compass Launcher',
      OriginalFilename: 'Compass Launcher.exe', LegalCopyright: '© 2026 luckicla. Todos los derechos reservados.' },
  });
  console.log('  • Compass Launcher: nombre e icono puestos en ' + path.basename(exe));
};
