function claveCarritoActual() {
  const usuario = auth.currentUser;

  if (!usuario) {
    throw new Error("Debes iniciar sesión para usar el carrito.");
  }

  return `agromarket:carrito:${usuario.uid}`;
}

function obtenerCarrito() {
  const contenido = localStorage.getItem(claveCarritoActual());

  if (!contenido) return [];

  let carrito;

  try {
    carrito = JSON.parse(contenido);
  } catch {
    throw new Error("No se pudo leer el carrito guardado.");
  }

  if (
    !Array.isArray(carrito) ||
    !carrito.every(item =>
      item &&
      typeof item.productoId === "string" &&
      item.productoId.length > 0 &&
      Number.isSafeInteger(item.cantidad) &&
      item.cantidad > 0
    ) ||
    new Set(carrito.map(item => item.productoId)).size !== carrito.length
  ) {
    throw new Error("El carrito guardado tiene un formato inválido.");
  }

  return carrito;
}

function guardarCarrito(carrito) {
  localStorage.setItem(
    claveCarritoActual(),
    JSON.stringify(carrito)
  );
}

async function agregarProductoAlCarrito(productoId) {
  const claveInicial = claveCarritoActual();
  // Consultar los datos actuales del producto.
  const producto = await obtenerProducto(productoId);
  if (claveCarritoActual() !== claveInicial) throw new Error("La sesión cambió. Recarga la página.");

  if (!producto || producto.activo !== true) {
    throw new Error("Este producto ya no está disponible.");
  }

  const stock = producto.stock_actual;

  if (typeof stock !== "number" || !Number.isFinite(stock) || stock < 0) {
    throw new Error("El producto tiene un stock inválido.");
  }

  // Leer el carrito después de la consulta para conservar cambios recientes.
  const carrito = obtenerCarrito();
  const existente = carrito.find(
    item => item.productoId === productoId
  );

  if (!existente && carrito.length >= LIMITES_COMPRA.productos) {
    throw new Error(`Cada pedido admite hasta ${LIMITES_COMPRA.productos} productos distintos. Finaliza o ajusta tu carrito.`);
  }
  const nuevaCantidad = (existente?.cantidad ?? 0) + 1;
  if (nuevaCantidad > LIMITES_COMPRA.cantidadPorProducto) throw new Error(`La cantidad máxima por producto es ${LIMITES_COMPRA.cantidadPorProducto}.`);

  if (nuevaCantidad > stock) {
    throw new Error(`Stock insuficiente. Disponible: ${stock}.`);
  }

  if (existente) {
    existente.cantidad = nuevaCantidad;
  } else {
    carrito.push({ productoId, cantidad: 1 });
  }

  guardarCarrito(carrito);
  return producto.nombre;
}

async function cambiarCantidadCarrito(productoId, cantidad) {
  const nuevaCantidad = Number(cantidad);

  if (!Number.isSafeInteger(nuevaCantidad) || nuevaCantidad < 1 || nuevaCantidad > LIMITES_COMPRA.cantidadPorProducto) {
    throw new Error(`Ingresa una cantidad entera entre 1 y ${LIMITES_COMPRA.cantidadPorProducto}.`);
  }

  const claveInicial = claveCarritoActual();
  const producto = await obtenerProducto(productoId);

  if (claveCarritoActual() !== claveInicial) {
    throw new Error("La sesión cambió. Recarga la página.");
  }

  if (!producto || producto.activo !== true) {
    throw new Error("El producto ya no está disponible.");
  }

  if (
    typeof producto.stock_actual !== "number" ||
    !Number.isFinite(producto.stock_actual) ||
    nuevaCantidad > producto.stock_actual
  ) {
    throw new Error("La cantidad supera el stock disponible.");
  }

  const carrito = obtenerCarrito();
  const item = carrito.find(item => item.productoId === productoId);

  if (!item) {
    throw new Error("El producto ya no está en el carrito.");
  }

  item.cantidad = nuevaCantidad;
  guardarCarrito(carrito);
}

function quitarProductoCarrito(productoId) {
  const carrito = obtenerCarrito().filter(
    item => item.productoId !== productoId
  );

  guardarCarrito(carrito);
}

function firmaCarrito(carrito) {
  return JSON.stringify(carrito.map(item => ({ productoId: item.productoId, cantidad: item.cantidad }))
    .sort((a,b) => a.productoId.localeCompare(b.productoId)));
}

function verificarContextoCarrito(contexto) {
  if (!contexto || claveCarritoActual() !== contexto.clave) throw new Error("La sesión cambió. Recarga la página.");
  if (firmaCarrito(obtenerCarrito()) !== contexto.firma) throw new Error("El carrito cambió en otra pestaña. Recarga y revisa el pedido antes de confirmar.");
}

function limpiarCarritoComprado(clave, firmaComprada) {
  const contenido = localStorage.getItem(clave);
  if (contenido === null) return true;
  let carrito;
  try { carrito = JSON.parse(contenido); }
  catch { return false; }
  if (!Array.isArray(carrito) || !carrito.every(item => item && typeof item.productoId === "string" && Number.isSafeInteger(item.cantidad))) return false;
  if (firmaCarrito(carrito) !== firmaComprada) return false;
  localStorage.removeItem(clave);
  return true;
}

async function prepararResumenPedido() {
  const claveInicial = claveCarritoActual();
  const carrito = obtenerCarrito();

  if (!carrito.length) {
    throw new Error("El carrito está vacío.");
  }

  if (carrito.length > LIMITES_COMPRA.productos) throw new Error(`El pedido admite hasta ${LIMITES_COMPRA.productos} productos distintos. Quita los productos adicionales del carrito.`);
  if (carrito.some(item => item.cantidad > LIMITES_COMPRA.cantidadPorProducto)) throw new Error(`La cantidad máxima por producto es ${LIMITES_COMPRA.cantidadPorProducto}.`);
  const firmaInicial = firmaCarrito(carrito);
  const productos = await Promise.all(
    carrito.map(item => obtenerProducto(item.productoId))
  );

  if (claveCarritoActual() !== claveInicial) {
    throw new Error("La sesión cambió. Recarga la página.");
  }

  if (firmaCarrito(obtenerCarrito()) !== firmaInicial) throw new Error("El carrito cambió mientras se consultaban los productos. Recarga para revisarlo.");
  let totalCentavos = 0;

  const detalles = carrito.map((item, indice) => {
    const producto = productos[indice];

    if (!producto || producto.activo !== true) {
      throw new Error(
        "Hay un producto que ya no está disponible. Revisa el carrito."
      );
    }

    if (
      typeof producto.stock_actual !== "number" ||
      !Number.isFinite(producto.stock_actual) ||
      item.cantidad > producto.stock_actual
    ) {
      throw new Error(`Stock insuficiente para ${producto.nombre}.`);
    }

    if (
      typeof producto.precio !== "number" ||
      !Number.isFinite(producto.precio) ||
      producto.precio <= 0
    ) {
      throw new Error(`El precio de ${producto.nombre} no es válido.`);
    }

    const precioCentavos = Math.round(producto.precio * 100);
    const subtotalCentavos = precioCentavos * item.cantidad;

    if (
      precioCentavos <= 0 ||
      !Number.isSafeInteger(subtotalCentavos) ||
      !Number.isSafeInteger(totalCentavos + subtotalCentavos)
    ) {
      throw new Error("El importe del pedido no es válido.");
    }

    totalCentavos += subtotalCentavos;

    return {
      producto_id: item.productoId,
      nombre_producto: producto.nombre,
      cantidad: item.cantidad,
      unidad: producto.unidad,
      precio_unitario: precioCentavos / 100,
      subtotal: subtotalCentavos / 100
    };
  });

  return {
    detalles,
    contexto_carrito: { clave: claveInicial, firma: firmaInicial },
    subtotal: totalCentavos / 100,
    tarifa_envio: 0,
    total: totalCentavos / 100
  };
}