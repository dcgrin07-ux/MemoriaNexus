import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "memoria-nexus-actividades";

const formularioInicial = {
  titulo: "",
  descripcion: "",
  fecha: "",
  hora: "",
  prioridad: "normal",
  categoria: "General",
};

function App() {
  const [actividades, setActividades] = useState(() => {
    try {
      const guardadas = localStorage.getItem(STORAGE_KEY);
      return guardadas ? JSON.parse(guardadas) : [];
    } catch {
      return [];
    }
  });

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [ahora, setAhora] = useState(new Date());

  const [formulario, setFormulario] = useState(formularioInicial);

  // Control de alarmas visuales
  const [alarmaActiva, setAlarmaActiva] = useState(null);
  const [alarmasAtendidas, setAlarmasAtendidas] = useState(() => {
    try {
      const guardadas = localStorage.getItem("memoria-nexus-alarmas-atendidas");
      return new Set(guardadas ? JSON.parse(guardadas) : []);
    } catch {
      return new Set();
    }
  });
  const [alarmaPospuesta, setAlarmaPospuesta] = useState(null);
  const audioContextRef = useRef(null);
  const sonidoAlarmaRef = useRef(null);

  useEffect(() => {
    const intervalo = setInterval(() => {
      setAhora(new Date());
    }, 1000);

    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(actividades)
    );
  }, [actividades]);

  useEffect(() => {
    localStorage.setItem(
      "memoria-nexus-alarmas-atendidas",
      JSON.stringify([...alarmasAtendidas])
    );
  }, [alarmasAtendidas]);

  // Sonido de alarma: se activa mientras la alarma visual está abierta.
  // Usa Web Audio para no depender de archivos externos.
  useEffect(() => {
    if (!alarmaActiva) {
      if (sonidoAlarmaRef.current) {
        clearInterval(sonidoAlarmaRef.current);
        sonidoAlarmaRef.current = null;
      }
      return;
    }

    let contexto;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      contexto = audioContextRef.current;

      if (!contexto) {
        contexto = new AudioContextClass();
        audioContextRef.current = contexto;
      }

      const reproducirBeep = () => {
        try {
          if (contexto.state === "suspended") {
            contexto.resume();
          }

          const oscilador = contexto.createOscillator();
          const ganancia = contexto.createGain();

          oscilador.type = "square";
          oscilador.frequency.setValueAtTime(880, contexto.currentTime);
          ganancia.gain.setValueAtTime(0.0001, contexto.currentTime);
          ganancia.gain.exponentialRampToValueAtTime(0.12, contexto.currentTime + 0.02);
          ganancia.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.28);

          oscilador.connect(ganancia);
          ganancia.connect(contexto.destination);

          oscilador.start();
          oscilador.stop(contexto.currentTime + 0.3);
        } catch {
          // Si el navegador bloquea el audio, la alarma visual sigue funcionando.
        }
      };

      reproducirBeep();
      sonidoAlarmaRef.current = setInterval(reproducirBeep, 1000);
    } catch {
      // La alarma visual no depende del sonido.
    }

    return () => {
      if (sonidoAlarmaRef.current) {
        clearInterval(sonidoAlarmaRef.current);
        sonidoAlarmaRef.current = null;
      }
    };
  }, [alarmaActiva]);

  // Al abrir la aplicación, las actividades que ya estaban vencidas se consideran
  // atendidas para no disparar una alarma vieja. Las nuevas actividades sí podrán alarmar.
  useEffect(() => {
    const vencidasAlAbrir = actividades
      .filter((actividad) => {
        if (actividad.completada || !actividad.hora) return false;
        const fechaObjetivo = new Date(
          `${actividad.fecha}T${actividad.hora}:00`
        );
        return fechaObjetivo < ahora;
      })
      .map((actividad) => actividad.id);

    if (vencidasAlAbrir.length > 0) {
      setAlarmasAtendidas((anteriores) => {
        const nuevas = new Set(anteriores);
        vencidasAlAbrir.forEach((id) => nuevas.add(id));
        return nuevas;
      });
    }
  }, []);

  // Comprueba cada segundo si llegó la hora de alguna actividad.
  // La alarma se muestra una sola vez hasta que vuelva a ser programada.
  useEffect(() => {
    if (alarmaActiva) return;

    if (
      alarmaPospuesta &&
      ahora >= alarmaPospuesta.hasta
    ) {
      const actividadPospuesta = actividades.find(
        (actividad) =>
          actividad.id === alarmaPospuesta.id &&
          !actividad.completada
      );

      setAlarmaPospuesta(null);

      if (actividadPospuesta) {
        setAlarmaActiva(actividadPospuesta);
        mostrarNotificacionAlarma(actividadPospuesta);
        return;
      }
    }

    const proximaAlarma = actividades
      .filter(
        (actividad) =>
          !actividad.completada &&
          actividad.hora &&
          !alarmasAtendidas.has(actividad.id)
      )
      .map((actividad) => ({
        actividad,
        fechaObjetivo: new Date(
          `${actividad.fecha}T${actividad.hora}:00`
        ),
      }))
      .filter(({ fechaObjetivo }) => ahora >= fechaObjetivo)
      .sort(
        (a, b) =>
          a.fechaObjetivo - b.fechaObjetivo
      )[0];

    if (proximaAlarma) {
      setAlarmaActiva(proximaAlarma.actividad);
      mostrarNotificacionAlarma(proximaAlarma.actividad);

      setAlarmasAtendidas((anteriores) => {
        const nuevas = new Set(anteriores);
        nuevas.add(proximaAlarma.actividad.id);
        return nuevas;
      });
    }
  }, [
    ahora,
    actividades,
    alarmaActiva,
    alarmaPospuesta,
    alarmasAtendidas,
  ]);

  const actividadesOrdenadas = useMemo(() => {
    return [...actividades].sort((a, b) => {
      if (a.completada && !b.completada) return 1;
      if (!a.completada && b.completada) return -1;

      const fechaA = new Date(
        `${a.fecha}T${a.hora || "23:59"}:00`
      );

      const fechaB = new Date(
        `${b.fecha}T${b.hora || "23:59"}:00`
      );

      return fechaA - fechaB;
    });
  }, [actividades]);

  const estadisticas = useMemo(() => {
    const pendientes = actividades.filter(
      (a) => !a.completada
    );

    const hoy = new Date();

    const inicioHoy = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate()
    );

    const finHoy = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate(),
      23,
      59,
      59
    );

    const paraHoy = pendientes.filter((a) => {
      const fecha = new Date(
        `${a.fecha}T${a.hora || "23:59"}:00`
      );

      return fecha >= inicioHoy && fecha <= finHoy;
    });

    const limite7Dias = new Date(
      hoy.getTime() +
        7 * 24 * 60 * 60 * 1000
    );

    const proximos7 = pendientes.filter((a) => {
      const fecha = new Date(
        `${a.fecha}T${a.hora || "23:59"}:00`
      );

      return (
        fecha >= hoy &&
        fecha <= limite7Dias
      );
    });

    const completadas = actividades.filter(
      (a) => a.completada
    );

    return {
      pendientes: pendientes.length,
      paraHoy: paraHoy.length,
      proximos7: proximos7.length,
      completadas: completadas.length,
    };
  }, [actividades, ahora]);

  function obtenerEstadoTiempo(actividad) {
    if (actividad.completada) {
      return "completada";
    }

    const fechaObjetivo = new Date(
      `${actividad.fecha}T${actividad.hora || "23:59"}:00`
    );

    const diferencia =
      fechaObjetivo - ahora;

    if (diferencia < 0) {
      return "vencido";
    }

    if (
      diferencia <=
      24 * 60 * 60 * 1000
    ) {
      return "rojo";
    }

    if (
      diferencia <=
      3 * 24 * 60 * 60 * 1000
    ) {
      return "amarillo";
    }

    return "verde";
  }

  function obtenerTiempoRestante(actividad) {
    const fechaObjetivo = new Date(
      `${actividad.fecha}T${actividad.hora || "23:59"}:00`
    );

    let diferencia =
      fechaObjetivo - ahora;

    if (diferencia < 0) {
      diferencia = Math.abs(diferencia);
    }

    const dias = Math.floor(
      diferencia /
        (1000 * 60 * 60 * 24)
    );

    const horas = Math.floor(
      (diferencia %
        (1000 * 60 * 60 * 24)) /
        (1000 * 60 * 60)
    );

    const minutos = Math.floor(
      (diferencia %
        (1000 * 60 * 60)) /
        (1000 * 60)
    );

    const segundos = Math.floor(
      (diferencia %
        (1000 * 60)) /
        1000
    );

    return {
      dias,
      horas,
      minutos,
      segundos,
    };
  }

  function formatearFecha(fecha) {
    if (!fecha) return "";

    const partes =
      fecha.split("-");

    if (partes.length !== 3) {
      return fecha;
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function abrirFormulario() {
    setEditandoId(null);
    setFormulario({
      ...formularioInicial,
    });
    setMostrarFormulario(true);
  }

  function editarActividad(actividad) {
    setEditandoId(actividad.id);

    setFormulario({
      titulo:
        actividad.titulo || "",

      descripcion:
        actividad.descripcion || "",

      fecha:
        actividad.fecha || "",

      hora:
        actividad.hora || "",

      prioridad:
        actividad.prioridad || "normal",

      categoria:
        actividad.categoria || "General",
    });

    setMostrarFormulario(true);
  }

  function cerrarFormulario() {
    setMostrarFormulario(false);
    setEditandoId(null);

    setFormulario({
      ...formularioInicial,
    });
  }

  function manejarCambio(e) {
    const {
      name,
      value,
    } = e.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value,
    }));
  }

  function guardarActividad(e) {
    e.preventDefault();

    if (
      !formulario.titulo.trim() ||
      !formulario.fecha
    ) {
      alert(
        "Completá al menos el título y la fecha."
      );

      return;
    }

    const datosGuardar = {
      ...formulario,
    };

    if (editandoId) {
      setActividades(
        (anteriores) =>
          anteriores.map(
            (actividad) =>
              actividad.id ===
              editandoId
                ? {
                    ...actividad,
                    ...datosGuardar,
                  }
                : actividad
          )
      );
    } else {
      const nuevaActividad = {
        id: Date.now(),

        ...datosGuardar,

        completada: false,

        creadaEn:
          new Date().toISOString(),
      };

      setActividades(
        (anteriores) => [
          ...anteriores,
          nuevaActividad,
        ]
      );
    }

    cerrarFormulario();
  }

  function eliminarActividad(id) {
    const confirmar =
      window.confirm(
        "¿Querés eliminar esta actividad?"
      );

    if (!confirmar) {
      return;
    }

    setActividades(
      (anteriores) =>
        anteriores.filter(
          (actividad) =>
            actividad.id !== id
        )
    );
  }

  function completarActividad(id) {
    setActividades(
      (anteriores) =>
        anteriores.map(
          (actividad) =>
            actividad.id === id
              ? {
                  ...actividad,
                  completada:
                    !actividad.completada,
                }
              : actividad
        )
    );
  }

  function enviarWhatsApp(
    actividad
  ) {
    const fecha =
      formatearFecha(
        actividad.fecha
      );

    const hora =
      actividad.hora
        ? ` a las ${actividad.hora}`
        : "";

    const mensaje =
      `📌 Memoria Nexus\n\n` +
      `${actividad.titulo}\n` +
      `${actividad.descripcion || ""}\n\n` +
      `📅 ${fecha}${hora}\n` +
      `⚠️ No olvidar esta actividad.`;

    const url =
      `https://wa.me/?text=${encodeURIComponent(
        mensaje
      )}`;

    window.open(
      url,
      "_blank"
    );
  }

  async function mostrarNotificacionAlarma(actividad) {
    if (!('Notification' in window)) return;

    try {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      if (Notification.permission !== 'granted') return;

      const registro = await navigator.serviceWorker?.ready;
      const opciones = {
        body: `${actividad.descripcion || ''}${actividad.descripcion ? '\n' : ''}📅 ${formatearFecha(actividad.fecha)}${actividad.hora ? ` · ${actividad.hora}` : ''}`,
        icon: '/memoria-nexus-icon-192.png',
        badge: '/memoria-nexus-icon-192.png',
        tag: `memoria-nexus-${actividad.id}`,
        requireInteraction: true,
        vibrate: [300, 150, 300, 150, 500],
        data: { id: actividad.id },
      };

      if (registro?.showNotification) {
        await registro.showNotification('🚨 MEMORIA NEXUS', opciones);
      } else {
        new Notification('🚨 MEMORIA NEXUS', opciones);
      }
    } catch {
      // Si el navegador no permite notificaciones, la alarma visual y sonora siguen funcionando.
    }
  }

  function cerrarAlarma() {
    setAlarmaActiva(null);
  }

  function posponerAlarma() {
    if (!alarmaActiva) return;

    setAlarmaPospuesta({
      id: alarmaActiva.id,
      hasta: new Date(
        ahora.getTime() + 10 * 60 * 1000
      ),
    });

    setAlarmaActiva(null);
  }

  function completarDesdeAlarma() {
    if (!alarmaActiva) return;

    completarActividad(alarmaActiva.id);
    setAlarmaActiva(null);
  }

  function obtenerIconoPrioridad(
    prioridad
  ) {
    if (
      prioridad ===
      "urgente"
    ) {
      return "🔴";
    }

    if (
      prioridad ===
      "importante"
    ) {
      return "🟠";
    }

    return "🔵";
  }

  function obtenerTextoEstado(
    estado
  ) {
    if (
      estado ===
      "vencido"
    ) {
      return "VENCIDO";
    }

    if (
      estado ===
      "rojo"
    ) {
      return "FALTA";
    }

    if (
      estado ===
      "amarillo"
    ) {
      return "FALTA";
    }

    if (
      estado ===
      "verde"
    ) {
      return "FALTA";
    }

    return "COMPLETADA";
  }

  return (
    <>
      <style>{`
        .alarma-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at center, rgba(140, 0, 0, 0.96) 0%, rgba(45, 0, 0, 0.99) 55%, #120000 100%);
          animation: alarmaEntrada 0.18s ease-out;
        }

        .alarma-panel {
          width: min(720px, 100%);
          max-height: 90vh;
          overflow: auto;
          box-sizing: border-box;
          padding: 34px 30px 30px;
          text-align: center;
          color: #fff;
          border: 3px solid rgba(255, 255, 255, 0.9);
          border-radius: 24px;
          background: rgba(18, 0, 0, 0.78);
          box-shadow:
            0 0 0 8px rgba(255, 255, 255, 0.06),
            0 0 70px rgba(255, 40, 40, 0.9);
        }

        .alarma-icon {
          font-size: clamp(48px, 10vw, 88px);
          line-height: 1;
          margin-bottom: 10px;
        }

        .alarma-marca {
          font-size: 0.9rem;
          font-weight: 800;
          letter-spacing: 0.28em;
          opacity: 0.9;
          margin-bottom: 10px;
        }

        .alarma-alerta {
          font-size: clamp(1.4rem, 4vw, 2.2rem);
          font-weight: 900;
          letter-spacing: 0.08em;
          margin-bottom: 18px;
        }

        .alarma-titulo {
          margin: 0;
          font-size: clamp(2rem, 6vw, 4rem);
          line-height: 1.05;
          font-weight: 900;
          word-break: break-word;
        }

        .alarma-datos {
          display: flex;
          justify-content: center;
          gap: 22px;
          flex-wrap: wrap;
          margin-top: 20px;
          font-size: 1.15rem;
          font-weight: 800;
        }

        .alarma-descripcion {
          max-width: 600px;
          margin: 22px auto 0;
          font-size: 1.1rem;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .alarma-acciones {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 30px;
        }

        .alarma-boton {
          min-height: 54px;
          border: 0;
          border-radius: 14px;
          padding: 12px 18px;
          font-size: 1rem;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .alarma-boton:hover {
          transform: scale(1.02);
        }

        .alarma-hecho {
          background: #fff;
          color: #111;
          box-shadow: 0 0 24px rgba(255, 255, 255, 0.35);
        }

        .alarma-posponer {
          background: #ffd400;
          color: #171000;
          box-shadow: 0 0 24px rgba(255, 212, 0, 0.4);
        }

        .alarma-cerrar {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.35);
        }

        @keyframes alarmaEntrada {
          from {
            opacity: 0;
            transform: scale(1.02);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @media (min-width: 620px) {
          .alarma-acciones {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>

      <div className="app">

      <header className="topbar">

        <div className="brand-nexus">

          <img
            src="/nexus-digital-logo.png"
            alt="NexusDigital"
            className="nexus-digital-logo"
          />

        </div>

        <button
          className="new-button"
          onClick={
            abrirFormulario
          }
        >
          + Nueva actividad
        </button>

      </header>

      <main>

        <section className="hero">

          <div className="hero-title">

            <img
              src="/memoria-nexus-logo.png"
              alt="Memoria Nexus"
              className="memoria-nexus-logo"
            />

          </div>

        </section>

        <section className="stats">

          <div className="stat-card">
            <div className="stat-icon">
              📌
            </div>

            <div className="stat-number">
              {
                estadisticas.pendientes
              }
            </div>

            <div className="stat-label">
              Pendientes
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              🗓️
            </div>

            <div className="stat-number">
              {
                estadisticas.paraHoy
              }
            </div>

            <div className="stat-label">
              Para hoy
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              ⌛
            </div>

            <div className="stat-number">
              {
                estadisticas.proximos7
              }
            </div>

            <div className="stat-label">
              Próximos 7 días
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              ✓
            </div>

            <div className="stat-number">
              {
                estadisticas.completadas
              }
            </div>

            <div className="stat-label">
              Completadas
            </div>
          </div>

        </section>

        <section className="agenda">

          <div className="section-heading">

            <div>

              <p className="eyebrow">
                AGENDA MEMORIA
              </p>

              <h1>
                Recordatorios y actividades
              </h1>

              <p>
                Organizá lo importante y anticipá a cada vencimiento.
              </p>

            </div>

            <button
              className="primary-action"
              onClick={
                abrirFormulario
              }
            >
              + Agregar actividad
            </button>

          </div>

          <div className="activity-list">

            {actividadesOrdenadas.length ===
            0 ? (

              <div className="empty-state">

                <div className="empty-icon">
                  🧠
                </div>

                <h2>
                  No hay actividades cargadas
                </h2>

                <p>
                  Agregá tu primer recordatorio para comenzar.
                </p>

                <button
                  className="primary-action"
                  onClick={
                    abrirFormulario
                  }
                >
                  + Nueva actividad
                </button>

              </div>

            ) : (

              actividadesOrdenadas.map(
                (actividad) => {

                  const estado =
                    obtenerEstadoTiempo(
                      actividad
                    );

                  const tiempo =
                    obtenerTiempoRestante(
                      actividad
                    );

                  return (

                    <article
                      className={`activity-card ${estado}`}
                      key={
                        actividad.id
                      }
                    >

                      <div className="activity-info">

                        <div className="activity-top">

                          <span
                            className={`priority-badge ${actividad.prioridad}`}
                          >
                            {
                              obtenerIconoPrioridad(
                                actividad.prioridad
                              )
                            }{" "}
                            {
                              actividad.prioridad.toUpperCase()
                            }
                          </span>

                          <span className="category-badge">
                            {
                              actividad.categoria
                            }
                          </span>

                        </div>

                        <h2
                          className={
                            actividad.completada
                              ? "completed-title"
                              : ""
                          }
                        >
                          {
                            actividad.titulo
                          }
                        </h2>

                        {actividad.descripcion && (
                          <p className="activity-description">
                            {
                              actividad.descripcion
                            }
                          </p>
                        )}

                        <div className="activity-date">

                          📅{" "}
                          {
                            formatearFecha(
                              actividad.fecha
                            )
                          }

                          {actividad.hora
                            ? ` · ${actividad.hora}`
                            : ""}

                        </div>

                        <div className="activity-actions">

                          <button
                            className="action-button complete"
                            onClick={() =>
                              completarActividad(
                                actividad.id
                              )
                            }
                          >
                            {
                              actividad.completada
                                ? "↩ Reactivar"
                                : "✓ Completar"
                            }
                          </button>

                          <button
                            className="action-button edit"
                            onClick={() =>
                              editarActividad(
                                actividad
                              )
                            }
                          >
                            ✎ Editar
                          </button>

                          <button
                            className="action-button whatsapp"
                            onClick={() =>
                              enviarWhatsApp(
                                actividad
                              )
                            }
                          >
                            WhatsApp
                          </button>

                          <button
                            className="action-button delete"
                            onClick={() =>
                              eliminarActividad(
                                actividad.id
                              )
                            }
                          >
                            🗑
                          </button>

                        </div>

                      </div>

                      <div
                        className={`countdown-card ${estado}`}
                      >

                        <div className="countdown-status">
                          {
                            obtenerTextoEstado(
                              estado
                            )
                          }
                        </div>

                        {actividad.completada ? (

                          <div className="completed-message">
                            ✓ ACTIVIDAD COMPLETADA
                          </div>

                        ) : (

                          <div className="countdown-values">

                            <div>
                              <strong>
                                {String(
                                  tiempo.dias
                                ).padStart(
                                  2,
                                  "0"
                                )}
                              </strong>

                              <span>
                                DÍAS
                              </span>
                            </div>

                            <div>
                              <strong>
                                {String(
                                  tiempo.horas
                                ).padStart(
                                  2,
                                  "0"
                                )}
                              </strong>

                              <span>
                                HORAS
                              </span>
                            </div>

                            <div>
                              <strong>
                                {String(
                                  tiempo.minutos
                                ).padStart(
                                  2,
                                  "0"
                                )}
                              </strong>

                              <span>
                                MIN
                              </span>
                            </div>

                            <div>
                              <strong>
                                {String(
                                  tiempo.segundos
                                ).padStart(
                                  2,
                                  "0"
                                )}
                              </strong>

                              <span>
                                SEG
                              </span>
                            </div>

                          </div>

                        )}

                      </div>

                    </article>

                  );
                }
              )

            )}

          </div>

        </section>

      </main>

      {alarmaActiva && (
        <div
          className="alarma-overlay"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="alarma-panel">
            <div className="alarma-icon">🚨</div>
            <div className="alarma-marca">MEMORIA NEXUS</div>
            <div className="alarma-alerta">⚠️ ¡ATENCIÓN!</div>

            <h2 className="alarma-titulo">
              {alarmaActiva.titulo}
            </h2>

            <div className="alarma-datos">
              <div>
                📅 {formatearFecha(alarmaActiva.fecha)}
              </div>

              {alarmaActiva.hora && (
                <div>
                  🕐 {alarmaActiva.hora}
                </div>
              )}
            </div>

            {alarmaActiva.descripcion && (
              <p className="alarma-descripcion">
                {alarmaActiva.descripcion}
              </p>
            )}

            <div className="alarma-acciones">
              <button
                type="button"
                className="alarma-boton alarma-hecho"
                onClick={completarDesdeAlarma}
              >
                ✓ YA LO HICE
              </button>

              <button
                type="button"
                className="alarma-boton alarma-posponer"
                onClick={posponerAlarma}
              >
                ⏰ POSPONER 10 MIN
              </button>

              <button
                type="button"
                className="alarma-boton alarma-cerrar"
                onClick={cerrarAlarma}
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">

        <span>
          Memoria Nexus
        </span>

        <span>
          ·
        </span>

        <span>
          NexusDigital
        </span>

      </footer>

      {mostrarFormulario && (

        <div
          className="modal-overlay"
          onClick={
            cerrarFormulario
          }
        >

          <div
            className="modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <p className="eyebrow">
                  MEMORIA NEXUS
                </p>

                <h2>
                  {editandoId
                    ? "Editar actividad"
                    : "Nueva actividad"}
                </h2>

              </div>

              <button
                className="close-button"
                onClick={
                  cerrarFormulario
                }
              >
                ×
              </button>

            </div>

            <form
              onSubmit={
                guardarActividad
              }
            >

              <div className="form-group">

                <label>
                  Título
                </label>

                <input
                  type="text"
                  name="titulo"
                  value={
                    formulario.titulo
                  }
                  onChange={
                    manejarCambio
                  }
                  placeholder="Ej: Reunión con Edia"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />

              </div>

              <div className="form-group">

                <label>
                  Descripción
                </label>

                <textarea
                  name="descripcion"
                  value={
                    formulario.descripcion
                  }
                  onChange={
                    manejarCambio
                  }
                  placeholder="Detalle opcional"
                  rows="3"
                  autoComplete="off"
                  spellCheck={false}
                />

              </div>

              <div className="form-row">

                <div className="form-group">

                  <label>
                    Fecha
                  </label>

                  <input
                    type="date"
                    name="fecha"
                    value={
                      formulario.fecha
                    }
                    onChange={
                      manejarCambio
                    }
                    lang="es-AR"
                    required
                  />

                </div>

                <div className="form-group">

                  <label>
                    Hora
                  </label>

                  <input
                    type="time"
                    name="hora"
                    value={
                      formulario.hora
                    }
                    onChange={
                      manejarCambio
                    }
                    lang="es-AR"
                    step="60"
                  />

                </div>

              </div>

              <div className="form-row">

                <div className="form-group">

                  <label>
                    Prioridad
                  </label>

                  <select
                    name="prioridad"
                    value={
                      formulario.prioridad
                    }
                    onChange={
                      manejarCambio
                    }
                  >

                    <option value="normal">
                      Normal
                    </option>

                    <option value="importante">
                      Importante
                    </option>

                    <option value="urgente">
                      Urgente
                    </option>

                  </select>

                </div>

                <div className="form-group">

                  <label>
                    Categoría
                  </label>

                  <input
                    type="text"
                    name="categoria"
                    value={
                      formulario.categoria
                    }
                    onChange={
                      manejarCambio
                    }
                    placeholder="General"
                  />

                </div>

              </div>

              <div className="modal-actions">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    cerrarFormulario
                  }
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="primary-action"
                >
                  {editandoId
                    ? "Guardar cambios"
                    : "Guardar actividad"}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>
    </>
  );
}

export default App;