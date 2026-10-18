// Pruebas de la tabla de planes: cuotas, topes diarios, ciclos de facturación
// y vigencia de la promoción de Lanzamiento.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PLANS, getPlan, planIds, isPromoOpen, promoEndsAtIso, canSubscribeTo,
  dayKey, addMonthsClamped, cycleFor, quotaView, exceeded
} = require("../plans");

test("los cuatro planes tienen las cuotas acordadas", () => {
  assert.deepEqual(planIds().sort(), ["lanzamiento", "profesional_1", "profesional_2", "profesional_3"]);

  const esperado = {
    lanzamiento:   { name: "Lanzamiento", monthly: 300,  daily: 10,   promo: true },
    profesional_1: { name: "Esencial",    monthly: 300,  daily: null, promo: false },
    profesional_2: { name: "Profesional", monthly: 600,  daily: null, promo: false },
    profesional_3: { name: "Avanzado",    monthly: 1000, daily: null, promo: false }
  };

  for (const [id, valores] of Object.entries(esperado)) {
    const plan = getPlan(id);
    assert.equal(plan.name, valores.name, `nombre de ${id}`);
    assert.equal(plan.monthly, valores.monthly, `cuota mensual de ${id}`);
    assert.equal(plan.daily, valores.daily, `tope diario de ${id}`);
    assert.equal(plan.promo, valores.promo, `promoción de ${id}`);
  }
});

test("solo Lanzamiento tiene tope diario", () => {
  const conTopeDiario = planIds().filter((id) => PLANS[id].daily);
  assert.deepEqual(conTopeDiario, ["lanzamiento"]);
});

test("un plan inexistente no se resuelve", () => {
  assert.equal(getPlan("gratis_total"), null);
  assert.equal(getPlan(undefined), null);
  assert.deepEqual(canSubscribeTo("gratis_total"), { ok: false, reason: "invalid" });
});

test("la promoción cubre todo el 10 de noviembre de 2026 y cierra a medianoche", () => {
  assert.equal(promoEndsAtIso(), "2026-11-11T06:00:00.000Z");

  const abierta = [
    "2026-10-17T12:00:00Z",          // hoy
    "2026-11-10T06:00:01Z",          // 10 nov, 00:00 CDMX
    "2026-11-11T05:59:59Z"           // 10 nov, 23:59 CDMX
  ];
  for (const iso of abierta) {
    assert.equal(isPromoOpen(new Date(iso)), true, `debería estar abierta en ${iso}`);
    assert.equal(canSubscribeTo("lanzamiento", new Date(iso)).ok, true, `debería poder contratarse en ${iso}`);
  }

  const cerrada = ["2026-11-11T06:00:00Z", "2026-11-11T06:00:01Z", "2027-01-01T00:00:00Z"];
  for (const iso of cerrada) {
    assert.equal(isPromoOpen(new Date(iso)), false, `debería estar cerrada en ${iso}`);
    assert.deepEqual(
      canSubscribeTo("lanzamiento", new Date(iso)),
      { ok: false, reason: "promo_closed" },
      `debería rechazarse en ${iso}`
    );
  }
});

test("el cierre de la promoción no afecta a los otros tres planes", () => {
  const despues = new Date("2027-06-01T00:00:00Z");
  for (const id of ["profesional_1", "profesional_2", "profesional_3"]) {
    assert.equal(canSubscribeTo(id, despues).ok, true, `${id} debe seguir disponible`);
  }
});

test("la clave del día usa la hora de la Ciudad de México, no UTC", () => {
  // 18:30 CDMX del 17 de octubre son las 00:30 UTC del 18.
  assert.equal(dayKey(new Date("2026-10-18T00:30:00Z")), "2026-10-17");
  assert.equal(dayKey(new Date("2026-10-18T06:00:00Z")), "2026-10-18");
});

test("la aritmética de meses se ajusta cuando el día no existe", () => {
  // addMonthsClamped(año, mesBase0, día, meses) -> epoch en ms, a las 00:00 CDMX.
  const iso = (...args) => new Date(addMonthsClamped(...args)).toISOString();

  assert.equal(iso(2026, 0, 31, 1), "2026-02-28T06:00:00.000Z", "31 de enero + 1 mes = 28 de febrero");
  assert.equal(iso(2028, 0, 31, 1), "2028-02-29T06:00:00.000Z", "en año bisiesto, 29 de febrero");
  assert.equal(iso(2026, 2, 31, 1), "2026-04-30T06:00:00.000Z", "31 de marzo + 1 mes = 30 de abril");
  assert.equal(iso(2026, 0, 15, 1), "2026-02-15T06:00:00.000Z", "un día que sí existe no se mueve");
  assert.equal(iso(2026, 11, 15, 1), "2027-01-15T06:00:00.000Z", "el cambio de año avanza bien");
  assert.equal(iso(2026, 0, 31, 12), "2027-01-31T06:00:00.000Z", "doce meses después, el mismo día");
});

test("el ciclo de facturación avanza con la fecha de contratación", () => {
  const ancla = "2026-03-15T06:00:00Z";

  const primero = cycleFor(ancla, new Date("2026-03-20T00:00:00Z"));
  assert.equal(primero.index, 0);
  assert.equal(primero.startIso, "2026-03-15T06:00:00.000Z");
  assert.equal(primero.endIso, "2026-04-15T06:00:00.000Z");

  const segundo = cycleFor(ancla, new Date("2026-04-20T00:00:00Z"));
  assert.equal(segundo.index, 1);
  assert.equal(segundo.startIso, "2026-04-15T06:00:00.000Z");
  assert.notEqual(segundo.key, primero.key, "cada ciclo necesita su propia clave");

  const lejano = cycleFor(ancla, new Date("2027-03-20T00:00:00Z"));
  assert.equal(lejano.index, 12);
});

test("antes del primer cobro el ciclo es la ventana de prueba", () => {
  const ciclo = cycleFor("2026-03-15T06:00:00Z", new Date("2026-03-01T00:00:00Z"));
  assert.equal(ciclo.index, -1);
});

test("un ciclo que cae en fin de mes no se desborda", () => {
  const ciclo = cycleFor("2026-01-31T06:00:00Z", new Date("2026-02-15T00:00:00Z"));
  assert.equal(ciclo.endIso, "2026-02-28T06:00:00.000Z");
});

test("exceeded señala qué cupo bloquea, con el diario antes que el mensual", () => {
  assert.equal(exceeded({ monthly: 300, daily: 10, monthlyUsed: 5, dailyUsed: 3 }), null);
  assert.equal(exceeded({ monthly: 300, daily: 10, monthlyUsed: 5, dailyUsed: 10 }), "daily");
  assert.equal(exceeded({ monthly: 300, daily: 10, monthlyUsed: 300, dailyUsed: 0 }), "monthly");
  assert.equal(exceeded({ monthly: null, daily: 10, monthlyUsed: 9999, dailyUsed: 2 }), null,
    "sin cuota mensual, el consumo del ciclo no bloquea");
});

test("quotaView informa el cupo que está más cerca de agotarse", () => {
  const cycle = cycleFor("2026-03-15T06:00:00Z", new Date("2026-03-20T00:00:00Z"));
  const now = new Date("2026-03-20T18:00:00Z");

  // Lanzamiento con 8 de 10 diarias usadas: manda el tope diario.
  const diario = quotaView({ monthly: 300, daily: 10, monthlyUsed: 50, dailyUsed: 8, cycle, now });
  assert.equal(diario.scope, "daily");
  assert.equal(diario.limit, 10);
  assert.equal(diario.remaining, 2);
  assert.equal(diario.monthly.remaining, 250);

  // Mismo plan con el mes casi agotado: manda el cupo del ciclo.
  const mensual = quotaView({ monthly: 300, daily: 10, monthlyUsed: 299, dailyUsed: 0, cycle, now });
  assert.equal(mensual.scope, "monthly");
  assert.equal(mensual.remaining, 1);
  assert.equal(mensual.resetAt, cycle.endIso);

  // Un plan sin tope diario informa siempre el cupo del ciclo.
  const soloMensual = quotaView({ monthly: 600, daily: null, monthlyUsed: 100, dailyUsed: 0, cycle, now });
  assert.equal(soloMensual.scope, "monthly");
  assert.equal(soloMensual.limit, 600);
  assert.equal(soloMensual.remaining, 500);
});

test("quotaView nunca reporta restante negativo", () => {
  const cycle = cycleFor("2026-03-15T06:00:00Z", new Date("2026-03-20T00:00:00Z"));
  const vista = quotaView({ monthly: 300, daily: 10, monthlyUsed: 400, dailyUsed: 25, cycle, now: new Date("2026-03-20T18:00:00Z") });
  assert.equal(vista.remaining, 0);
  assert.ok(vista.monthly.remaining >= 0);
  assert.ok(vista.daily.remaining >= 0);
});
