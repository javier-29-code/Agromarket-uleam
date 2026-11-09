// Modelo de usuarios: herencia y acceso según el rol.
class Usuario {
  constructor(datos) {
    this.id = datos.id;
    this.nombre = datos.nombre;
    this.activo = datos.activo === true;
  }
  get rol() { throw new Error("La clase debe definir el rol del usuario."); }
  puedeAcceder(rolesPermitidos = []) {
    return this.activo && (rolesPermitidos.length === 0 || rolesPermitidos.includes(this.rol));
  }
  obtenerPaginaInicio() { throw new Error("La clase debe definir su página de inicio."); }
}
class Cliente extends Usuario {
  get rol() { return "cliente"; }
  obtenerPaginaInicio() { return "/catalogo.html"; }
}
class Administrador extends Usuario {
  get rol() { return "administrador"; }
  obtenerPaginaInicio() { return "/admin/dashboard.html"; }
}
class Repartidor extends Usuario {
  get rol() { return "repartidor"; }
  obtenerPaginaInicio() { return "/repartidor/entregas.html"; }
}
function crearModeloUsuario(datos) {
  if (!datos) return null;
  switch (datos.rol) {
    case "cliente": return new Cliente(datos);
    case "administrador": return new Administrador(datos);
    case "repartidor": return new Repartidor(datos);
    default: return null;
  }
}
async function obtenerUsuario(uid) {
  const doc = await db.collection("usuarios").doc(uid).get();
  return doc.exists ? { ...doc.data(), id: doc.id } : null;
}
function protegerPagina(rolesPermitidos = []) {
  return auth.onAuthStateChanged(async user => {
    if (!user) { window.location.href = "/login.html"; return; }
    try {
      const datos = await obtenerUsuario(user.uid);
      if (auth.currentUser?.uid !== user.uid) return;
      const usuario = crearModeloUsuario(datos);
      if (!usuario || !usuario.activo) { window.location.href = "/login.html"; return; }
      if (!usuario.puedeAcceder(rolesPermitidos)) {
        window.location.href = usuario.obtenerPaginaInicio(); return;
      }
      if (typeof iniciarPagina === "function") await iniciarPagina();
    } catch (error) {
      console.error("Error al iniciar la página protegida:", error);
      mostrarToast("No se pudo cargar la página. Revisa tu conexión y recarga.", "danger");
    }
  });
}
function cerrarSesion() {
  auth.signOut().then(() => { window.location.href = "/login.html"; });
}
document.addEventListener("keydown", async e => {
  if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== "a") return;
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;
  try {
    const datos = await obtenerUsuario(user.uid);
    if (auth.currentUser?.uid !== user.uid) return;
    const usuario = crearModeloUsuario(datos);
    if (usuario?.puedeAcceder(["administrador"])) window.location.href = usuario.obtenerPaginaInicio();
  } catch (error) {
    console.error("Error al consultar el acceso administrativo:", error);
    mostrarToast("No se pudo consultar tu acceso.", "danger");
  }
});
async function cargarNavbar() {
  const user = auth.currentUser;
  if (!user) return;
  const datos = await obtenerUsuario(user.uid);
  const el = document.getElementById("usuario-nombre");
  if (el && datos) el.textContent = datos.nombre;
}
function mostrarToast(mensaje, tipo = "success") {
  const colores = { success: "bg-success", danger: "bg-danger", warning: "bg-warning text-dark" };
  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-white ${colores[tipo] || "bg-success"} border-0 show`;
  toast.setAttribute("role", "status");
  const fila = document.createElement("div");
  fila.className = "d-flex";
  const cuerpo = document.createElement("div");
  cuerpo.className = "toast-body";
  cuerpo.textContent = mensaje;
  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.className = "btn-close btn-close-white me-2 m-auto";
  cerrar.setAttribute("aria-label", "Cerrar aviso");
  cerrar.addEventListener("click", () => toast.remove());
  fila.append(cuerpo, cerrar);
  toast.appendChild(fila);
  let contenedor = document.querySelector(".toast-container");
  if (!contenedor) {
    contenedor = document.createElement("div");
    contenedor.className = "toast-container position-fixed bottom-0 end-0 p-3";
    contenedor.style.zIndex = "1100";
    document.body.appendChild(contenedor);
  }
  contenedor.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
const fmt = n => "$" + parseFloat(n || 0).toFixed(2);
