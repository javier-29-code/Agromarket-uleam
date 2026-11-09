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

// Registra la modalidad de pago; el efectivo se cobra al retirar.
class PagoEfectivoRetiro extends EstrategiaPago {
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

// ── USUARIOS ─────────────────────────────────────────

async function crearUsuarioDB(uid, datos) {
  // Guardar el perfil. En auth.js, el rol permite construir
  // una instancia de Cliente o Administrador.
  await db.collection("usuarios").doc(uid).set({
    nombre:   datos.nombre,
    apellido: datos.apellido,
    correo:   datos.correo,
    rol:      "cliente",   // siempre empieza como cliente
    activo:   true,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}


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

// TODO: Implementar crearProducto(), actualizarProducto()


// ── PEDIDOS ──────────────────────────────────────────

async function crearPedido(datos) {
  return await db.collection("pedidos").add({
    ...datos,
    estado: "pendiente",
    // Historial append-only — se agrega, nunca se borra
    historial: [{
      estado_nuevo: "pendiente",
      fecha: new Date().toISOString(),
      nota: "Pedido creado"
    }],
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

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

async function cambiarEstado(pedidoId, pedido, nuevoEstado, nota = "", repartidorId = null) {
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

// TODO: Implementar listarTodosPedidos() para el admin
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
  const nombre = datos.nombre.trim();
  const descripcion = datos.descripcion.trim();
  const precio = Number(datos.precio);
  const unidades = ["unidad", "kg", "lb", "manojo", "docena"];

  if (!nombre || nombre.length > 100) {
    throw new Error("El nombre debe tener entre 1 y 100 caracteres.");
  }

  if (!Number.isFinite(precio) || precio <= 0) {
    throw new Error("Ingresa un precio válido mayor que cero.");
  }

  if (!unidades.includes(datos.unidad)) {
    throw new Error("Selecciona una unidad válida.");
  }

  if (descripcion.length > 1000) {
    throw new Error("La descripción admite hasta 1000 caracteres.");
  }

  return {
    nombre,
    descripcion,
    precio: Math.round(precio * 100) / 100,
    unidad: datos.unidad
  };
}

async function crearProducto(datos) {
  const producto = validarDatosProducto(datos);
  const stock = Number(datos.stock_actual);

  if (!Number.isFinite(stock) || stock < 0) {
    throw new Error("El stock debe ser un número mayor o igual a cero.");
  }

  return db.collection("productos").add({
    ...producto,
    stock_actual: stock,
    activo: true,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function actualizarProducto(id, datos) {
  const producto = validarDatosProducto(datos);

  await db.collection("productos").doc(id).update({
    ...producto,
    updated_at: firebase.firestore.FieldValue.serverTimestamp()
  });
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
class PagoEfectivoDelivery extends PagoEfectivoRetiro {}

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
    carrito.length > 5
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
      item.cantidad <= 10000
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
    const datosPago = estrategiaPago.preparar(totalCentavos + tarifaCentavos);

    const fecha = firebase.firestore.FieldValue.serverTimestamp();

    transaccion.set(pedidoRef, {
      cliente_id: usuario.uid,
      cliente_nombre: `${perfil.nombre} ${perfil.apellido}`.trim(),
      tipo: entregaValidada.tipo,
      ...datosEntrega,
      forma_pago: datosPago.forma_pago,
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

async function cancelarPedido(pedidoId, motivo) {
  const usuario = auth.currentUser;
  const motivoLimpio = motivo.trim();

  if (!usuario) {
    throw new Error("Debes iniciar sesión.");
  }

  if (!motivoLimpio || motivoLimpio.length > 300) {
    throw new Error("Escribe un motivo de entre 1 y 300 caracteres.");
  }

  const pedidoRef = db.collection("pedidos").doc(pedidoId);

  return db.runTransaction(async transaccion => {
    const documento = await transaccion.get(pedidoRef);

    if (!documento.exists) {
      throw new Error("El pedido no existe.");
    }

    const pedido = documento.data();
    const perfilDoc = await transaccion.get(db.collection("usuarios").doc(usuario.uid));
    if (!perfilDoc.exists || perfilDoc.data().activo !== true || perfilDoc.data().rol !== "administrador") {
      throw new Error("Solo un administrador activo puede cancelar el pedido.");
    }

    // No devolver existencias nuevamente.
    if (pedido.estado === "cancelado") {
      return false;
    }

    const modeloPedido = crearModeloPedido(pedido);
    modeloPedido.cancelar();

    const detalles = pedido.detalles;

    if (
      !Array.isArray(detalles) ||
      detalles.length < 1 ||
      detalles.length > 5 ||
      !detalles.every(detalle =>
        typeof detalle.producto_id === "string" &&
        detalle.producto_id.length > 0 &&
        !detalle.producto_id.includes("/") &&
        Number.isSafeInteger(detalle.cantidad) &&
        detalle.cantidad > 0 &&
        detalle.cantidad <= 10000
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
        updated_at: fecha
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
