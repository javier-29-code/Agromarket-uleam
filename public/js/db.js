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