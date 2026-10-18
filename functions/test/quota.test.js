// Pruebas del registro de consumo y de las restricciones automáticas:
// descuento por consulta, bloqueo al agotarse, reinicio por ciclo y por día,
// devolución cuando la respuesta falla, y solicitudes simultáneas.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore } = require("./fake-firestore");
const { consumeUsage, readUsage, refundUsage } = require("../quota");
const { resolveEntitlement } = require("../entitlements");
const { cycleFor } = require("../plans");

const UID = "u1";
const CORREO = "felipe@example.com";
const ANCLA = "2026-03-15T06:00:00Z";

// Derecho de uso de un plan, armado como lo hace el backend.
async function derechoDe(planId, now) {
  const db = new FakeFirestore();
  db.seed(`subscriptions/${UID}`, {
    uid: UID, plan: planId, status: "active", mock: true, trialEndsAt: ANCLA
  });
  return resolveEntitlement({ db, uid: UID, freeDaily: 10, now });
}

function nuevoEscenario(entitlement, now) {
  const db = new FakeFirestore();
  const consumir = () => consumeUsage({ db, holder: CORREO, uid: UID, entitlement, now });
  const leer = () => readUsage({ db, holder: CORREO, uid: UID, entitlement, now });
  return { db, consumir, leer };
}

test("la primera consulta descuenta del cupo y queda registrada", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_2", now);
  const { db, consumir, leer } = nuevoEscenario(derecho, now);

  const antes = await leer();
  assert.equal(antes.limit, 600);
  assert.equal(antes.remaining, 600);

  const resultado = await consumir();
  assert.equal(resultado.ok, true);
  assert.equal(resultado.quota.remaining, 599);
  assert.equal(resultado.refs.length, 1, "un plan sin tope diario toca un solo contador");

  const despues = await leer();
  assert.equal(despues.remaining, 599, "el consumo quedó guardado, no solo en memoria");

  // El documento guarda a quién y a qué ciclo pertenece el consumo.
  const ciclo = cycleFor(ANCLA, now);
  const doc = db.docs.get(`usage/${UID}_c_${ciclo.key}`).data;
  assert.equal(doc.count, 1);
  assert.equal(doc.uid, UID);
  assert.equal(doc.plan, "profesional_2");
  assert.equal(doc.cycleEnd, ciclo.endIso);
});

test("Lanzamiento descuenta de los dos contadores a la vez", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("lanzamiento", now);
  const { consumir } = nuevoEscenario(derecho, now);

  const resultado = await consumir();
  assert.equal(resultado.ok, true);
  assert.equal(resultado.refs.length, 2, "ciclo y día");
  assert.equal(resultado.quota.monthly.remaining, 299);
  assert.equal(resultado.quota.daily.remaining, 9);
  assert.equal(resultado.quota.scope, "daily", "con 9 al día y 299 al mes, manda el tope diario");
});

test("al agotarse el tope diario de Lanzamiento se bloquea y no se toca el cupo del mes", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("lanzamiento", now);
  const { consumir, leer } = nuevoEscenario(derecho, now);

  for (let i = 0; i < 10; i += 1) {
    const paso = await consumir();
    assert.equal(paso.ok, true, `la consulta ${i + 1} debe pasar`);
  }

  const bloqueada = await consumir();
  assert.equal(bloqueada.ok, false, "la consulta 11 del día debe bloquearse");
  assert.equal(bloqueada.blockedBy, "daily");
  assert.equal(bloqueada.refs.length, 0, "una consulta bloqueada no consume nada");
  assert.equal(bloqueada.quota.remaining, 0);

  const estado = await leer();
  assert.equal(estado.monthly.remaining, 290, "el bloqueo diario no gastó cupo mensual de más");
});

test("al día siguiente el tope diario se reinicia y el cupo del mes continúa", async () => {
  const hoy = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("lanzamiento", hoy);
  const db = new FakeFirestore();

  for (let i = 0; i < 10; i += 1) {
    await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now: hoy });
  }
  const topado = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now: hoy });
  assert.equal(topado.ok, false);

  // Mismo ciclo de facturación, día siguiente.
  const manana = new Date("2026-03-21T18:00:00Z");
  const derechoManana = await derechoDe("lanzamiento", manana);
  assert.equal(derechoManana.cycle.key, derecho.cycle.key, "sigue siendo el mismo ciclo");

  const nuevoDia = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derechoManana, now: manana });
  assert.equal(nuevoDia.ok, true, "el día nuevo vuelve a permitir consultas");
  assert.equal(nuevoDia.quota.daily.remaining, 9, "el contador diario arrancó de cero");
  assert.equal(nuevoDia.quota.monthly.remaining, 289, "el cupo del mes siguió descontándose");
});

test("al agotarse el cupo del ciclo se bloquea hasta la siguiente facturación", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_1", now);   // Esencial: 300 al mes, sin tope diario
  const db = new FakeFirestore();
  const ciclo = cycleFor(ANCLA, now);

  // Se siembra el ciclo justo en el límite, para no correr 300 transacciones.
  db.seed(`usage/${UID}_c_${ciclo.key}`, { uid: UID, count: 300, cycleKey: ciclo.key });

  const bloqueada = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
  assert.equal(bloqueada.ok, false);
  assert.equal(bloqueada.blockedBy, "monthly");
  assert.equal(bloqueada.quota.remaining, 0);
  assert.equal(bloqueada.quota.resetAt, ciclo.endIso, "debe decir cuándo se renueva");

  // Pasada la fecha de facturación, el contador arranca limpio: otro ciclo, otro documento.
  const siguienteMes = new Date("2026-04-20T18:00:00Z");
  const derechoNuevo = await derechoDe("profesional_1", siguienteMes);
  assert.notEqual(derechoNuevo.cycle.key, ciclo.key);

  const renovada = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derechoNuevo, now: siguienteMes });
  assert.equal(renovada.ok, true, "el ciclo nuevo renueva el cupo");
  assert.equal(renovada.quota.remaining, 299);
});

test("cada plan se bloquea exactamente en su propia cuota", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const cuotas = { lanzamiento: 300, profesional_1: 300, profesional_2: 600, profesional_3: 1000 };

  for (const [planId, cuota] of Object.entries(cuotas)) {
    const derecho = await derechoDe(planId, now);
    const db = new FakeFirestore();
    const ciclo = cycleFor(ANCLA, now);

    // Una consulta antes del límite: pasa.
    db.seed(`usage/${UID}_c_${ciclo.key}`, { uid: UID, count: cuota - 1, cycleKey: ciclo.key });
    const ultima = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
    assert.equal(ultima.ok, true, `${planId}: la consulta ${cuota} debe pasar`);

    // La siguiente ya no.
    const pasada = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });
    assert.equal(pasada.ok, false, `${planId}: la consulta ${cuota + 1} debe bloquearse`);
    assert.equal(pasada.blockedBy, "monthly");
  }
});

test("una consulta que falla a medio camino se devuelve en todos los contadores", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("lanzamiento", now);
  const { db, consumir, leer } = nuevoEscenario(derecho, now);

  const consumida = await consumir();
  assert.equal(consumida.quota.monthly.remaining, 299);
  assert.equal(consumida.quota.daily.remaining, 9);

  await refundUsage(consumida.refs, (n) => ({ __increment: n }));

  const estado = await leer();
  assert.equal(estado.monthly.remaining, 300, "el cupo del mes volvió a su lugar");
  assert.equal(estado.daily.remaining, 10, "el tope diario volvió a su lugar");
});

test("el cupo gratuito solo usa el contador diario", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const gratuito = await resolveEntitlement({ db, uid: UID, freeDaily: 10, now });
  assert.equal(gratuito.source, "free");

  const resultado = await consumeUsage({ db, holder: CORREO, uid: UID, entitlement: gratuito, now });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.refs.length, 1, "sin suscripción no hay contador de ciclo");
  assert.equal(resultado.quota.limit, 10);
  assert.equal(resultado.quota.remaining, 9);
});

test("sin límites aplicables no se registra consumo (código maestro)", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const sinLimite = { source: "master", planId: null, planName: null, status: "active", monthly: null, daily: null, cycle: null };

  const resultado = await consumeUsage({ db, holder: null, uid: UID, entitlement: sinLimite, now });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.quota, null);
  assert.equal(resultado.refs.length, 0);
  assert.equal(db.docs.size, 0, "no debe escribirse nada");
});

// --- Solicitudes simultáneas -------------------------------------------------

test("dos consultas al mismo tiempo descuentan dos, no una", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_2", now);
  const db = new FakeFirestore();
  const consumir = () => consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now });

  // Se fuerza la carrera: la primera transacción lee, y antes de confirmar entra
  // otra consulta completa. La primera debe reintentar sobre el valor ya escrito.
  db.onTransactionRead = async () => { await consumir(); };

  const resultado = await consumir();
  assert.equal(resultado.ok, true);

  const ciclo = cycleFor(ANCLA, now);
  assert.equal(db.count(`usage/${UID}_c_${ciclo.key}`), 2, "ninguna de las dos se perdió");
  assert.ok(db.transactionAttempts > 2, "la transacción interrumpida debe haberse reintentado");
});

test("veinte consultas simultáneas sobre un cupo de cinco dejan pasar exactamente cinco", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const db = new FakeFirestore();
  const ciclo = cycleFor(ANCLA, now);

  // Plan Esencial con 295 ya consumidas: quedan 5.
  const derecho = await derechoDe("profesional_1", now);
  db.seed(`usage/${UID}_c_${ciclo.key}`, { uid: UID, count: 295, cycleKey: ciclo.key });

  const intentos = await Promise.all(
    Array.from({ length: 20 }, () =>
      consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now })
    )
  );

  const aceptadas = intentos.filter((r) => r.ok).length;
  const rechazadas = intentos.filter((r) => !r.ok).length;

  assert.equal(aceptadas, 5, "el cupo no se rebasa por concurrencia");
  assert.equal(rechazadas, 15);
  assert.equal(db.count(`usage/${UID}_c_${ciclo.key}`), 300, "el contador termina exactamente en el límite");
  assert.ok(intentos.filter((r) => !r.ok).every((r) => r.blockedBy === "monthly"));
});

test("quince consultas simultáneas de Lanzamiento respetan el tope diario de diez", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("lanzamiento", now);
  const db = new FakeFirestore();

  const intentos = await Promise.all(
    Array.from({ length: 15 }, () =>
      consumeUsage({ db, holder: CORREO, uid: UID, entitlement: derecho, now })
    )
  );

  assert.equal(intentos.filter((r) => r.ok).length, 10, "solo diez al día");
  assert.ok(intentos.filter((r) => !r.ok).every((r) => r.blockedBy === "daily"));

  const ciclo = cycleFor(ANCLA, now);
  assert.equal(db.count(`usage/${UID}_c_${ciclo.key}`), 10, "los dos contadores quedan de acuerdo");
  assert.equal(db.count(`usage/${CORREO}_2026-03-20`), 10);
});

test("dos usuarios simultáneos no se gastan el cupo del otro", async () => {
  const now = new Date("2026-03-20T18:00:00Z");
  const derecho = await derechoDe("profesional_1", now);
  const db = new FakeFirestore();

  const deUno = (uid, correo) =>
    consumeUsage({ db, holder: correo, uid, entitlement: derecho, now });

  await Promise.all([
    ...Array.from({ length: 6 }, () => deUno("u1", "uno@example.com")),
    ...Array.from({ length: 4 }, () => deUno("u2", "dos@example.com"))
  ]);

  const ciclo = cycleFor(ANCLA, now);
  assert.equal(db.count(`usage/u1_c_${ciclo.key}`), 6);
  assert.equal(db.count(`usage/u2_c_${ciclo.key}`), 4);
});
