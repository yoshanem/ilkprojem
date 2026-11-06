// Soru bankasını ve puanlamayı doğrular:  node scripts/validate.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/questions.js"), "utf8"), ctx);
const { QUESTIONS, SECTIONS } = ctx.window;

const ids = new Set();
for (const q of QUESTIONS) {
  assert(q.id && !ids.has(q.id), `Eksik ya da tekrar eden id: ${q.id}`);
  ids.add(q.id);
  assert(SECTIONS[q.section], `${q.id}: bilinmeyen bölüm ${q.section}`);
  assert(typeof q.text === "string" && q.text.trim(), `${q.id}: soru metni yok`);
  assert(Array.isArray(q.options) && q.options.length === 5, `${q.id}: 5 şık olmalı`);
  assert(new Set(q.options).size === 5, `${q.id}: şıklar birbirinden farklı olmalı`);
  assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 5, `${q.id}: geçersiz cevap indeksi`);
}

// Puanlama fonksiyonunu (DOM olmadan) test et
const scoreSrc = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const fnSrc = scoreSrc.slice(scoreSrc.indexOf("function score("), scoreSrc.indexOf("window.TRYOS"));
const sctx = { byId: Object.fromEntries(QUESTIONS.map((q) => [q.id, q])), round2: (n) => Math.round(n * 100) / 100 };
vm.createContext(sctx);
vm.runInContext(fnSrc + "; this.score = score;", sctx);

const sample = QUESTIONS.slice(0, 6).map((q) => q.id);
const answers = {};
sample.slice(0, 3).forEach((id) => { answers[id] = sctx.byId[id].answer; });           // 3 doğru
sample.slice(3, 5).forEach((id) => { answers[id] = (sctx.byId[id].answer + 1) % 5; });  // 2 yanlış, 1 boş
const r = sctx.score(sample, answers, 4);
assert.deepStrictEqual([r.correct, r.wrong, r.empty, r.net], [3, 2, 1, 2.5]);
assert.strictEqual(sctx.score(sample, answers, 0).net, 3);

const perSection = {};
QUESTIONS.forEach((q) => { perSection[q.section] = (perSection[q.section] || 0) + 1; });
console.log(`OK: ${QUESTIONS.length} soru doğrulandı`, perSection);
