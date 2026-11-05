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
