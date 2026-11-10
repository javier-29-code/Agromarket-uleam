// ═══════════════════════════════════════════════════════
// db.js  —  Operaciones con Firestore
//
// ── MOO: ENCAPSULAMIENTO ─────────────────────────────
// Toda la lógica de la base de datos está aquí.
// Las páginas HTML solo llaman las funciones de abajo —
// no saben cómo funciona Firestore internamente.
//
// ── MOO: PATRÓN STATE ────────────────────────────────
// Los estados del pedido controlan qué puede pasar.
// Un pedido "entregado" no puede volver a "pendiente".
// ═══════════════════════════════════════════════════════

// Estos límites deben coincidir con los validados en firestore.rules.
const LIMITES_COMPRA = Object.freeze({ productos: 5, cantidadPorProducto: 10000 });

// Estado base: define el comportamiento común.
class EstadoPedido {
  constructor(codigo, siguiente = null) {
    this.codigo = codigo;
    this.siguiente = siguiente;
  }

  avanzar(destino) {
    if (!this.siguiente || destino !== this.siguiente) {
      throw new Error(
        `No se puede cambiar de "${this.codigo}" a "${destino}".`
      );
    }

    return this.crearEstado(destino);
  }

  crearEstado(codigo) {
    throw new Error("Cada tipo de pedido debe definir su fábrica de estados.");
  }

  cancelar() {
    throw new Error(
      `No se puede cancelar un pedido en estado "${this.codigo}".`
    );
  }
}

class EstadoRetiro extends EstadoPedido {
  crearEstado(codigo) { return crearEstadoRetiro(codigo); }
}

class RetiroPendiente extends EstadoRetiro {
  constructor() {
    super("pendiente", "confirmado");
  }

  cancelar() {
    return new RetiroCancelado();
  }
}

class RetiroConfirmado extends EstadoRetiro {
  constructor() {
    super("confirmado", "en_preparacion");
  }

  cancelar() {
    return new RetiroCancelado();
  }
}

class RetiroEnPreparacion extends EstadoRetiro {
  constructor() {
    super("en_preparacion", "listo_para_retirar");
  }
}

class RetiroListo extends EstadoRetiro {
  constructor() {
    super("listo_para_retirar", "entregado");
  }
}

class RetiroEntregado extends EstadoRetiro {
  constructor() {
    super("entregado");
  }
}

class RetiroCancelado extends EstadoRetiro {
  constructor() {
    super("cancelado");
  }
}

const CLASES_ESTADO_RETIRO = Object.freeze({
  pendiente: RetiroPendiente,
  confirmado: RetiroConfirmado,
  en_preparacion: RetiroEnPreparacion,
  listo_para_retirar: RetiroListo,
  entregado: RetiroEntregado,
  cancelado: RetiroCancelado
});

function crearEstadoRetiro(codigo) {
  if (
    !Object.prototype.hasOwnProperty.call(CLASES_ESTADO_RETIRO, codigo)
  ) {
    throw new Error(`Estado desconocido: ${codigo}.`);
  }

  const ClaseEstado = CLASES_ESTADO_RETIRO[codigo];
  return new ClaseEstado();
}

// Contexto del patrón State.
class PedidoRetiro {
  #estado;

  constructor(estadoInicial = "pendiente") {
    this.#estado = crearEstadoRetiro(estadoInicial);
  }

  get estado() {
    return this.#estado.codigo;
  }

  avanzar(destino) {
    this.#estado = this.#estado.avanzar(destino);
    return this.estado;
  }

  cancelar() {
    this.#estado = this.#estado.cancelar();
    return this.estado;
  }
}

// ── PATRÓN STATE — transiciones válidas ──────────────
// Solo se puede cambiar al estado si está en la lista.
// Las opciones de la interfaz se obtienen de los objetos de estado.
const TRANSICIONES_VALIDAS = Object.freeze(
  Object.fromEntries(
    Object.keys(CLASES_ESTADO_RETIRO).map(codigo => {
      const estado = crearEstadoRetiro(codigo);

      return [
        codigo,
        Object.freeze(estado.siguiente ? [estado.siguiente] : [])
      ];
    })
  )
);

// Los dos tipos de pedido comparten el contrato State.
class EstadoDelivery extends EstadoPedido {
  crearEstado(codigo) { return crearEstadoDelivery(codigo); }
}
class DeliveryPendiente extends EstadoDelivery {
  constructor() { super("pendiente", "confirmado"); }
  cancelar() { return new DeliveryCancelado(); }
}
class DeliveryConfirmado extends EstadoDelivery {
  constructor() { super("confirmado", "en_preparacion"); }
  cancelar() { return new DeliveryCancelado(); }
}
class DeliveryEnPreparacion extends EstadoDelivery {
  constructor() { super("en_preparacion", "en_camino"); }
}
class DeliveryEnCamino extends EstadoDelivery {
  constructor() { super("en_camino", "entregado"); }
}
class DeliveryEntregado extends EstadoDelivery {
  constructor() { super("entregado"); }
}
class DeliveryCancelado extends EstadoDelivery {
  constructor() { super("cancelado"); }
}
const CLASES_ESTADO_DELIVERY = Object.freeze({
  pendiente: DeliveryPendiente, confirmado: DeliveryConfirmado,
  en_preparacion: DeliveryEnPreparacion, en_camino: DeliveryEnCamino,
  entregado: DeliveryEntregado, cancelado: DeliveryCancelado
});
function crearEstadoDelivery(codigo) {
  if (!Object.prototype.hasOwnProperty.call(CLASES_ESTADO_DELIVERY, codigo)) {
    throw new Error(`Estado delivery desconocido: ${codigo}.`);
  }
  return new CLASES_ESTADO_DELIVERY[codigo]();
}
class PedidoDelivery {
  #estado;
  constructor(estado = "pendiente") { this.#estado = crearEstadoDelivery(estado); }
  get estado() { return this.#estado.codigo; }
  avanzar(destino) { this.#estado = this.#estado.avanzar(destino); return this.estado; }
  cancelar() { this.#estado = this.#estado.cancelar(); return this.estado; }
}
function crearModeloPedido(datos) {
  if (datos.tipo === "retiro") return new PedidoRetiro(datos.estado);
  if (datos.tipo === "delivery") return new PedidoDelivery(datos.estado);
  throw new Error("El tipo de pedido no es válido.");
}
function obtenerTransicionesPedido(datos) {
  const estado = datos.tipo === "retiro" ? crearEstadoRetiro(datos.estado)
    : datos.tipo === "delivery" ? crearEstadoDelivery(datos.estado) : null;
  return estado?.siguiente ? [estado.siguiente] : [];
}
function puedeTransicionar(estadoActual, nuevoEstado, tipo = "retiro") {
  try {
    crearModeloPedido({ tipo, estado: estadoActual }).avanzar(nuevoEstado);
    return true;
  } catch { return false; }
}

// Etiquetas para mostrar en pantalla
const ETIQUETAS_ESTADO = {
  pendiente:      "Pendiente",
  confirmado:     "Confirmado",
  en_preparacion: "En Preparación",
  en_camino:      "En Camino",
  entregado:      "Entregado",
  cancelado:      "Cancelado",
  listo_para_retirar: "Listo para retirar"
};

// ── PATRÓN STRATEGY — formas de pago ──────────────────

// Contrato común para las estrategias de pago.
class EstrategiaPago {
  preparar(totalCentavos) {
    throw new Error("La estrategia debe implementar preparar().");
  }
}

// Modalidad de pago en efectivo, al retirar o recibir el pedido.
class PagoEfectivo extends EstrategiaPago {
  preparar(totalCentavos) {
    if (
      !Number.isSafeInteger(totalCentavos) ||
      totalCentavos <= 0
    ) {
      throw new Error("El total del pedido no es válido.");
    }

    return {
      forma_pago: "efectivo"
    };
  }
}

class PagoEfectivoRetiro extends PagoEfectivo {}

// Configuración pública de subida. Nunca se incluye API Secret en el navegador.
const CLOUDINARY_COMPROBANTES = Object.freeze({
  cloudName: "mpoyykfh",
  uploadPreset: "agromarket_comprobantes"
});

function esURLImagenCloudinaryValida(valor) {
  return typeof valor === "string" && valor.length <= 1500
    && /^https:\/\/res\.cloudinary\.com\/mpoyykfh\/image\/upload\/v[0-9]+\/[A-Za-z0-9_/-]+\.(jpg|jpeg|png)$/.test(valor);
}

// Alias conservado para los comprobantes y páginas de pedidos existentes.
function esURLComprobanteValida(valor) { return esURLImagenCloudinaryValida(valor); }

function validarImagenCloudinary(imagen) {
  if (!esURLImagenCloudinaryValida(imagen?.url) || typeof imagen.publicId !== "string"
    || imagen.publicId.length > 500 || !/^[A-Za-z0-9_/-]+$/.test(imagen.publicId)) {
    throw new Error("La imagen de Cloudinary no es válida.");
  }
  const identificador = new URL(imagen.url).pathname
    .replace(/^\/mpoyykfh\/image\/upload\/v[0-9]+\//, "").replace(/\.(jpg|jpeg|png)$/, "");
  if (identificador !== imagen.publicId) throw new Error("El identificador de la imagen no coincide.");
  return { url: imagen.url, publicId: imagen.publicId };
}

function normalizarDatosPago(datos) {
  if (datos?.forma_pago === "efectivo") return { forma_pago: "efectivo" };
  if (datos?.forma_pago !== "transferencia") throw new Error("El comprobante de transferencia no es válido.");
  let imagen;
  try { imagen = validarImagenCloudinary({ url: datos.comprobante_url, publicId: datos.comprobante_public_id }); }
  catch (error) { throw new Error(`El comprobante no es válido: ${error.message}`); }
  return { forma_pago: "transferencia", comprobante_url: imagen.url,
    comprobante_public_id: imagen.publicId, estado_pago: "pendiente_revision" };
}

class PagoTransferencia extends EstrategiaPago {
  constructor(comprobante) { super(); this.comprobante = comprobante; }
  preparar(totalCentavos) {
    if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0) throw new Error("El total del pedido no es válido.");
    return normalizarDatosPago({ ...this.comprobante, forma_pago: "transferencia" });
  }
}

async function validarArchivoComprobante(archivo) {
  return validarArchivoImagen(archivo, "comprobante");
}

async function validarArchivoImagen(archivo, etiqueta = "imagen") {
  if (!archivo || !["image/jpeg", "image/png"].includes(archivo.type)
    || archivo.size <= 0 || archivo.size > 5 * 1024 * 1024) {
    throw new Error(`Selecciona un archivo de ${etiqueta} JPG o PNG de hasta 5 MB.`);
  }
  const cabecera = new Uint8Array(await archivo.slice(0, 8).arrayBuffer());
  const png = [137,80,78,71,13,10,26,10].every((byte, i) => cabecera[i] === byte);
  const jpg = cabecera[0] === 255 && cabecera[1] === 216 && cabecera[2] === 255;
  if ((archivo.type === "image/png" && !png) || (archivo.type === "image/jpeg" && !jpg)) {
    throw new Error("El archivo no corresponde a una imagen JPG o PNG válida.");
  }
}

async function subirComprobanteTransferencia(archivo) {
  const imagen = await subirImagenCloudinary(archivo, CLOUDINARY_COMPROBANTES.uploadPreset, "comprobante");
  return { comprobante_url: imagen.url, comprobante_public_id: imagen.publicId };
}

async function subirImagenProducto(archivo) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Debes iniciar sesión.");
  const perfil = await obtenerUsuario(usuario.uid);
  if (perfil?.rol !== "administrador" || perfil.activo !== true) throw new Error("Se requiere acceso administrativo.");
  if (auth.currentUser?.uid !== usuario.uid) throw new Error("La sesión cambió. Recarga la página.");
  const imagen = await subirImagenCloudinary(archivo, "agromarket_productos");
  return { imagen_url: imagen.url, imagen_public_id: imagen.publicId };
}

async function subirImagenCloudinary(archivo, preset, etiqueta = "imagen") {
  if (!auth.currentUser) throw new Error("Debes iniciar sesión.");
  await validarArchivoImagen(archivo, etiqueta);
  const formulario = new FormData();
  formulario.append("file", archivo, archivo.type === "image/png" ? "comprobante.png" : "comprobante.jpg");
  formulario.append("upload_preset", preset);
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 60000);
  try {
    const respuesta = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_COMPROBANTES.cloudName}/image/upload`, {
      method: "POST", body: formulario, signal: controlador.signal
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(`Cloudinary: ${datos.error?.message || "No se pudo subir el comprobante."}`);
    if (datos.resource_type !== "image" || datos.type !== "upload" || !["jpg", "jpeg", "png"].includes(datos.format)) {
      throw new Error("Cloudinary devolvió un tipo de archivo inesperado.");
    }
    return validarImagenCloudinary({ url: datos.secure_url, publicId: datos.public_id });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("La subida tardó demasiado. Comprueba tu conexión y reintenta.");
    throw error;
  } finally { clearTimeout(temporizador); }
}

// ── USUARIOS ─────────────────────────────────────────

// ── PRODUCTOS ────────────────────────────────────────

async function listarProductos() {
  const snap = await db.collection("productos")
    .where("activo", "==", true).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function obtenerProducto(id) {
  const doc = await db.collection("productos").doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}



// ── PEDIDOS ──────────────────────────────────────────

async function listarPedidosCliente(clienteId) {
  const snap = await db.collection("pedidos")
    .where("cliente_id", "==", clienteId)
    .get();

  return snap.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) =>
      (b.created_at?.toMillis() ?? 0) -
      (a.created_at?.toMillis() ?? 0)
    );
}

async function cambiarEstado(pedidoId, pedido, nuevoEstado, nota = "", repartidorId = null, pagoRevisado = false) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Debes iniciar sesión.");
  const notaLimpia = nota.trim();
  if (notaLimpia.length > 300) throw new Error("La nota admite hasta 300 caracteres.");
  const ref = db.collection("pedidos").doc(pedidoId);
  await db.runTransaction(async transaccion => {
    const documento = await transaccion.get(ref);
    const perfilDoc = await transaccion.get(db.collection("usuarios").doc(usuario.uid));
    if (!documento.exists) throw new Error("El pedido no existe.");
    if (!perfilDoc.exists || perfilDoc.data().activo !== true) throw new Error("Tu perfil no está activo.");
    const actual = documento.data();
    const actor = perfilDoc.data();
    if (actual.estado !== pedido.estado) throw new Error("El pedido cambió. Recarga la lista.");
    crearModeloPedido(actual).avanzar(nuevoEstado);
    const esEntregaDelivery = actual.tipo === "delivery" && nuevoEstado === "entregado";
    if (esEntregaDelivery) {
      if (actor.rol !== "repartidor" || actual.repartidor_id !== usuario.uid) {
        throw new Error("Solo el repartidor asignado puede confirmar la entrega.");
      }
    } else if (actor.rol !== "administrador") {
      throw new Error("Solo el administrador puede realizar este cambio.");
    }
    const cambios = {
      estado: nuevoEstado,
      historial: [...(actual.historial ?? []), {
        estado_nuevo: nuevoEstado, fecha: new Date().toISOString(),
        usuario_id: usuario.uid, nota: notaLimpia
      }],
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (actual.forma_pago === "transferencia") {
      if (actual.estado === "pendiente" && nuevoEstado === "confirmado") {
        if (pagoRevisado !== true || actual.estado_pago !== "pendiente_revision" || !esURLComprobanteValida(actual.comprobante_url)) {
          throw new Error("Revisa el comprobante y verifica el ingreso antes de confirmar.");
        }
        cambios.estado_pago = "verificado";
        cambios.pago_verificado_por = usuario.uid;
        cambios.pago_verificado_en = firebase.firestore.FieldValue.serverTimestamp();
      } else if (actual.estado_pago !== "verificado") {
        throw new Error("El pago por transferencia todavía no está verificado.");
      }
    }
    if (actual.tipo === "delivery" && nuevoEstado === "en_camino") {
      if (typeof repartidorId !== "string" || !repartidorId || repartidorId.includes("/")) {
        throw new Error("Selecciona un repartidor.");
      }
      const repartidorDoc = await transaccion.get(db.collection("usuarios").doc(repartidorId));
      if (!repartidorDoc.exists || repartidorDoc.data().rol !== "repartidor" || repartidorDoc.data().activo !== true) {
        throw new Error("El repartidor no existe o está inactivo.");
      }
      const repartidor = repartidorDoc.data();
      cambios.repartidor_id = repartidorId;
      cambios.repartidor_nombre = `${repartidor.nombre} ${repartidor.apellido}`.trim();
    }
    if (auth.currentUser?.uid !== usuario.uid) throw new Error("La sesión cambió. Recarga la página.");
    if (nuevoEstado === "entregado") cambios.entregado_en = firebase.firestore.FieldValue.serverTimestamp();
    transaccion.update(ref, cambios);
  });
}

async function obtenerResumenProductos() {
  const productos = await listarProductos();

  return {
    activos: productos.length,
    sinStock: productos.filter(
      producto => (producto.stock_actual ?? 0) <= 0
    ).length
  };
}

async function cambiarEstadoActivoProducto(id, activo) {
  if (typeof activo !== "boolean") {
    throw new Error("El estado del producto debe ser booleano.");
  }

  await db.collection("productos").doc(id).update({
    activo,
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function validarDatosProducto(datos) {
  const nombre = String(datos.nombre ?? "").trim();
  const descripcion = String(datos.descripcion ?? "").trim();
  const precio = Number(datos.precio);
  const centavos = Math.round(precio * 100);
  if (!nombre || nombre.length > 100) throw new Error("El nombre debe tener entre 1 y 100 caracteres.");
  if (!Number.isFinite(precio) || precio <= 0 || !Number.isSafeInteger(centavos) || centavos < 1 || centavos > 100000000) {
    throw new Error("Ingresa un precio de al menos $0.01 y como máximo $1,000,000.");
  }
  if (!["unidad", "kg", "lb", "manojo", "docena"].includes(datos.unidad)) throw new Error("Selecciona una unidad válida.");
  if (descripcion.length > 1000) throw new Error("La descripción admite hasta 1000 caracteres.");
  const categoriaId = datos.categoria_id || null;
  if (categoriaId !== null && (typeof categoriaId !== "string" || categoriaId.length > 100 || categoriaId.includes("/"))) throw new Error("Selecciona una categoría válida.");
  const imagenUrl = datos.imagen_url || null;
  const imagenId = datos.imagen_public_id || null;
  if (imagenUrl !== null || imagenId !== null) {
    validarImagenCloudinary({ url: imagenUrl, publicId: imagenId });
  }
  return { nombre, descripcion, precio: centavos / 100, unidad: datos.unidad,
    categoria_id: categoriaId, imagen_url: imagenUrl, imagen_public_id: imagenId };
}

function generarIdProducto() { return db.collection("productos").doc().id; }

async function validarCategoriaAsignada(transaccion, categoriaId, categoriaAnterior = null) {
  if (!categoriaId) return;
  const documento = await transaccion.get(db.collection("categorias").doc(categoriaId));
  if (!documento.exists || (documento.data().activo !== true && categoriaId !== categoriaAnterior)) {
    throw new Error("La categoría no existe o está inactiva. Actualiza la lista.");
  }
}

async function crearProducto(datos, productoId = generarIdProducto()) {
  const producto = validarDatosProducto(datos);
  const stock = Number(datos.stock_actual);
  if (!Number.isFinite(stock) || stock < 0) throw new Error("El stock debe ser un número mayor o igual a cero.");
  const ref = db.collection("productos").doc(productoId);
  await db.runTransaction(async transaccion => {
    const existente = await transaccion.get(ref);
    if (existente.exists) {
      // El mismo formulario conserva su identificador ante una respuesta perdida.
      const anterior = existente.data();
      if (Object.entries(producto).every(([clave, valor]) => anterior[clave] === valor)) return;
      throw new Error("El producto con este identificador ya existe. Revisa la tabla antes de reintentar.");
    }
    await validarCategoriaAsignada(transaccion, producto.categoria_id);
    transaccion.set(ref, { ...producto, stock_actual: stock, activo: true,
      created_at: firebase.firestore.FieldValue.serverTimestamp() });
  });
  return ref;
}

async function actualizarProducto(id, datos) {
  const ref = db.collection("productos").doc(id);
  await db.runTransaction(async transaccion => {
    const actual = await transaccion.get(ref);
    if (!actual.exists) throw new Error("El producto ya no existe.");
    const producto = validarDatosProducto({ ...actual.data(), ...datos });
    await validarCategoriaAsignada(transaccion, producto.categoria_id, actual.data().categoria_id ?? null);
    transaccion.update(ref, { ...producto, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
  });
}

async function listarProductosAdmin() {
  const resultado = await db.collection("productos").get();
  return resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function listarCategorias() {
  const resultado = await db.collection("categorias").get();
  return resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
}

function claveCategoria(nombre) {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function guardarCategoria(id, nombre, activo = true) {
  const limpio = nombre.trim();
  if (!limpio || limpio.length > 100 || !claveCategoria(limpio)) throw new Error("Escribe un nombre de categoría válido (1 a 100 caracteres).");
  if (typeof activo !== "boolean") throw new Error("El estado debe ser booleano.");
  const creando = !id;
  const ref = db.collection("categorias").doc(id || claveCategoria(limpio));
  await db.runTransaction(async transaccion => {
    const actual = await transaccion.get(ref);
    const fecha = firebase.firestore.FieldValue.serverTimestamp();
    if (creando && actual.exists) throw new Error("Esa categoría ya existe. Edítala o reactívala en la lista.");
    if (!creando && !actual.exists) throw new Error("La categoría ya no existe.");
    if (creando) transaccion.set(ref, { nombre: limpio, activo, created_at: fecha, updated_at: fecha });
    else transaccion.update(ref, { nombre: limpio, activo, updated_at: fecha });
  });
  return ref.id;
}

async function registrarMovimientoStock(
  productoId,
  tipo,
  cantidad,
  motivo
) {
  const usuario = auth.currentUser;
  const cantidadNumero = Number(cantidad);
  const motivoLimpio = motivo.trim();

  if (!usuario) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!["entrada", "salida"].includes(tipo)) {
    throw new Error("Selecciona entrada o salida.");
  }

  if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
    throw new Error("La cantidad debe ser mayor que cero.");
  }

  // Trabajar con milésimas evita errores al sumar decimales.
  const cantidadMilesimas = Math.round(cantidadNumero * 1000);

  if (
    !Number.isSafeInteger(cantidadMilesimas) ||
    cantidadMilesimas <= 0 ||
    Math.abs(cantidadNumero * 1000 - cantidadMilesimas) > 0.000001
  ) {
    throw new Error("La cantidad admite hasta tres decimales.");
  }

  if (!motivoLimpio || motivoLimpio.length > 300) {
    throw new Error("Escribe un motivo de entre 1 y 300 caracteres.");
  }

  const productoRef = db.collection("productos").doc(productoId);
  const movimientoRef = db.collection("movimientos_stock").doc();

  return db.runTransaction(async transaccion => {
    const documento = await transaccion.get(productoRef);

    if (!documento.exists) {
      throw new Error("El producto no existe.");
    }

    const producto = documento.data();
    const stockActual = producto.stock_actual;

    if (
      typeof stockActual !== "number" ||
      !Number.isFinite(stockActual) ||
      stockActual < 0
    ) {
      throw new Error("El producto tiene un stock inválido.");
    }

    const stockMilesimas = Math.round(stockActual * 1000);
    const nuevoSaldoMilesimas = tipo === "entrada"
      ? stockMilesimas + cantidadMilesimas
      : stockMilesimas - cantidadMilesimas;

    if (
      !Number.isSafeInteger(stockMilesimas) ||
      !Number.isSafeInteger(nuevoSaldoMilesimas)
    ) {
      throw new Error("La cantidad supera el límite permitido.");
    }

    if (nuevoSaldoMilesimas < 0) {
      throw new Error(`Stock insuficiente. Disponible: ${stockActual}.`);
    }

    const nuevoStock = nuevoSaldoMilesimas / 1000;
    const fecha = firebase.firestore.FieldValue.serverTimestamp();

    transaccion.update(productoRef, {
      stock_actual: nuevoStock,
      updated_at: fecha
    });

    transaccion.set(movimientoRef, {
      producto_id: productoId,
      tipo,
      cantidad: cantidadMilesimas / 1000,
      motivo: motivoLimpio,
      stock_anterior: stockActual,
      stock_nuevo: nuevoStock,
      usuario_id: usuario.uid,
      created_at: fecha
    });

    return nuevoStock;
  });
}

async function listarMovimientosProducto(productoId) {
  const snap = await db.collection("movimientos_stock")
    .where("producto_id", "==", productoId)
    .get();

  return snap.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) =>
      (b.created_at?.toMillis() ?? 0) -
      (a.created_at?.toMillis() ?? 0)
    );
}

// Compatibilidad con las páginas que ya crean pedidos de retiro.
async function crearPedidoRetiro(carrito, notas, resumen, id, pago = new PagoEfectivoRetiro()) {
  return crearPedidoCompra(carrito, notas, resumen, id, pago, { tipo: "retiro" });
}

// Efectivo: cobro al recibir, usando el mismo contrato Strategy.
class PagoEfectivoDelivery extends PagoEfectivo {}

function validarEntregaCompra(entrega) {
  if (!entrega || !["retiro", "delivery"].includes(entrega.tipo)) {
    throw new Error("Selecciona un tipo de entrega válido.");
  }
  if (entrega.tipo === "retiro") return { tipo: "retiro" };
  const limpio = { tipo: "delivery" };
  for (const [campo, limite] of Object.entries({ zona_id: 100, bloque: 80, piso: 40, aula: 80 })) {
    if (typeof entrega[campo] !== "string" || !entrega[campo].trim() || entrega[campo].trim().length > limite) {
      throw new Error(`Completa correctamente el campo ${campo}.`);
    }
    limpio[campo] = entrega[campo].trim();
  }
  if (limpio.zona_id.includes("/") || !Number.isSafeInteger(entrega.tarifa_centavos) || entrega.tarifa_centavos < 0 || entrega.tarifa_centavos > 10000) {
    throw new Error("Selecciona una zona con una tarifa válida.");
  }
  return { ...limpio, tarifa_centavos: entrega.tarifa_centavos };
}

async function crearPedidoCompra(
  carrito,
  notas,
  resumenEsperado,
  pedidoId,
  estrategiaPago = new PagoEfectivoRetiro(),
  entrega = { tipo: "retiro" }
) {
  const usuario = auth.currentUser;

  if (!usuario) {
    throw new Error("Debes iniciar sesión.");
  }

  if (
    !Array.isArray(carrito) ||
    carrito.length < 1 ||
    carrito.length > LIMITES_COMPRA.productos
  ) {
    throw new Error("El pedido admite entre 1 y 5 productos distintos.");
  }

  const items = carrito.map(item => ({
    productoId: item.productoId,
    cantidad: item.cantidad
  }));

  if (
    !items.every(item =>
      typeof item.productoId === "string" &&
      item.productoId.length > 0 &&
      !item.productoId.includes("/") &&
      Number.isSafeInteger(item.cantidad) &&
      item.cantidad >= 1 &&
      item.cantidad <= LIMITES_COMPRA.cantidadPorProducto
    ) ||
    new Set(items.map(item => item.productoId)).size !== items.length
  ) {
    throw new Error("El carrito contiene cantidades o productos inválidos.");
  }

  const notasLimpias = notas.trim();

  if (notasLimpias.length > 300) {
    throw new Error("Las observaciones admiten hasta 300 caracteres.");
  }

  const entregaValidada = validarEntregaCompra(entrega);

  const preciosEsperados = new Map(
    resumenEsperado.detalles.map(detalle => [
      detalle.producto_id,
      Math.round(detalle.precio_unitario * 100)
    ])
  );

  const pedidoRef = db.collection("pedidos").doc(pedidoId);
  const perfilRef = db.collection("usuarios").doc(usuario.uid);
  const productoRefs = items.map(item =>
    db.collection("productos").doc(item.productoId)
  );

  return db.runTransaction(async transaccion => {
    // Todas las lecturas se realizan antes de escribir.
    const pedidoExistente = await transaccion.get(pedidoRef);

    if (pedidoExistente.exists) {
      if (pedidoExistente.data().cliente_id !== usuario.uid) {
        throw new Error("No puedes utilizar este identificador de pedido.");
      }

      return pedidoRef.id;
    }

    const perfilDoc = await transaccion.get(perfilRef);

    const documentos = await Promise.all(
      productoRefs.map(ref => transaccion.get(ref))
    );

    let datosEntrega = {};
    let tarifaCentavos = 0;
    if (entregaValidada.tipo === "delivery") {
      const zonaDoc = await transaccion.get(
        db.collection("zonas_delivery").doc(entregaValidada.zona_id)
      );
      if (!zonaDoc.exists || zonaDoc.data().activo !== true) {
        throw new Error("La zona ya no está disponible. Recarga el pedido.");
      }
      const zona = zonaDoc.data();
      if (typeof zona.tarifa !== "number" || !Number.isFinite(zona.tarifa) || zona.tarifa < 0 || zona.tarifa > 100 || typeof zona.nombre !== "string" || !zona.nombre.trim() || zona.nombre.length > 100) {
        throw new Error("La zona tiene datos inválidos. Contacta al administrador.");
      }
      tarifaCentavos = Math.round(zona.tarifa * 100);
      if (tarifaCentavos !== entregaValidada.tarifa_centavos) {
        throw new Error("La tarifa de envío cambió. Recarga y revisa el total.");
      }
      datosEntrega = {
        zona_id: zonaDoc.id,
        zona_nombre: zona.nombre,
        bloque: entregaValidada.bloque,
        piso: entregaValidada.piso,
        aula: entregaValidada.aula,
        direccion_entrega: `${entregaValidada.bloque} — Piso ${entregaValidada.piso} — Aula ${entregaValidada.aula}`
      };
    }

    if (auth.currentUser?.uid !== usuario.uid) {
      throw new Error("La sesión cambió. Recarga la página.");
    }

    if (!perfilDoc.exists || perfilDoc.data().activo !== true) {
      throw new Error("Tu perfil no está activo.");
    }

    const perfil = perfilDoc.data();
    let totalCentavos = 0;

    const detalles = items.map((item, indice) => {
      const documento = documentos[indice];

      if (!documento.exists || documento.data().activo !== true) {
        throw new Error("Un producto ya no está disponible.");
      }

      const producto = documento.data();

      if (
        typeof producto.stock_actual !== "number" ||
        !Number.isFinite(producto.stock_actual) ||
        producto.stock_actual < item.cantidad
      ) {
        throw new Error(`Stock insuficiente para ${producto.nombre}.`);
      }

      if (
        typeof producto.precio !== "number" ||
        !Number.isFinite(producto.precio)
      ) {
        throw new Error(`Precio inválido para ${producto.nombre}.`);
      }

      const precioCentavos = Math.round(producto.precio * 100);

      if (precioCentavos <= 0 || precioCentavos > 100000000) {
        throw new Error(`Precio inválido para ${producto.nombre}.`);
      }

      if (precioCentavos !== preciosEsperados.get(item.productoId)) {
        throw new Error(
          `El precio de ${producto.nombre} cambió. Recarga y revisa el pedido.`
        );
      }

      const subtotalCentavos = precioCentavos * item.cantidad;
      totalCentavos += subtotalCentavos;

      return {
        producto_id: item.productoId,
        nombre_producto: producto.nombre,
        cantidad: item.cantidad,
        unidad: producto.unidad,
        precio_centavos: precioCentavos,
        subtotal_centavos: subtotalCentavos,
        precio_unitario: precioCentavos / 100,
        subtotal: subtotalCentavos / 100
      };
    });

    // Delegar en la estrategia usando el total recalculado
    // con los precios consultados dentro de la transacción.
    const datosPago = normalizarDatosPago(estrategiaPago.preparar(totalCentavos + tarifaCentavos));

    const fecha = firebase.firestore.FieldValue.serverTimestamp();

    transaccion.set(pedidoRef, {
      cliente_id: usuario.uid,
      cliente_nombre: `${perfil.nombre} ${perfil.apellido}`.trim(),
      tipo: entregaValidada.tipo,
      ...datosEntrega,
      ...datosPago,
      estado: "pendiente",
      producto_ids: items.map(item => item.productoId),
      detalles,
      subtotal: totalCentavos / 100,
      tarifa_envio: tarifaCentavos / 100,
      total: (totalCentavos + tarifaCentavos) / 100,
      total_centavos: totalCentavos + tarifaCentavos,
      notas: notasLimpias,
      historial: [],
      created_at: fecha
    });

    items.forEach((item, indice) => {
      const stockAnterior = documentos[indice].data().stock_actual;
      const stockNuevo = stockAnterior - item.cantidad;

      transaccion.update(productoRefs[indice], {
        stock_actual: stockNuevo,
        updated_at: fecha,
        pedido_stock_id: pedidoRef.id,
        indice_stock: indice
      });

      const movimientoRef = db.collection("movimientos_stock")
        .doc(`${pedidoRef.id}_${item.productoId}`);

      transaccion.set(movimientoRef, {
        pedido_id: pedidoRef.id,
        producto_id: item.productoId,
        usuario_id: usuario.uid,
        tipo: "salida",
        cantidad: item.cantidad,
        motivo: "Compra",
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        created_at: fecha
      });
    });

    return pedidoRef.id;
  });
}

async function obtenerResumenPedidos() {
  const snap = await db.collection("pedidos").get();

  const formatoFecha = new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const hoy = formatoFecha.format(new Date());

  let pendientes = 0;
  let entregadosHoy = 0;

  snap.docs.forEach(documento => {
    const pedido = documento.data();

    if (pedido.estado === "pendiente") {
      pendientes++;
    }

    if (
      pedido.estado === "entregado" &&
      typeof pedido.entregado_en?.toDate === "function"
    ) {
      const fechaEntrega = formatoFecha.format(
        pedido.entregado_en.toDate()
      );

      if (fechaEntrega === hoy) {
        entregadosHoy++;
      }
    }
  });

  return { pendientes, entregadosHoy };
}

// Alias para las páginas de retiro ya existentes.
async function cancelarPedidoRetiro(pedidoId, motivo) {
  return cancelarPedido(pedidoId, motivo);
}

function puedeSolicitarCancelacionCliente(pedido, usuarioId = auth.currentUser?.uid) {
  return !!usuarioId && pedido?.cliente_id === usuarioId
    && pedido.estado === "pendiente" && ["retiro", "delivery"].includes(pedido.tipo);
}

async function cancelarPedidoCliente(pedidoId, motivo) {
  return cancelarPedido(pedidoId, motivo, true);
}

async function cancelarPedido(pedidoId, motivo, soloPropioPendiente = false) {
  const usuario = auth.currentUser;
  const motivoLimpio = typeof motivo === "string" ? motivo.trim() : "";

  if (!usuario) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!motivoLimpio || motivoLimpio.length > 287) {
    throw new Error("Escribe un motivo de entre 1 y 287 caracteres.");
  }

  const pedidoRef = db.collection("pedidos").doc(pedidoId);

  return db.runTransaction(async transaccion => {
    const documento = await transaccion.get(pedidoRef);

    if (!documento.exists) {
      throw new Error("El pedido no existe.");
    }

    const pedido = documento.data();
    const perfilDoc = await transaccion.get(db.collection("usuarios").doc(usuario.uid));
    if (!perfilDoc.exists || perfilDoc.data().activo !== true) {
      throw new Error("Tu perfil no está activo.");
    }
    const administrador = perfilDoc.data().rol === "administrador";
    const clientePropietario = perfilDoc.data().rol === "cliente" && pedido.cliente_id === usuario.uid;
    if (!administrador && !clientePropietario) {
      throw new Error("Solo puedes cancelar tus propios pedidos pendientes.");
    }
    if (soloPropioPendiente && pedido.cliente_id !== usuario.uid) {
      throw new Error("Solo puedes cancelar tus propios pedidos pendientes.");
    }
    if (auth.currentUser?.uid !== usuario.uid) throw new Error("La sesión cambió. Recarga la página.");

    // La transacción relee el estado en cada reintento: no devuelve stock dos veces.
    if (pedido.estado === "cancelado") return false;
    if ((!administrador || soloPropioPendiente) && pedido.estado !== "pendiente") {
      throw new Error("El pedido ya no está pendiente. Solo administración puede revisar su cancelación.");
    }

    const modeloPedido = crearModeloPedido(pedido);
    modeloPedido.cancelar();

    const detalles = pedido.detalles;

    if (
      !Array.isArray(detalles) ||
      detalles.length < 1 ||
      detalles.length > LIMITES_COMPRA.productos ||
      !detalles.every(detalle =>
        typeof detalle.producto_id === "string" &&
        detalle.producto_id.length > 0 &&
        !detalle.producto_id.includes("/") &&
        Number.isSafeInteger(detalle.cantidad) &&
        detalle.cantidad > 0 &&
        detalle.cantidad <= LIMITES_COMPRA.cantidadPorProducto
      ) ||
      new Set(detalles.map(detalle => detalle.producto_id)).size
        !== detalles.length
    ) {
      throw new Error("Los detalles del pedido no son válidos.");
    }

    const referencias = detalles.map(detalle =>
      db.collection("productos").doc(detalle.producto_id)
    );

    const documentos = await Promise.all(
      referencias.map(ref => transaccion.get(ref))
    );

    if (auth.currentUser?.uid !== usuario.uid) {
      throw new Error("La sesión cambió. Recarga la página.");
    }

    // Validar todos los productos antes de escribir.
    const saldos = documentos.map((productoDoc, indice) => {
      if (!productoDoc.exists) {
        throw new Error("No se puede devolver stock: falta un producto.");
      }

      const anterior = productoDoc.data().stock_actual;
      const nuevo = anterior + detalles[indice].cantidad;

      if (
        typeof anterior !== "number" ||
        !Number.isFinite(anterior) ||
        anterior < 0 ||
        !Number.isFinite(nuevo) ||
        nuevo <= anterior
      ) {
        throw new Error("Un producto tiene existencias inválidas.");
      }

      return { anterior, nuevo };
    });

    const fecha = firebase.firestore.FieldValue.serverTimestamp();

    transaccion.update(pedidoRef, {
      estado: "cancelado",
      cancelado_en: fecha,
      updated_at: fecha,
      historial: [
        ...(pedido.historial ?? []),
        {
          estado_nuevo: "cancelado",
          fecha: new Date().toISOString(),
          usuario_id: usuario.uid,
          nota: motivoLimpio
        }
      ]
    });

    detalles.forEach((detalle, indice) => {
      transaccion.update(referencias[indice], {
        stock_actual: saldos[indice].nuevo,
        updated_at: fecha,
        cancelacion_stock_id: pedidoId
      });

      const movimientoRef = db.collection("movimientos_stock")
        .doc(`cancelacion_${pedidoId}_${detalle.producto_id}`);

      transaccion.set(movimientoRef, {
        pedido_id: pedidoId,
        producto_id: detalle.producto_id,
        usuario_id: usuario.uid,
        tipo: "entrada",
        cantidad: detalle.cantidad,
        motivo: `Cancelación: ${motivoLimpio}`,
        stock_anterior: saldos[indice].anterior,
        stock_nuevo: saldos[indice].nuevo,
        created_at: fecha
      });
    });

    return true;
  });
}

async function listarZonasDelivery() {
  const resultado = await db.collection("zonas_delivery")
    .where("activo", "==", true).get();
  return resultado.docs.map(documento => ({ ...documento.data(), id: documento.id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}


async function listarUsuariosAdmin() {
  const resultado = await db.collection("usuarios").get();
  return resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
async function listarRepartidoresActivos() {
  const resultado = await db.collection("usuarios")
    .where("rol", "==", "repartidor").where("activo", "==", true).get();
  return resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}
async function listarEntregasAsignadas() {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Debes iniciar sesión.");
  const resultado = await db.collection("pedidos")
    .where("tipo", "==", "delivery")
    .where("repartidor_id", "==", usuario.uid).get();
  return resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => (b.created_at?.toMillis() ?? 0) - (a.created_at?.toMillis() ?? 0));
}
async function crearUsuarioDesdeAdmin(datos) {
  const administrador = auth.currentUser;
  if (!administrador) throw new Error("Debes iniciar sesión.");
  const perfil = await obtenerUsuario(administrador.uid);
  if (perfil?.rol !== "administrador" || perfil.activo !== true) throw new Error("Se requiere acceso administrativo.");
  const nombre = datos.nombre.trim();
  const apellido = datos.apellido.trim();
  const correo = datos.correo.trim().toLowerCase();
  if (!nombre || nombre.length > 100 || !apellido || apellido.length > 100) throw new Error("Revisa el nombre y el apellido (máximo 100 caracteres cada uno).");
  if (!/^[^@\s]+@uleam\.edu\.ec$/.test(correo)) throw new Error("Usa un correo @uleam.edu.ec válido.");
  if (!["cliente", "repartidor", "administrador"].includes(datos.rol)) throw new Error("Selecciona un rol válido.");
  if (typeof datos.password !== "string" || datos.password.length < 6) throw new Error("La contraseña requiere al menos 6 caracteres y debe cumplir la política de Firebase.");
  const secundaria = firebase.initializeApp(firebase.app().options, `alta-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const authSecundaria = secundaria.auth();
  let cuenta = null;
  let perfilGuardado = false;
  try {
    if (typeof USAR_EMULADORES !== "undefined" && USAR_EMULADORES) authSecundaria.useEmulator("http://127.0.0.1:9099");
    await authSecundaria.setPersistence(firebase.auth.Auth.Persistence.NONE);
    cuenta = (await authSecundaria.createUserWithEmailAndPassword(correo, datos.password)).user;
    if (auth.currentUser?.uid !== administrador.uid) throw new Error("La sesión administrativa cambió.");
    const ref = db.collection("usuarios").doc(cuenta.uid);
    const perfilNuevo = { nombre, apellido, correo, rol: datos.rol, activo: true,
      created_at: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await ref.set(perfilNuevo);
      perfilGuardado = true;
    } catch (error) {
      // Una respuesta perdida no demuestra que la escritura haya fallado.
      // Comprobar en servidor antes de decidir si hay que eliminar la cuenta nueva.
      try {
        const comprobacion = await ref.get({ source: "server" });
        if (comprobacion.exists && comprobacion.data().correo === correo && comprobacion.data().rol === datos.rol) {
          perfilGuardado = true;
        } else if (!comprobacion.exists) {
          await cuenta.delete();
          cuenta = null;
        }
      } catch (comprobacionError) {
        console.error("No se pudo comprobar el alta:", comprobacionError);
      }
      if (!perfilGuardado) throw new Error(`No se pudo completar el perfil. Revisa Authentication y usuarios/${cuenta?.uid ?? "cuenta-eliminada"} antes de reintentar. ${error.message}`);
    }
    return cuenta.uid;
  } finally {
    try { await authSecundaria.signOut(); } catch (error) { console.error(error); }
    try { await secundaria.delete(); } catch (error) { console.error(error); }
  }
}


async function cambiarCategoriaActiva(id, activo) {
  if (typeof activo !== "boolean") throw new Error("El estado debe ser booleano.");
  await db.collection("categorias").doc(id).update({ activo,
    updated_at: firebase.firestore.FieldValue.serverTimestamp() });
}

function filtrarProductosCatalogo(productos, busqueda = "", categoriaId = "") {
  const normalizar = texto => String(texto ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const termino = normalizar(busqueda);
  return productos.filter(producto =>
    normalizar(`${producto.nombre} ${producto.descripcion ?? ""}`).includes(termino)
    && (!categoriaId || (categoriaId === "__sin_categoria__"
      ? !producto.categoria_id : producto.categoria_id === categoriaId))
  );
}

// Gestión administrativa de zonas. Se conserva el esquema nombre/tarifa/activo.
function validarDatosZonaDelivery(datos) {
  if (typeof datos.nombre !== "string" || !datos.nombre.trim() || datos.nombre.trim().length > 100) {
    throw new Error("Escribe un nombre de zona de entre 1 y 100 caracteres.");
  }
  if ((typeof datos.tarifa !== "string" && typeof datos.tarifa !== "number")
    || (typeof datos.tarifa === "string" && !datos.tarifa.trim())) {
    throw new Error("Ingresa la tarifa de entrega.");
  }
  const tarifa = Number(datos.tarifa);
  const centavos = Math.round(tarifa * 100);
  if (!Number.isFinite(tarifa) || tarifa < 0 || tarifa > 100
    || !Number.isSafeInteger(centavos) || Math.abs(tarifa * 100 - centavos) > 0.000001) {
    throw new Error("La tarifa debe estar entre $0.00 y $100.00, con hasta dos decimales.");
  }
  if (typeof datos.activo !== "boolean") throw new Error("El estado de la zona debe ser booleano.");
  return { nombre: datos.nombre.trim(), tarifa: centavos / 100, activo: datos.activo };
}

function generarIdZonaDelivery() { return db.collection("zonas_delivery").doc().id; }

async function listarZonasDeliveryAdmin() {
  const resultado = await db.collection("zonas_delivery").get();
  return resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
}

async function crearZonaDelivery(datos, id = generarIdZonaDelivery()) {
  const zona = validarDatosZonaDelivery(datos);
  const ref = db.collection("zonas_delivery").doc(id);
  await db.runTransaction(async transaccion => {
    const existente = await transaccion.get(ref);
    if (existente.exists) {
      const anterior = existente.data();
      if (Object.entries(zona).every(([campo, valor]) => anterior[campo] === valor)) return;
      throw new Error("Esta zona ya fue creada. Actualiza la lista y utiliza Editar.");
    }
    transaccion.set(ref, zona);
  });
  return ref.id;
}

async function actualizarZonaDelivery(id, datos) {
  const zona = validarDatosZonaDelivery(datos);
  const ref = db.collection("zonas_delivery").doc(id);
  await db.runTransaction(async transaccion => {
    const actual = await transaccion.get(ref);
    if (!actual.exists) throw new Error("La zona ya no existe. Actualiza la lista.");
    transaccion.update(ref, zona);
  });
}

async function cambiarZonaDeliveryActiva(id, activo) {
  if (typeof activo !== "boolean") throw new Error("El estado debe ser booleano.");
  await db.collection("zonas_delivery").doc(id).update({ activo });
}

const MINUTOS_ESTIMACION_ENTREGA = Object.freeze([5, 10, 15, 20, 30]);

function generarIdEstimacionEntrega() { return db.collection("pedidos").doc().id; }

async function publicarTiempoEstimado(pedidoId, minutos, eventoId = generarIdEstimacionEntrega()) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Debes iniciar sesión.");
  if (!Number.isInteger(minutos) || !MINUTOS_ESTIMACION_ENTREGA.includes(minutos)) {
    throw new Error("Selecciona 5, 10, 15, 20 o 30 minutos.");
  }
  if (typeof eventoId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(eventoId)) {
    throw new Error("El identificador del aviso no es válido.");
  }
  const ref = db.collection("pedidos").doc(pedidoId);
  return db.runTransaction(async transaccion => {
    const documento = await transaccion.get(ref);
    const perfilDoc = await transaccion.get(db.collection("usuarios").doc(usuario.uid));
    if (!documento.exists) throw new Error("El pedido no existe.");
    const pedido = documento.data();
    if (!perfilDoc.exists || perfilDoc.data().activo !== true || perfilDoc.data().rol !== "repartidor") {
      throw new Error("Se requiere un repartidor activo.");
    }
    if (pedido.tipo !== "delivery" || pedido.repartidor_id !== usuario.uid) {
      throw new Error("Solo el repartidor asignado puede publicar el tiempo estimado.");
    }
    if (auth.currentUser?.uid !== usuario.uid) throw new Error("La sesión cambió. Recarga la página.");
    // Conservar el identificador del aviso al reintentar evita duplicar el historial.
    if ((pedido.historial ?? []).some(evento => evento.tipo === "tiempo_estimado" && evento.evento_id === eventoId)) return false;
    if (pedido.estado !== "en_camino") throw new Error("Solo puedes estimar la entrega de un pedido En camino.");
    if (pedido.forma_pago === "transferencia" && pedido.estado_pago !== "verificado") throw new Error("La transferencia aún no está verificada.");
    const fecha = firebase.firestore.FieldValue.serverTimestamp();
    transaccion.update(ref, {
      tiempo_estimado_minutos: minutos,
      estimacion_actualizada_en: fecha,
      estimacion_actualizada_por: usuario.uid,
      estimacion_evento_id: eventoId,
      updated_at: fecha,
      historial: [...(pedido.historial ?? []), {
        tipo: "tiempo_estimado", evento_id: eventoId,
        estado_nuevo: "en_camino", fecha: new Date().toISOString(),
        usuario_id: usuario.uid, nota: "Tiempo estimado actualizado.", minutos
      }]
    });
    return true;
  });
}

function obtenerEstimacionEntrega(pedido, ahora = Date.now()) {
  if (pedido.tipo !== "delivery" || pedido.estado !== "en_camino"
    || !MINUTOS_ESTIMACION_ENTREGA.includes(pedido.tiempo_estimado_minutos)) return null;
  const milis = pedido.estimacion_actualizada_en?.toMillis?.()
    ?? pedido.estimacion_actualizada_en?.toDate?.()?.getTime?.();
  if (typeof milis !== "number" || !Number.isFinite(milis)) return null;
  const llegada = milis + pedido.tiempo_estimado_minutos * 60000;
  return { minutos: pedido.tiempo_estimado_minutos, actualizadaEn: new Date(milis),
    llegadaAproximada: new Date(llegada), vencida: ahora > llegada };
}

function escucharPedidosCliente(clienteId, alRecibir, alError) {
  if (!auth.currentUser || auth.currentUser.uid !== clienteId) throw new Error("La sesión cambió. Recarga la página.");
  return db.collection("pedidos").where("cliente_id", "==", clienteId)
    .onSnapshot(resultado => {
      if (auth.currentUser?.uid !== clienteId) return;
      const pedidos = resultado.docs.map(doc => ({ ...doc.data(), id: doc.id }))
        .sort((a,b) => (b.created_at?.toMillis() ?? 0) - (a.created_at?.toMillis() ?? 0));
      alRecibir(pedidos);
    }, alError);
}


// Identificadores y consultas usados por las páginas, sin acceso directo desde HTML.
function generarIdPedido() { return db.collection("pedidos").doc().id; }

async function obtenerUsuario(uid) {
  const documento = await db.collection("usuarios").doc(uid).get();
  return documento.exists ? { ...documento.data(), id: documento.id } : null;
}

function escucharPerfilUsuario(uid, alRecibir, alError) {
  return db.collection("usuarios").doc(uid).onSnapshot(documento => {
    alRecibir(documento.exists ? { ...documento.data(), id: documento.id } : null);
  }, alError);
}

async function listarTodosPedidos() {
  const resultado = await db.collection("pedidos").get();
  return resultado.docs.map(documento => ({ ...documento.data(), id: documento.id }))
    .sort((a,b) => (b.created_at?.toMillis() ?? 0) - (a.created_at?.toMillis() ?? 0));
}

function validarRegistroCliente(datos) {
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
  const apellido = typeof datos.apellido === "string" ? datos.apellido.trim() : "";
  const correo = typeof datos.correo === "string" ? datos.correo.trim().toLowerCase() : "";
  if (!nombre || nombre.length > 100 || !apellido || apellido.length > 100) {
    throw new Error("El nombre y el apellido deben tener entre 1 y 100 caracteres cada uno.");
  }
  if (!/^[^@\s]+@uleam\.edu\.ec$/.test(correo)) throw new Error("Usa un correo @uleam.edu.ec válido.");
  if (typeof datos.password !== "string" || datos.password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres y cumplir la política del proyecto.");
  }
  return { nombre, apellido, correo, password: datos.password };
}

async function completarPerfilCliente(usuario, datos) {
  const ref = db.collection("usuarios").doc(usuario.uid);
  return db.runTransaction(async transaccion => {
    const existente = await transaccion.get(ref);
    if (auth.currentUser?.uid !== usuario.uid || usuario.email?.toLowerCase() !== datos.correo) {
      throw new Error("La sesión cambió. Vuelve a iniciar sesión.");
    }
    if (existente.exists) {
      const perfil = existente.data();
      if (perfil.correo !== datos.correo || !["cliente", "administrador", "repartidor"].includes(perfil.rol)) {
        throw new Error("Tu perfil necesita revisión del administrador.");
      }
      if (perfil.activo !== true) throw new Error("Tu cuenta está inactiva. Contacta al administrador.");
      return { ...perfil, id: ref.id };
    }
    const perfil = { nombre: datos.nombre, apellido: datos.apellido, correo: datos.correo,
      rol: "cliente", activo: true, created_at: firebase.firestore.FieldValue.serverTimestamp() };
    transaccion.set(ref, perfil);
    return { ...perfil, id: ref.id };
  });
}

async function registrarClienteSeguro(datosFormulario) {
  const datos = validarRegistroCliente(datosFormulario);
  let usuario = auth.currentUser;
  if (!usuario || usuario.email?.toLowerCase() !== datos.correo) {
    try {
      usuario = (await auth.createUserWithEmailAndPassword(datos.correo, datos.password)).user;
    } catch (error) {
      if (error.code !== "auth/email-already-in-use") throw error;
      // Si el alta anterior creó Auth pero falló el perfil, comprobar la identidad
      // permite completarlo sin crear ni eliminar otra cuenta.
      try { usuario = (await auth.signInWithEmailAndPassword(datos.correo, datos.password)).user; }
      catch {
        throw new Error("Ese correo ya está registrado. Usa su contraseña correcta o entra desde Iniciar sesión.");
      }
    }
  }
  try { return await completarPerfilCliente(usuario, datos); }
  catch (error) {
    if (["permission-denied", "unavailable", "deadline-exceeded", "aborted", "unknown"].includes(error.code)) {
      const recuperable = new Error("La cuenta existe, pero no se pudo completar el perfil. Conserva esta página y pulsa de nuevo Registrar / completar perfil cuando se restablezca la conexión. No necesitas otra cuenta.");
      recuperable.cause = error;
      throw recuperable;
    }
    throw error;
  }
}

async function cambiarEstadoActivoUsuario(uid, activo) {
  const actor = auth.currentUser;
  if (!actor) throw new Error("Debes iniciar sesión.");
  if (typeof activo !== "boolean") throw new Error("El estado debe ser booleano.");
  if (uid === actor.uid) throw new Error("No puedes desactivar tu propia cuenta.");
  const actorRef = db.collection("usuarios").doc(actor.uid);
  const usuarioRef = db.collection("usuarios").doc(uid);
  return db.runTransaction(async transaccion => {
    const administradorDoc = await transaccion.get(actorRef);
    const usuarioDoc = await transaccion.get(usuarioRef);
    if (!administradorDoc.exists || administradorDoc.data().rol !== "administrador" || administradorDoc.data().activo !== true) {
      throw new Error("Se requiere un administrador activo.");
    }
    if (!usuarioDoc.exists) throw new Error("El perfil ya no existe.");
    if (!["cliente", "repartidor"].includes(usuarioDoc.data().rol)) {
      throw new Error("Las cuentas de administración están protegidas en este panel.");
    }
    if (auth.currentUser?.uid !== actor.uid) throw new Error("La sesión cambió. Recarga la página.");
    if (usuarioDoc.data().activo === activo) return false;
    transaccion.update(usuarioRef, { activo });
    return true;
  });
}

function escucharCatalogo(alRecibir, alError) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Debes iniciar sesión.");
  let productos = null, categorias = null, cancelada = false;
  let cancelarProductos = () => {}, cancelarCategorias = () => {};
  function detener() { cancelada = true; cancelarProductos(); cancelarCategorias(); }
  function emitir() {
    if (cancelada || auth.currentUser?.uid !== usuario.uid || productos === null || categorias === null) return;
    alRecibir(productos, categorias);
  }
  function fallar(error) {
    if (cancelada) return;
    detener();
    if (auth.currentUser?.uid === usuario.uid) alError(error);
  }
  cancelarProductos = db.collection("productos").where("activo", "==", true).onSnapshot(resultado => {
    productos = resultado.docs.map(documento => ({ ...documento.data(), id: documento.id }))
      .sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
    emitir();
  }, fallar);
  if (!cancelada) cancelarCategorias = db.collection("categorias").onSnapshot(resultado => {
    categorias = resultado.docs.map(documento => ({ ...documento.data(), id: documento.id }))
      .sort((a,b) => a.nombre.localeCompare(b.nombre, "es"));
    emitir();
  }, fallar);
  if (cancelada) detener();
  return detener;
}
