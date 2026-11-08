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
  pendiente: ["confirmado"],
  confirmado: ["en_preparacion"],
  en_preparacion: ["listo_para_retirar"],
  listo_para_retirar: ["entregado"],
  entregado: [],
  cancelado: []
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
  cancelado:      "Cancelado",
  listo_para_retirar: "Listo para retirar"
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
    .get();

  return snap.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) =>
      (b.created_at?.toMillis() ?? 0) -
      (a.created_at?.toMillis() ?? 0)
    );
}

async function cambiarEstado(
  pedidoId,
  pedido,
  nuevoEstado,
  nota = ""
) {
  const usuario = auth.currentUser;

  if (!usuario) {
    throw new Error("Debes iniciar sesión.");
  }

  const notaLimpia = nota.trim();

  if (notaLimpia.length > 300) {
    throw new Error("La nota admite hasta 300 caracteres.");
  }

  const ref = db.collection("pedidos").doc(pedidoId);

  await db.runTransaction(async transaccion => {
    const documento = await transaccion.get(ref);

    if (!documento.exists) {
      throw new Error("El pedido no existe.");
    }

    const actual = documento.data();

    if (auth.currentUser?.uid !== usuario.uid) {
      throw new Error("La sesión cambió. Recarga la página.");
    }

    if (actual.tipo !== "retiro") {
      throw new Error("Esta operación corresponde a pedidos de retiro.");
    }

    if (actual.estado !== pedido.estado) {
      throw new Error("Otro usuario modificó el pedido. Recarga la lista.");
    }

    if (!puedeTransicionar(actual.estado, nuevoEstado)) {
      throw new Error("Ese cambio de estado no está permitido.");
    }

    const cambios = {
      estado: nuevoEstado,
      historial: [
        ...(actual.historial ?? []),
        {
          estado_nuevo: nuevoEstado,
          fecha: new Date().toISOString(),
          usuario_id: usuario.uid,
          nota: notaLimpia
        }
      ],
      updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (nuevoEstado === "entregado") {
      cambios.entregado_en =
        firebase.firestore.FieldValue.serverTimestamp();
    }

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

async function crearPedidoRetiro(
  carrito,
  notas,
  resumenEsperado,
  pedidoId
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

    const fecha = firebase.firestore.FieldValue.serverTimestamp();

    transaccion.set(pedidoRef, {
      cliente_id: usuario.uid,
      cliente_nombre: `${perfil.nombre} ${perfil.apellido}`.trim(),
      tipo: "retiro",
      forma_pago: "efectivo",
      estado: "pendiente",
      producto_ids: items.map(item => item.productoId),
      detalles,
      subtotal: totalCentavos / 100,
      tarifa_envio: 0,
      total: totalCentavos / 100,
      total_centavos: totalCentavos,
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