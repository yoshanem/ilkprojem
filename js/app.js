(function () {
  "use strict";

  const LETTERS = ["A", "B", "C", "D", "E"];
  const STORE_ACTIVE = "tryos.active";
  const STORE_HISTORY = "tryos.history";
  const MIN_PER_QUESTION = 1.5;

  const app = document.getElementById("app");
  const timerEl = document.getElementById("timer");
  const byId = Object.fromEntries(window.QUESTIONS.map((q) => [q.id, q]));

  let exam = null;      // aktif sınav durumu
  let tick = null;      // zamanlayıcı
  let lastResult = null;

  // ---------- yardımcılar ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* yok say */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* yok say */ } },
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Sayfa içi onay penceresi (tarayıcının confirm/alert pencereleri
  // bazı ortamlarda, örneğin gömülü sayfalarda, engellenebiliyor).
  function closeAsk() { document.querySelectorAll(".modal").forEach((m) => m.remove()); }
  function ask(msg, yesText, onYes) {
    closeAsk();
    const box = document.createElement("div");
    box.className = "modal";
    box.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <p>${esc(msg)}</p>
        <div class="row">
          <button class="primary" data-yes>${esc(yesText)}</button>
          <button data-no>Vazgeç</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    box.querySelector("[data-yes]").addEventListener("click", () => { closeAsk(); onYes(); });
    box.querySelector("[data-no]").addEventListener("click", closeAsk);
    box.addEventListener("click", (e) => { if (e.target === box) closeAsk(); });
    box.querySelector("[data-yes]").focus();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  // ---------- puanlama (Node testleri için dışa da açılır) ----------
  function score(questionIds, answers, penalty) {
    const sections = {};
    let correct = 0, wrong = 0, empty = 0;
    questionIds.forEach((id) => {
      const q = byId[id];
      const s = (sections[q.section] ||= { total: 0, correct: 0, wrong: 0, empty: 0 });
      s.total++;
      const a = answers[id];
      if (a === undefined || a === null) { s.empty++; empty++; }
      else if (a === q.answer) { s.correct++; correct++; }
      else { s.wrong++; wrong++; }
    });
    const net = (c, w) => round2(penalty > 0 ? c - w / penalty : c);
    Object.values(sections).forEach((s) => { s.net = net(s.correct, s.wrong); });
    const total = questionIds.length;
    const totalNet = net(correct, wrong);
    return {
      total, correct, wrong, empty, net: totalNet,
      percent: total ? Math.max(0, round2((totalNet / total) * 100)) : 0,
      sections,
    };
  }
  window.TRYOS = { score };

  // ---------- ana ekran ----------
  function renderHome() {
    stopTimer();
    const counts = {};
    window.QUESTIONS.forEach((q) => { counts[q.section] = (counts[q.section] || 0) + 1; });
    const history = store.get(STORE_HISTORY, []);
    const saved = store.get(STORE_ACTIVE, null);

    app.innerHTML = `
      ${saved ? `
      <div class="card">
        <h2>Yarım kalan sınav</h2>
        <p class="muted">${saved.ids.length} soruluk bir denemen yarıda kaldı.</p>
        <div class="row">
          <button class="primary" id="resume">Devam et</button>
          <button id="discard">Sil</button>
        </div>
      </div>` : ""}

      <div class="card">
        <h2>Yeni deneme başlat</h2>
        <p class="muted">Bankada toplam ${window.QUESTIONS.length} soru var. Bölümleri, soru sayısını ve süreyi seç.</p>

        <div class="field checks">
          <label>Bölümler</label>
          ${Object.entries(window.SECTIONS).map(([k, name]) => `
            <label><input type="checkbox" name="sec" value="${k}" checked> ${esc(name)} <span class="muted">(${counts[k] || 0} soru)</span></label>
          `).join("")}
        </div>

        <div class="field">
          <label for="count">Soru sayısı</label>
          <input type="number" id="count" min="1">
        </div>

        <div class="field">
          <label for="minutes">Süre (dakika)</label>
          <input type="number" id="minutes" min="1">
        </div>

        <div class="field">
          <label for="penalty">Yanlış cezası</label>
          <select id="penalty">
            <option value="4" selected>4 yanlış 1 doğruyu götürür</option>
            <option value="3">3 yanlış 1 doğruyu götürür</option>
            <option value="0">Ceza yok</option>
          </select>
        </div>

        <div class="field checks">
          <label><input type="checkbox" id="shuffle" checked> Soruları karıştır</label>
        </div>

        <button class="primary" id="start">Sınavı başlat</button>
      </div>

      <div class="card">
        <h2>Geçmiş denemeler</h2>
        ${history.length ? `
          <table>
            <thead><tr><th>Tarih</th><th>Soru</th><th>D</th><th>Y</th><th>B</th><th>Net</th></tr></thead>
            <tbody>
              ${history.map((h) => `
                <tr><td>${esc(new Date(h.date).toLocaleString("tr-TR"))}</td><td>${h.total}</td>
                <td>${h.correct}</td><td>${h.wrong}</td><td>${h.empty}</td><td><b>${h.net}</b></td></tr>
              `).join("")}
            </tbody>
          </table>
          <p><button id="clearHistory">Geçmişi temizle</button></p>
        ` : `<p class="muted">Henüz tamamlanmış deneme yok.</p>`}
      </div>
    `;

    const countEl = app.querySelector("#count");
    const minEl = app.querySelector("#minutes");
    const startBtn = app.querySelector("#start");

    function available() {
      const secs = [...app.querySelectorAll('input[name="sec"]:checked')].map((i) => i.value);
      return window.QUESTIONS.filter((q) => secs.includes(q.section));
    }
    function syncDefaults() {
      const n = available().length;
      countEl.max = n;
      countEl.value = n;
      minEl.value = Math.max(1, Math.ceil(n * MIN_PER_QUESTION));
      startBtn.disabled = n === 0;
    }
    app.querySelectorAll('input[name="sec"]').forEach((el) => el.addEventListener("change", syncDefaults));
    countEl.addEventListener("input", () => {
      const n = Math.min(Number(countEl.max), Math.max(1, Number(countEl.value) || 1));
      minEl.value = Math.max(1, Math.ceil(n * MIN_PER_QUESTION));
    });
    syncDefaults();

    startBtn.addEventListener("click", () => {
      let pool = available();
      if (!pool.length) return;
      const n = Math.min(pool.length, Math.max(1, Number(countEl.value) || pool.length));
      const doShuffle = app.querySelector("#shuffle").checked;
      if (doShuffle) pool = shuffle(pool);
      pool = pool.slice(0, n);
      // Karıştırılmasa bile bölüm sırasını koru
      if (!doShuffle) {
        const order = Object.keys(window.SECTIONS);
        pool.sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
      }
      const minutes = Math.max(1, Number(minEl.value) || 1);
      startExam({
        ids: pool.map((q) => q.id),
        answers: {},
        flags: {},
        current: 0,
        penalty: Number(app.querySelector("#penalty").value),
        endsAt: Date.now() + minutes * 60 * 1000,
        startedAt: Date.now(),
      });
    });

    if (saved) {
      app.querySelector("#resume").addEventListener("click", () => startExam(saved));
      app.querySelector("#discard").addEventListener("click", () => { store.del(STORE_ACTIVE); renderHome(); });
    }
    const clr = app.querySelector("#clearHistory");
    if (clr) clr.addEventListener("click", () => {
      ask("Tüm geçmiş silinsin mi?", "Sil", () => { store.del(STORE_HISTORY); renderHome(); });
    });
  }

  // ---------- sınav ----------
  function startExam(state) {
    // Bankadan kaldırılmış soruları ayıkla
    state.ids = state.ids.filter((id) => byId[id]);
    if (!state.ids.length) { store.del(STORE_ACTIVE); renderHome(); return; }
    exam = state;
    save();
    startTimer();
    if (exam) renderQuestion();
  }

  function save() { if (exam) store.set(STORE_ACTIVE, exam); }

  function startTimer() {
    stopTimer();
    timerEl.classList.remove("hidden");
    const update = () => {
      const left = (exam.endsAt - Date.now()) / 1000;
      timerEl.textContent = "⏱ " + fmtTime(left);
      timerEl.classList.toggle("low", left <= 60);
      if (left <= 0) finishExam(true);
    };
    update();
    if (exam) tick = setInterval(update, 1000); // süre zaten dolduysa sınav bitti
  }

  function stopTimer() {
    if (tick) clearInterval(tick);
    tick = null;
    timerEl.classList.add("hidden");
  }

  function renderQuestion() {
    const id = exam.ids[exam.current];
    const q = byId[id];
    const sel = exam.answers[id];
    const answered = Object.keys(exam.answers).length;

    app.innerHTML = `
      <div class="card">
        <div class="qmeta">
          <span>Soru ${exam.current + 1} / ${exam.ids.length}</span>
          <span>${esc(window.SECTIONS[q.section])}</span>
        </div>
        <div class="qtext">${esc(q.text)}</div>
        <div class="options">
          ${q.options.map((o, i) => `
            <button class="option ${sel === i ? "selected" : ""}" data-i="${i}">
              <span class="letter">${LETTERS[i]}</span><span>${esc(o)}</span>
            </button>`).join("")}
        </div>
        <div class="row between" style="margin-top:16px">
          <div class="row">
            <button id="prev" ${exam.current === 0 ? "disabled" : ""}>← Önceki</button>
            <button id="next" ${exam.current === exam.ids.length - 1 ? "disabled" : ""}>Sonraki →</button>
          </div>
          <div class="row">
            <button id="clear" ${sel === undefined ? "disabled" : ""}>Cevabı sil</button>
            <button id="flag">${exam.flags[id] ? "★ İşareti kaldır" : "☆ Sonra bak"}</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="row between">
          <b>Sorular</b>
          <span class="muted">${answered} / ${exam.ids.length} cevaplandı</span>
        </div>
        <div class="navgrid" style="margin-top:10px">
          ${exam.ids.map((qid, i) => `
            <button data-go="${i}" class="${exam.answers[qid] !== undefined ? "answered" : ""} ${exam.flags[qid] ? "flagged" : ""} ${i === exam.current ? "current" : ""}">${i + 1}</button>
          `).join("")}
        </div>
        <div class="legend"><span>Mavi: cevaplandı</span><span>Turuncu çizgi: sonra bakılacak</span></div>
        <p style="margin-top:16px"><button class="primary" id="finish">Sınavı bitir</button></p>
      </div>
      <p class="muted">Klavye: A–E şık seçer, ← → sorular arasında gezer.</p>
    `;

    app.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => choose(Number(b.dataset.i))));
    app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.go))));
    app.querySelector("#prev").addEventListener("click", () => go(exam.current - 1));
    app.querySelector("#next").addEventListener("click", () => go(exam.current + 1));
    app.querySelector("#clear").addEventListener("click", () => { delete exam.answers[id]; save(); renderQuestion(); });
    app.querySelector("#flag").addEventListener("click", () => {
      if (exam.flags[id]) delete exam.flags[id]; else exam.flags[id] = true;
      save(); renderQuestion();
    });
    app.querySelector("#finish").addEventListener("click", () => {
      const empty = exam.ids.length - Object.keys(exam.answers).length;
      const msg = empty ? `${empty} boş sorun var. Yine de bitirmek istiyor musun?` : "Sınavı bitirmek istiyor musun?";
      ask(msg, "Bitir", () => finishExam());
    });
  }

  function choose(i) {
    const id = exam.ids[exam.current];
    exam.answers[id] = i;
    save();
    renderQuestion();
  }

  function go(i) {
    if (i < 0 || i >= exam.ids.length) return;
    exam.current = i;
    save();
    renderQuestion();
    window.scrollTo({ top: 0 });
  }

  document.addEventListener("keydown", (e) => {
    if (!exam || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".modal")) { if (e.key === "Escape") closeAsk(); return; }
    const k = e.key.toUpperCase();
    const idx = LETTERS.indexOf(k);
    if (idx >= 0) choose(idx);
    else if (e.key === "ArrowLeft") go(exam.current - 1);
    else if (e.key === "ArrowRight") go(exam.current + 1);
  });

  function finishExam(timeUp) {
    if (!exam) return;
    closeAsk();
    stopTimer();
    const result = score(exam.ids, exam.answers, exam.penalty);
    result.date = Date.now();
    result.timeUp = !!timeUp;
    result.durationSec = Math.round((Math.min(Date.now(), exam.endsAt) - exam.startedAt) / 1000);
    const history = store.get(STORE_HISTORY, []);
    history.unshift({ date: result.date, total: result.total, correct: result.correct, wrong: result.wrong, empty: result.empty, net: result.net });
    store.set(STORE_HISTORY, history.slice(0, 20));
    store.del(STORE_ACTIVE);
    lastResult = { result, exam };
    exam = null;
    renderResult();
  }

  // ---------- sonuç ----------
  function renderResult() {
    const { result: r, exam: ex } = lastResult;
    app.innerHTML = `
      <div class="card">
        <h2>Sonuç</h2>
        ${r.timeUp ? `<p class="timeup">Süre doldu, sınav otomatik olarak bitirildi.</p>` : ""}
        <div class="stats">
          <div class="stat"><div class="v">${r.net}</div><div class="k">Net</div></div>
          <div class="stat"><div class="v">%${r.percent}</div><div class="k">Başarı</div></div>
          <div class="stat"><div class="v">${r.correct}</div><div class="k">Doğru</div></div>
          <div class="stat"><div class="v">${r.wrong}</div><div class="k">Yanlış</div></div>
          <div class="stat"><div class="v">${r.empty}</div><div class="k">Boş</div></div>
          <div class="stat"><div class="v">${fmtTime(r.durationSec)}</div><div class="k">Süre</div></div>
        </div>
        <p class="muted">${ex.penalty ? `Net = Doğru − Yanlış / ${ex.penalty}` : "Yanlış cezası uygulanmadı."}</p>
      </div>

      <div class="card">
        <h2>Bölüm bazında</h2>
        <table>
          <thead><tr><th>Bölüm</th><th>Soru</th><th>D</th><th>Y</th><th>B</th><th>Net</th></tr></thead>
          <tbody>
            ${Object.keys(window.SECTIONS).filter((k) => r.sections[k]).map((k) => {
              const s = r.sections[k];
              return `<tr><td>${esc(window.SECTIONS[k])}</td><td>${s.total}</td><td>${s.correct}</td><td>${s.wrong}</td><td>${s.empty}</td><td><b>${s.net}</b></td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="row">
        <button class="primary" id="review">Cevapları incele</button>
        <button id="home">Ana sayfa</button>
      </div>
    `;
    app.querySelector("#review").addEventListener("click", () => renderReview(0));
    app.querySelector("#home").addEventListener("click", renderHome);
  }

  function renderReview(i) {
    const ex = lastResult.exam;
    const id = ex.ids[i];
    const q = byId[id];
    const mine = ex.answers[id];
    const status = mine === undefined ? "Boş bıraktın" : mine === q.answer ? "Doğru" : "Yanlış";

    app.innerHTML = `
      <div class="card">
        <div class="qmeta">
          <span>Soru ${i + 1} / ${ex.ids.length} · <b>${status}</b></span>
          <span>${esc(window.SECTIONS[q.section])}</span>
        </div>
        <div class="qtext">${esc(q.text)}</div>
        <div class="options">
          ${q.options.map((o, j) => {
            const cls = j === q.answer ? "correct" : j === mine ? "wrong" : "";
            return `<div class="option btn ${cls}"><span class="letter">${LETTERS[j]}</span><span>${esc(o)}</span></div>`;
          }).join("")}
        </div>
        <div class="explain"><b>Çözüm:</b> ${esc(q.explanation || "Açıklama yok.")}</div>
        <div class="row between" style="margin-top:16px">
          <div class="row">
            <button id="prev" ${i === 0 ? "disabled" : ""}>← Önceki</button>
            <button id="next" ${i === ex.ids.length - 1 ? "disabled" : ""}>Sonraki →</button>
          </div>
          <button id="back">Sonuca dön</button>
        </div>
      </div>
      <div class="card">
        <div class="navgrid">
          ${ex.ids.map((qid, k) => {
            const a = ex.answers[qid];
            const cls = a === undefined ? "" : a === byId[qid].answer ? "ok" : "bad";
            return `<button data-go="${k}" class="${cls} ${k === i ? "current" : ""}">${k + 1}</button>`;
          }).join("")}
        </div>
        <div class="legend"><span>Yeşil: doğru</span><span>Kırmızı: yanlış</span><span>Beyaz: boş</span></div>
      </div>
    `;
    app.querySelector("#prev").addEventListener("click", () => renderReview(i - 1));
    app.querySelector("#next").addEventListener("click", () => renderReview(i + 1));
    app.querySelector("#back").addEventListener("click", renderResult);
    app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => renderReview(Number(b.dataset.go))));
  }

  renderHome();
})();
