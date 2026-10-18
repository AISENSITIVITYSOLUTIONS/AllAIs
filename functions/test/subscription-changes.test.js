// Pruebas de los cambios de suscripción: subir de plan, bajar de plan,
// cancelar, y qué pasa con el consumo ya registrado en el ciclo en curso.

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeFirestore } = require("./fake-firestore");
const { consumeUsage, readUsage } = require("../quota");
const { resolveEntitlement } = require("../entitlements");
const { cycleFor, canSubscribeTo } = require("../plans");

const UID = "u1";
const CORREO = "felipe@example.com";
const ANCLA = "2026-03-15T06:00:00Z";
const AHORA = new Date("2026-03-20T18:00:00Z");

// Una cuenta suscrita cuyo plan se puede cambiar, como lo hace /billing/change.
function cuenta(planId) {
  const db = new FakeFirestore();
  db.seed(`subscriptions/${UID}`, {
    uid: UID, plan: planId, status: "active", mock: true, trialEndsAt: ANCLA
  });
  return {
    db,
    cambiarA(nuevoPlan) {
      const actual = db.docs.get(`subscriptions/${UID}`).data;
      db.seed(`subscriptions/${UID}`, { ...actual, plan: nuevoPlan });
    },
    cancelar() {
      const actual = db.docs.get(`subscriptions/${UID}`).data;
      db.seed(`subscriptions/${UID}`, { ...actual, status: "cancelled" });
    },
    derecho: (now = AHORA) => resolveEntitlement({ db, uid: UID, freeDaily: 10, now }),
    consumir: (entitlement, now = AHORA) =>
      consumeUsage({ db, holder: CORREO, uid: UID, entitlement, now }),
    leer: (entitlement, now = AHORA) =>
      readUsage({ db, holder: CORREO, uid: UID, entitlement, now })
  };
}

test("al subir de plan, el cupo crece y el consumo del ciclo se conserva", async () => {
  const c = cuenta("profesional_1");              // Esencial: 300

  let derecho = await c.derecho();
  for (let i = 0; i < 5; i += 1) await c.consumir(derecho);
  assert.equal((await c.leer(derecho)).remaining, 295);

  c.cambiarA("profesional_3");                     // Avanzado: 1000
  derecho = await c.derecho();

  assert.equal(derecho.planId, "profesional_3");
  assert.equal(derecho.monthly, 1000);

  const estado = await c.leer(derecho);
  assert.equal(estado.limit, 1000, "el límite nuevo aplica de inmediato");
  assert.equal(estado.remaining, 995, "las 5 ya usadas siguen contadas, no se regalan");
});

test("al bajar de plan, el cupo se reduce y puede quedar agotado en el acto", async () => {
  const c = cuenta("profesional_3");                // Avanzado: 1000
  const ciclo = cycleFor(ANCLA, AHORA);
  c.db.seed(`usage/${UID}_c_${ciclo.key}`, { uid: UID, count: 700, cycleKey: ciclo.key });

  c.cambiarA("profesional_1");                      // Esencial: 300
  const derecho = await c.derecho();

  assert.equal(derecho.monthly, 300);
  const bloqueada = await c.consumir(derecho);
  assert.equal(bloqueada.ok, false, "con 700 usadas, un cupo de 300 ya está agotado");
  assert.equal(bloqueada.blockedBy, "monthly");
  assert.equal(bloqueada.quota.remaining, 0, "nunca se informa un restante negativo");
});

test("al pasar de Lanzamiento a un plan superior desaparece el tope diario", async () => {
  const c = cuenta("lanzamiento");

  let derecho = await c.derecho();
  assert.equal(derecho.daily, 10);
  for (let i = 0; i < 10; i += 1) await c.consumir(derecho);

  const topado = await c.consumir(derecho);
  assert.equal(topado.ok, false);
  assert.equal(topado.blockedBy, "daily");

  c.cambiarA("profesional_2");                      // Profesional: 600, sin tope diario
  derecho = await c.derecho();

  assert.equal(derecho.daily, null, "los planes superiores no tienen tope diario");
  const liberada = await c.consumir(derecho);
  assert.equal(liberada.ok, true, "el cambio de plan levanta el bloqueo del día");
  assert.equal(liberada.refs.length, 1, "ya no se toca el contador diario");
  assert.equal(liberada.quota.scope, "monthly");
  assert.equal(liberada.quota.remaining, 589, "las 11 del ciclo siguen contadas");
});

test("al pasar a Lanzamiento aparece el tope diario, y el techo real sigue siendo el del ciclo", async () => {
  const c = cuenta("profesional_2");

  let derecho = await c.derecho();
  for (let i = 0; i < 8; i += 1) await c.consumir(derecho);

  c.cambiarA("lanzamiento");
  derecho = await c.derecho();
  assert.equal(derecho.daily, 10);

  const estado = await c.leer(derecho);

  // Comportamiento deliberado: un plan sin tope diario no escribe el contador del
  // día, así que al bajar a Lanzamiento ese contador empieza en cero. El margen
  // que esto abre está acotado: el cupo del ciclo sigue contando las 8 anteriores
  // y es el que manda. En la práctica es un caso casi imposible, porque después
  // del 10 de noviembre de 2026 ya no se puede cambiar a Lanzamiento.
  assert.equal(estado.daily.used, 0, "el contador del día arranca al activarse el tope");
  assert.equal(estado.monthly.used, 8, "el consumo del ciclo sí se conserva íntegro");
  assert.equal(estado.monthly.limit, 300, "y con el límite del plan nuevo");
});

test("una cancelación devuelve la cuenta al cupo gratuito, sin cuota mensual", async () => {
  const c = cuenta("profesional_3");

  let derecho = await c.derecho();
  assert.equal(derecho.monthly, 1000);

  c.cancelar();
  derecho = await c.derecho();

  assert.equal(derecho.source, "free");
  assert.equal(derecho.reason, "status_cancelled");
  assert.equal(derecho.monthly, null);
  assert.equal(derecho.daily, 10);

  const resultado = await c.consumir(derecho);
  assert.equal(resultado.ok, true, "cancelar no deja a la cuenta sin servicio, la deja en el plan gratuito");
  assert.equal(resultado.quota.limit, 10);
  assert.equal(resultado.refs.length, 1, "sin suscripción no se toca el contador de ciclo");
});

test("volver a suscribirse en el mismo ciclo no revive el consumo del plan anterior", async () => {
  const c = cuenta("profesional_1");
  const ciclo = cycleFor(ANCLA, AHORA);
  c.db.seed(`usage/${UID}_c_${ciclo.key}`, { uid: UID, count: 290, cycleKey: ciclo.key });

  c.cancelar();
  c.cambiarA("profesional_2");
  const actual = c.db.docs.get(`subscriptions/${UID}`).data;
  c.db.seed(`subscriptions/${UID}`, { ...actual, status: "active" });

  const derecho = await c.derecho();
  assert.equal(derecho.planId, "profesional_2");

  // El consumo del ciclo es del ciclo, no del plan: se respeta, con el límite nuevo.
  const estado = await c.leer(derecho);
  assert.equal(estado.limit, 600);
  assert.equal(estado.remaining, 310);
});

test("terminada la promoción, Lanzamiento ya no se puede contratar ni cambiar", async () => {
  // Es la misma comprobación que usan /billing/subscribe y /billing/change.
  const cerrada = new Date("2026-11-11T06:00:00Z");
  assert.deepEqual(canSubscribeTo("lanzamiento", cerrada), { ok: false, reason: "promo_closed" });

  // Quien ya lo tiene contratado lo conserva: la fecha limita la venta, no el servicio.
  const c = cuenta("lanzamiento");
  const derecho = await resolveEntitlement({ db: c.db, uid: UID, freeDaily: 10, now: cerrada });
  assert.equal(derecho.planId, "lanzamiento");
  assert.equal(derecho.monthly, 300);
  assert.equal(derecho.daily, 10);
});
