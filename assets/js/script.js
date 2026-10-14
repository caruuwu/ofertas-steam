const URL_OFERTAS = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60";
const URL_BUSQUEDA = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=0&pageSize=60";
const URL_PRECIO_5 = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&upperPrice=5";
const URL_PRECIO_15 = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&upperPrice=15";
const URL_PRECIO_30 = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&upperPrice=30";
const URL_PRECIO_ASC = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&sortBy=Price&desc=0";
const URL_PRECIO_DESC = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&sortBy=Price&desc=1";
const URL_DESCUENTO_ASC = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&sortBy=Savings&desc=1";
const URL_DESCUENTO_DESC = "https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&pageSize=60&sortBy=Savings&desc=0";
const URL_STEAM_CHILE = "https://store.steampowered.com/api/appdetails?cc=cl&l=spanish&filters=price_overview";
const URL_PROXY = "https://proxy.cors.dev/";
const URL_TIENDA = "https://store.steampowered.com";

const TAMANO_PAGINA = 60;
const TAMANO_LOTE = 15;

const $ = selector => document.querySelector(selector);
const seccion = $(".juegos");
const estado = $("#estado");
const entrada = $("#busquedaJuego");
const precio = $("#precioMaximo");
const orden = $("#ordenJuegos");
const moneda = $("#moneda");
const mas = $("#cargarMas");
const banderas = document.querySelectorAll(".moneda-btn");

const cacheChile = new Map();
const carrito = new Map();

const formatos = {
    USD: new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD"
    }),
    CLP: new Intl.NumberFormat("es-CL", {
        style: "currency", currency: "CLP",
        maximumFractionDigits: 0
    })
};
let juegos = [];
let termino = "";
let pagina = 0;
let revision = 0;
let cargando = false;
let hayMas = true;
let falloChile = false;
let mensaje = "";

function escapar(valor) {
    const entidades = {
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#039;"
    };
    return String(valor ?? "").replace(
        /[&<>"']/g, caracter => entidades[caracter]
    );
}

function appID(juego) {
    const id = String(juego.steamAppID ?? "");
    return /^\d+$/.test(id) && id !== "0" ? id : "";
}

function clave(juego) {
    return appID(juego) || juego.gameID || juego.dealID || juego.title;
}

async function getJSON(url) {
    const respuesta = await fetch(url, { credentials: "omit" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return respuesta.json();
}

function mostrarEstado(texto = mensaje) {
    mensaje = texto;
    estado.textContent = texto + (
        moneda.value === "CLP" && falloChile
            ? " Algunos precios regionales de Steam no pudieron consultarse; vuelve a intentarlo más tarde."
            : ""
    );
}

function urlOfertas() {
    const url = new URL(termino ? URL_BUSQUEDA : URL_OFERTAS);
    let urlPrecio;
    let urlOrden;

    switch (precio.value) {
        case "5": urlPrecio = URL_PRECIO_5; break;
        case "15": urlPrecio = URL_PRECIO_15; break;
        case "30": urlPrecio = URL_PRECIO_30; break;
    }

    switch (orden.value) {
        case "precio-asc": urlOrden = URL_PRECIO_ASC; break;
        case "precio-desc": urlOrden = URL_PRECIO_DESC; break;
        case "descuento-asc": urlOrden = URL_DESCUENTO_ASC; break;
        case "descuento-desc": urlOrden = URL_DESCUENTO_DESC; break;
    }

    if (urlPrecio) {
        url.searchParams.set(
            "upperPrice",
            new URL(urlPrecio).searchParams.get("upperPrice")
        );
    }

    if (urlOrden) {
        const parametros = new URL(urlOrden).searchParams;
        url.searchParams.set("sortBy", parametros.get("sortBy"));
        url.searchParams.set("desc", parametros.get("desc"));
    }

    if (termino) url.searchParams.set("title", termino);
    url.searchParams.set("pageNumber", String(pagina));
    return url.href;
}

async function consultarChile(lista) {
    const ids = [...new Set(lista.map(appID))]
        .filter(id => id && !cacheChile.has(id));

    let fallo = false;

    for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
        const lote = ids.slice(i, i + TAMANO_LOTE);
        const url = new URL(URL_STEAM_CHILE);
        url.searchParams.set("appids", lote.join(","));

        try {
            const datos = await getJSON(URL_PROXY + url.href);

            lote.forEach(id => {
                const regional = datos[id]?.success
                    ? datos[id].data?.price_overview
                    : null;

                cacheChile.set(
                    id, regional?.currency === "CLP" ? regional : null
                );
            });
        } catch (error) {
            fallo = true;
            console.warn("Error al consultar Steam Chile:", error);
        }
    }

    return fallo;
}

function precioJuego(juego) {
    const chile = moneda.value === "CLP";
    const regional = cacheChile.get(appID(juego));

    function importe(valor) {
        if (valor === null || valor === undefined || valor === "") {
            return null;
        }

        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero < 0) return null;
        return Math.round(chile ? numero : numero * 100);
    }

    return {
        final: importe(chile ? regional?.final : juego.salePrice),
        normal: importe(chile ? regional?.initial : juego.normalPrice),
        descuento: Math.round(Number(
            chile ? regional?.discount_percent : juego.savings
        ) || 0)
    };
}

function dinero(importe) {
    return formatos[moneda.value].format(importe / 100);
}

function tarjeta(juego, indice) {
    const titulo = escapar(juego.title);
    const datos = precioJuego(juego);
    const disponible = datos.final !== null;

    const rebajado = disponible && datos.normal !== null
        && datos.descuento > 0 && datos.normal > datos.final;

    let etiqueta = "Sin descuento detectado";

    if (rebajado) {
        etiqueta = `${datos.descuento}% de descuento`;
    } else if (moneda.value === "CLP") {
        etiqueta = disponible
            ? "Precio de Steam Chile"
            : "Precio regional no disponible";
    }

    const id = appID(juego);
    const enlace = id
        ? `${URL_TIENDA}/app/${id}/`
        : `${URL_TIENDA}/search/?term=${encodeURIComponent(juego.title)}`;

    return `
        <div class="col">
            <article class="card juego-card h-100 rounded-3">
                ${juego.thumb
            ? `<img src="${escapar(juego.thumb)}"
                        class="card-img-top" alt="Carátula de ${titulo}"
                        loading="lazy" onerror="this.style.display='none'">`
            : `<div class="imagen-vacia d-flex align-items-center
                        justify-content-center small text-body-secondary">
                        Imagen no disponible
                      </div>`}

                <div class="card-body d-flex flex-column gap-3 p-3">
                    <h3 class="card-title fs-6 fw-bold mb-0">${titulo}</h3>

                    <p class="precios d-flex align-items-baseline flex-wrap gap-2 mb-0">
                        ${rebajado
            ? `<del class="small text-body-secondary">${escapar(dinero(datos.normal))}</del>`
            : ""}
                        <strong class="fs-5">${disponible
            ? escapar(dinero(datos.final))
            : moneda.value === "CLP" ? "" : "Precio no disponible"}</strong>
                    </p>

                        <div class="mt-auto d-flex align-items-center justify-content-between gap-2">
                        <span class="badge text-bg-${rebajado
            ? "success" : "secondary"} descuento text-wrap">
                            ${etiqueta}
                        </span>

                        <button type="button"
                            class="btn btn-outline-info btn-sm flex-shrink-0"
                            data-agregar="${indice}"
                            aria-label="Agregar ${titulo} al carrito"
                            title="Agregar al carrito"
                            ${disponible ? "" : "disabled"}>
                            <svg xmlns="http://www.w3.org/2000/svg"
                                width="20" height="20" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round"
                                aria-hidden="true">
                                <path d="M2 3h3l3 12h11l3-9H6"/>
                                <circle cx="9" cy="20" r="1"/>
                                <circle cx="18" cy="20" r="1"/>
                            </svg>
                        </button>
                    </div>

                    <a href="${enlace}" class="btn btn-info"
                        target="_blank" rel="noopener noreferrer">
                        Ver en Steam
                    </a>
                    </div>
                </div>
            </article>
        </div>
    `;
}

function pintar() {
    seccion.innerHTML = juegos.map(tarjeta).join("");
    pintarCarrito();
}

function pintarCarrito() {
    let suma = 0;
    let faltantes = 0;

    $("#listaCarrito").innerHTML = [...carrito.values()]
        .map((juego, indice) => {
            const importe = precioJuego(juego).final;

            if (importe === null) faltantes++;
            else suma += importe;

            return `
                <li class="list-group-item px-0 d-flex justify-content-between gap-3">
                    <div class="flex-grow-1">
                        <p class="fw-semibold text-break mb-1">
                            ${escapar(juego.title)}
                        </p>
                        <span class="small text-body-secondary">
                            ${importe === null
                    ? "Precio no disponible"
                    : escapar(dinero(importe))}
                        </span>
                    </div>
                    <button type="button"
                        class="btn btn-outline-danger btn-sm align-self-start"
                        data-quitar="${indice}"
                        aria-label="Quitar ${escapar(juego.title)} del carrito">
                        Quitar
                    </button>
                </li>
            `;
        }).join("") || `
            <li class="list-group-item text-body-secondary px-0">
                El carrito está vacío.
            </li>
        `;

    $("#cantidadCarrito").textContent = carrito.size;
    $("#botonCarrito").classList.toggle("d-none", carrito.size === 0);
    $("#botonCarrito").setAttribute(
        "aria-label", `Abrir carrito: ${carrito.size} juego(s)`
    );

    $("#totalCarrito").textContent =
        `${faltantes ? "Subtotal disponible" : "Total"} (${moneda.value}): `
        + dinero(suma);

    $("#avisoCarrito").textContent = faltantes
        ? `${faltantes} juego(s) sin precio en esta moneda. No están incluidos en el subtotal.`
        : "";

    $("#vaciarCarrito").disabled = carrito.size === 0;

    seccion.querySelectorAll("button[data-agregar]").forEach(boton => {
        const juego = juegos[Number(boton.dataset.agregar)];
        if (!juego) return;

        const agregado = carrito.has(clave(juego));

        boton.classList.toggle("btn-outline-info", !agregado);
        boton.classList.toggle("btn-success", agregado);
        boton.setAttribute("aria-pressed", String(agregado));

        boton.title = agregado
            ? "Ya está en el carrito"
            : "Agregar al carrito";

        boton.setAttribute(
            "aria-label",
            agregado
                ? `${juego.title} ya está en el carrito`
                : `Agregar ${juego.title} al carrito`
        );

        let marca = boton.querySelector(".marca-carrito");

        if (agregado && !marca) {
            marca = document.createElement("span");
            marca.className = "marca-carrito ms-1";
            marca.setAttribute("aria-hidden", "true");
            marca.textContent = "✓";
            boton.appendChild(marca);
        } else if (!agregado && marca) {
            marca.remove();
        }
    });
}

async function cargar(reiniciar = false) {
    if (!reiniciar && (cargando || !hayMas)) return;

    if (reiniciar) {
        revision++;
        pagina = 0;
        juegos = [];
        hayMas = true;
        falloChile = false;
        mas.hidden = true;
        pintar();
    }

    const actual = revision;
    cargando = true;
    mas.disabled = true;

    mostrarEstado(termino
        ? "Buscando juegos y precios regionales…"
        : "Cargando ofertas y precios regionales…"
    );

    try {
        const resultados = await getJSON(urlOfertas());
        if (actual !== revision) return;

        const fallo = await consultarChile(resultados);
        if (actual !== revision) return;

        const vistos = new Set(juegos.map(clave));

        resultados.forEach(juego => {
            const id = clave(juego);
            if (vistos.has(id)) return;
            vistos.add(id);
            juegos.push(juego);
        });

        falloChile = fallo;
        hayMas = resultados.length === TAMANO_PAGINA;
        pagina++;
        mas.hidden = !hayMas;
        pintar();

        mostrarEstado(termino
            ? juegos.length
                ? `Se encontraron ${juegos.length} juego(s) relacionados con “${termino}”. Los precios CLP provienen de Steam Chile y los precios USD de CheapShark.`
                : `No se encontraron juegos compatibles con Steam para “${termino}” en el catálogo consultado. Prueba con otro
                nombre.`
            : juegos.length
                ? "Ofertas actuales de Steam."
                : "No se encontraron ofertas con estos filtros."
        );
    } catch (error) {
        if (actual !== revision) return;
        console.error("Error al cargar juegos:", error);

        mostrarEstado(termino
            ? "No se pudo completar la búsqueda. Revisa tu conexión e inténtalo de nuevo."
            : "No se pudieron cargar las ofertas. Revisa tu conexión e inténtalo de nuevo."
        );

        mas.hidden = false;
    } finally {
        if (actual === revision) {
            cargando = false;
            mas.disabled = false;
        }
    }
}

function actualizarMoneda() {
    $("#notaMoneda").textContent = (
        moneda.value === "CLP"
            ? "CLP muestra el precio regional en la tienda de Chile."
            : "USD muestra los precios en dólares entregados por CheapShark."
    ) + " El orden y el filtro de precio se basan en los datos USD de CheapShark.";

    banderas.forEach(boton => {
        boton.setAttribute(
            "aria-pressed",
            String(boton.dataset.moneda === moneda.value)
        );
    });

    mostrarEstado();
    pintar();
}

$("#busquedaForm").addEventListener("submit", evento => {
    evento.preventDefault();
    termino = entrada.value.trim();
    cargar(true);
});

$("#limpiarBusqueda").addEventListener("click", () => {
    entrada.value = "";
    termino = "";
    precio.value = "";
    cargar(true);
});

[precio, orden].forEach(selector => {
    selector.addEventListener("change", () => cargar(true));
});

mas.addEventListener("click", () => cargar());

banderas.forEach(boton => {
    boton.addEventListener("click", () => {
        if (boton.dataset.moneda === moneda.value) return;
        moneda.value = boton.dataset.moneda;
        moneda.dispatchEvent(new Event("change"));
    });
});

moneda.addEventListener("change", async () => {
    actualizarMoneda();
    if (moneda.value !== "CLP") return;

    const actual = revision;
    const cantidad = juegos.length;

    const fallo = await consultarChile([
        ...juegos, ...carrito.values()
    ]);

    if (actual !== revision || cantidad !== juegos.length) return;

    falloChile = fallo;
    mostrarEstado();
    pintar();
});

seccion.addEventListener("click", evento => {
    const boton = evento.target.closest("button[data-agregar]");
    if (!boton) return;

    const juego = juegos[Number(boton.dataset.agregar)];
    if (!juego || precioJuego(juego).final === null) return;

    carrito.set(clave(juego), juego);
    pintarCarrito();
});

$("#listaCarrito").addEventListener("click", evento => {
    const boton = evento.target.closest("button[data-quitar]");
    if (!boton) return;

    const claves = [...carrito.keys()];
    carrito.delete(claves[Number(boton.dataset.quitar)]);
    pintarCarrito();
});

$("#vaciarCarrito").addEventListener("click", () => {
    carrito.clear();
    pintarCarrito();
});

actualizarMoneda();
cargar(true);
