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


// ── PATRÓN STATE — transiciones válidas ──────────────
// Solo se puede cambiar al estado si está en la lista.
const TRANSICIONES_VALIDAS = {
  pendiente:      ["confirmado", "cancelado"],
  confirmado:     ["en_preparacion", "cancelado"],
  en_preparacion: ["en_camino"],
  en_camino:      ["entregado"],
  entregado:      [],   // estado final
  cancelado:      []    // estado final
};

function puedeTransicionar(estadoActual, nuevoEstado) {
  return (TRANSICIONES_VALIDAS[estadoActual] || []).includes(nuevoEstado);
}

// Etiquetas para mostrar en pantalla
const ETIQUETAS_ESTADO = {
  pendiente:      "Pendiente",
  confirmado:     "Confirmado",
  en_preparacion: "En Preparación",
  en_camino:      "En Camino",
  entregado:      "Entregado",
  cancelado:      "Cancelado"
};


// ── USUARIOS ─────────────────────────────────────────

async function crearUsuarioDB(uid, datos) {
  // MOO: HERENCIA — todos los usuarios tienen la misma
  // estructura base. El campo "rol" los diferencia.
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
    .orderBy("created_at", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function cambiarEstado(pedidoId, pedido, nuevoEstado, nota = "") {
  // MOO: PATRÓN STATE — valida antes de cambiar
  if (!puedeTransicionar(pedido.estado, nuevoEstado)) {
    throw new Error(
      `No se puede cambiar de "${pedido.estado}" a "${nuevoEstado}"`
    );
  }
  const nuevoHistorial = [
    ...(pedido.historial || []),
    { estado_nuevo: nuevoEstado, fecha: new Date().toISOString(), nota }
  ];
  await db.collection("pedidos").doc(pedidoId).update({
    estado: nuevoEstado,
    historial: nuevoHistorial
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