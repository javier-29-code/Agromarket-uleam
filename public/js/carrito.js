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
  // Consultar los datos actuales del producto.
  const producto = await obtenerProducto(productoId);

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

  const nuevaCantidad = (existente?.cantidad ?? 0) + 1;

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

  if (!Number.isSafeInteger(nuevaCantidad) || nuevaCantidad < 1) {
    throw new Error("Ingresa una cantidad entera mayor que cero.");
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

async function prepararResumenPedido() {
  const claveInicial = claveCarritoActual();
  const carrito = obtenerCarrito();

  if (!carrito.length) {
    throw new Error("El carrito está vacío.");
  }

  const productos = await Promise.all(
    carrito.map(item => obtenerProducto(item.productoId))
  );

  if (claveCarritoActual() !== claveInicial) {
    throw new Error("La sesión cambió. Recarga la página.");
  }

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
    subtotal: totalCentavos / 100,
    tarifa_envio: 0,
    total: totalCentavos / 100
  };
}