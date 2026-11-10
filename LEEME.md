# Agro Market ULEAM — cierre de correcciones

Este paquete parte del ZIP revisado del proyecto y contiene la carpeta `public` completa, `firestore.rules` y pruebas locales. No contiene exportaciones de usuarios o pedidos. Conserva tu `firebase.json` y `.firebaserc` actuales.

## Aplicar en Windows

1. Guarda una copia de tu proyecto actual fuera de su carpeta.
2. Extrae este ZIP. Copia su carpeta `public` y su archivo `firestore.rules` dentro de `C:\Users\usuario\Desktop\Agromarket-uleam`, combinando las carpetas y reemplazando los archivos correspondientes. No pongas una carpeta `public` dentro de otra `public`.
3. Desde PowerShell, despliega las reglas:

```powershell
cd C:\Users\usuario\Desktop\Agromarket-uleam
firebase.cmd deploy --only "firestore:rules" --project agromarket-uleam-ad3a4
```

4. Sigue usando tu servidor de Hosting local en el puerto 5000. Si está detenido:

```powershell
firebase.cmd serve --only hosting --project agromarket-uleam-ad3a4 --port 5000
```

5. Abre `http://localhost:5000` y recarga con Ctrl+F5. Cierra otras pestañas antiguas de la aplicación para que no continúen ejecutando la versión anterior.

No necesitas volver a los emuladores ni importar datos. La configuración incluida es la de tu ZIP: el puerto 5000 utiliza tu proyecto real; el puerto 5002 conserva el modo de emuladores existente.

Este comando publica únicamente reglas. El sitio público alojado en Firebase no recibe los HTML/JS hasta que se despliegue Hosting; la revisión inmediata se hace en localhost.

## Cambios

- **Carrito:** el resumen queda ligado al usuario y al contenido que se revisó. Si otra pestaña lo modifica antes del primer intento de confirmación, se pide revisar de nuevo y no se compra. Si cambia durante una compra ya iniciada, se conserva el nuevo contenido en lugar de borrarlo al finalizar. Los reintentos mantienen el identificador y los datos del intento original.
- **Cambio de sesión:** agregar un producto no escribe en el carrito de otro usuario si la sesión cambia durante la consulta.
- **Límites:** se informa y valida el límite que ya tenían las reglas: cinco productos distintos por pedido y 10 000 unidades por producto. Los carritos antiguos que superan el límite pueden ajustarse quitando productos.
- **Registro:** se valida nombre y apellido antes de crear Authentication. Si Authentication existe pero el perfil no se guardó, se puede completar con la misma cuenta. Cuando ya no hay sesión, se exige la contraseña de esa cuenta. Un perfil existente conserva su rol y estado; el registro no reactiva perfiles inactivos ni elimina cuentas ante errores de red.
- **Usuarios:** administración permite desactivar y reactivar perfiles de clientes y repartidores. Los perfiles administrativos quedan protegidos. Una página protegida abierta observa el perfil y redirige al login al detectar la desactivación.
- **Stock:** el catálogo escucha productos y categorías en tiempo real y conserva la búsqueda y la categoría mientras recibe actualizaciones. El botón Actualizar reconecta las escuchas si fallan.
- **Navegación:** todas las páginas de administración enlazan Dashboard, Productos, Categorías, Pedidos, Usuarios y Zonas. El dashboard incluye los accesos que faltaban.
- **Código:** las consultas de usuarios y pedidos pasan por `db.js`; se retira la función antigua de creación de pedidos y la de registro de perfiles sin recuperación. Las estrategias de efectivo comparten una clase base común.

Desactivar aquí significa bloquear el perfil en la aplicación mediante `activo` y las reglas de Firestore. No deshabilita ni elimina la cuenta en Firebase Authentication. La información ya descargada en un dispositivo no se borra a distancia.

## Validación realizada

Pasaron diez suites locales con servicios simulados: compras, transferencias, estados y permisos, cancelaciones y devolución de stock, usuarios, imágenes, categorías, zonas, estimaciones, cambios de carrito/sesión, recuperación del registro, desactivación y suscripciones. También se comprobó la sintaxis de los cuatro archivos JavaScript y los scripts de las trece páginas, sus enlaces locales y sus identificadores.

Para ejecutarlas, copia también `validacion` a la raíz del proyecto y usa:

```powershell
node .\validacion\ejecutar.js
```

Estas pruebas no escriben datos reales. No sustituyen la compilación de reglas durante el despliegue ni la comprobación con tus cuentas de Firebase. No se pudo ejecutar la prueba visual con Chromium en este entorno por una restricción de arranque del navegador.

## Comprobación breve después de aplicar

1. En Usuarios, desactiva un cliente de prueba: su página abierta debe volver al login y un nuevo ingreso debe indicar cuenta inactiva. Reactívalo y comprueba que puede volver a entrar. No uses un administrador para esta prueba.
2. Mantén abierto el catálogo y cambia el stock de un producto desde administración. El catálogo debe actualizarlo sin recargar y conservar sus filtros.
3. Abre Revisar pedido; cambia su carrito desde otra pestaña antes de confirmar. La confirmación debe pedir recargar y revisar, sin crear el pedido. Recarga, revisa el contenido y confirma normalmente.

Tras comprobar estos cambios, revisa `git diff` y guarda el avance con un commit. La publicación de Hosting y la preparación de la sustentación pueden hacerse después.
