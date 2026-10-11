/* =========================================================
   ჩემი დღეები — უკუთვლის ლოგიკა
   ყველა თარიღი ითვლება თბილისის დროით (Asia/Tbilisi),
   მოწყობილობის დროის ზონის მიუხედავად.

   ტესტირება: მისამართს დაუმატე ?now=2026-12-31T23:59:50
   (დრო აღიქმება თბილისის დროით) და ნახავ ახალი წლის დადგომას.
   ========================================================= */
(function () {
  'use strict';

  // ---------- პარამეტრები (მარტივად შესაცვლელი) ----------
  const CONFIG = {
    timeZone: 'Asia/Tbilisi',
    fallbackOffsetMinutes: 240,          // UTC+4, თუ ბრაუზერს დროის ზონები არ აქვს
    defaultBirthday: { month: 10, day: 21 }, // 21 ოქტომბერი
    storageKey: 'countdons.birthday',
  };

  const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
    'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
  const WEEKDAYS = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];

  const PALETTES = {
    ny: ['#E8E1F5', '#CDBEF0', '#DDE9DF', '#B5D3BC', '#FFFFFF', '#F2DDA4'],
    bd: ['#F4DDE4', '#EDB4C6', '#E8E1F5', '#CDBEF0', '#DDE9DF', '#F6D9A8'],
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- საათი (შესაძლებელია ?now= პარამეტრით გადაწევა) ----------
  const clockOffset = (function () {
    const raw = new URLSearchParams(location.search).get('now');
    if (!raw) return 0;
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const parsed = Date.parse(hasZone ? raw : raw + '+04:00');
    return Number.isNaN(parsed) ? 0 : parsed - Date.now();
  })();
  const now = () => Date.now() + clockOffset;

  // ---------- თბილისის დრო ----------
  let formatter = null;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: CONFIG.timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
  } catch (e) { formatter = null; }

  /** თბილისის კალენდარული ნაწილები მოცემული მომენტისთვის */
  function tbilisiParts(ms) {
    if (!formatter) {
      const d = new Date(ms + CONFIG.fallbackOffsetMinutes * 60000);
      return {
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
        hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
      };
    }
    const p = {};
    for (const part of formatter.formatToParts(new Date(ms))) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }
    if (p.hour === 24) p.hour = 0; // ძველი ბრაუზერების თავისებურება
    return p;
  }

  /** თბილისის ოფსეტი (მს) მოცემულ მომენტში */
  function tbilisiOffset(ms) {
    const p = tbilisiParts(ms);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUTC - Math.floor(ms / 1000) * 1000;
  }

  /** თბილისის შუაღამის (00:00) აბსოლუტური დრო მოცემული თარიღისთვის */
  const midnightCache = new Map();
  function tbilisiMidnight(year, month, day) {
    const key = year + '-' + month + '-' + day;
    if (midnightCache.has(key)) return midnightCache.get(key);
    const guess = Date.UTC(year, month - 1, day);
    let result = guess - tbilisiOffset(guess);
    const corrected = guess - tbilisiOffset(result);
    if (corrected !== result) result = corrected;
    midnightCache.set(key, result);
    return result;
  }

  // ---------- დაბადების დღე (ინახება localStorage-ში) ----------
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

  /** სწორია თუ არა დღე/თვე (29 თებერვალი დაშვებულია) */
  function isValidBirthday(b) {
    return !!b && Number.isInteger(b.month) && Number.isInteger(b.day) &&
      b.month >= 1 && b.month <= 12 && b.day >= 1 && b.day <= daysInMonth(2024, b.month);
  }

  function loadBirthday() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey));
      if (isValidBirthday(saved)) return { month: saved.month, day: saved.day };
    } catch (e) { /* არასწორი მონაცემი ან მიუწვდომელი საცავი */ }
    return { ...CONFIG.defaultBirthday };
  }

  function saveBirthday(b) {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify({ month: b.month, day: b.day })); } catch (e) { /* პრივატული რეჟიმი */ }
  }

  let birthday = loadBirthday();

  /** დაბადების დღე კონკრეტულ წელს (29 თებერვალი → 28 არანაკიან წელს) */
  function birthdayIn(year) {
    const day = birthday.month === 2 && birthday.day === 29 && !isLeap(year) ? 28 : birthday.day;
    return { year, month: birthday.month, day };
  }

  // ---------- მოვლენები ----------

  const EVENTS = [
    {
      id: 'ny',
      isToday: (p) => p.month === 1 && p.day === 1,
      next: (p) => ({ year: p.year + 1, month: 1, day: 1 }),
      prev: (t) => ({ year: t.year - 1, month: 1, day: 1 }),
      dateLabel: (t) => [`${t.day} ${MONTHS[t.month - 1]} ${t.year}`, `, ${weekday(t)}`],
      todayLabel: (p) => [`${p.day} ${MONTHS[p.month - 1]} ${p.year}`, ' — დღესასწაული!'],
      sub: (p) => `ბედნიერ ${p.year} წელს გისურვებ! ✨`,
    },
    {
      id: 'bd',
      isToday: (p) => {
        const b = birthdayIn(p.year);
        return p.month === b.month && p.day === b.day;
      },
      next: (p) => {
        const b = birthdayIn(p.year);
        const passed = p.month > b.month || (p.month === b.month && p.day >= b.day);
        return passed ? birthdayIn(p.year + 1) : b;
      },
      prev: (t) => birthdayIn(t.year - 1),
      dateLabel: (t) => [`${t.day} ${MONTHS[t.month - 1]}`, `, ${weekday(t)}`],
      todayLabel: (p) => [`${p.day} ${MONTHS[p.month - 1]}`, ' — დღეს შენი დღეა!'],
      sub: () => 'დღეს ყველაზე განსაკუთრებული დღეა 🎈',
    },
  ];

  function weekday(t) {
    return WEEKDAYS[new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay()];
  }

  const pad = (n) => String(n).padStart(2, '0');

  // DOM-ის მომზადება
  for (const ev of EVENTS) {
    ev.card = document.getElementById(ev.id);
    ev.dateEl = document.getElementById(ev.id + '-date');
    ev.subEl = ev.card.querySelector('[data-sub]');
    ev.nums = {};
    ev.card.querySelectorAll('[data-unit]').forEach((el) => { ev.nums[el.dataset.unit] = el; });
    ev.progress = ev.card.querySelector(".progress");
    ev.progressFill = ev.card.querySelector("[data-progress-fill]");
    ev.progressValue = ev.card.querySelector("[data-progress-value]");
    ev.lastPercent = -1;
    ev.values = {};
    ev.celebrating = null; // null = ჯერ არ დახატულა
    ev.lastDateText = '';
  }

  /** ჩიპი და ღილაკი ერთ რიგში: საჭიროებისას კვირის დღე იმალება */
  function fitMeta(card) {
    const meta = card.querySelector('.card__meta');
    if (!meta) return;
    meta.classList.remove('is-compact');
    const items = meta.children;
    if (items.length > 1 && items[items.length - 1].offsetTop > items[0].offsetTop + 4) {
      meta.classList.add('is-compact');
    }
  }

  function setNum(ev, unit, value, animate) {
    if (ev.values[unit] === value) return;
    ev.values[unit] = value;
    const el = ev.nums[unit];
    el.textContent = value;
    el.classList.toggle("is-long", value.length > 2);
    if (animate) restartAnimation(el, 'is-ticking');
  }

  function render(ev, ms, parts, firstRun) {
    const celebrating = ev.isToday(parts);

    if (celebrating !== ev.celebrating) {
      const wasCounting = ev.celebrating === false;
      ev.celebrating = celebrating;
      ev.card.classList.toggle('is-celebrating', celebrating);
      if (celebrating) {
        ev.subEl.textContent = ev.sub(parts);
        if (wasCounting || firstRun) Confetti.rain(PALETTES[ev.id]);
      }
    }

    const target = ev.next(parts);
    const [main, extra] = celebrating ? ev.todayLabel(parts) : ev.dateLabel(target);
    const dateText = main + extra;
    if (dateText !== ev.lastDateText) {
      ev.dateEl.textContent = main;
      const extraEl = document.createElement('span');
      extraEl.className = 'chip__extra';
      extraEl.textContent = extra;
      ev.dateEl.append(extraEl);
      fitMeta(ev.card);
      ev.dateEl.setAttribute('datetime', `${target.year}-${pad(target.month)}-${pad(target.day)}`);
      ev.lastDateText = dateText;
    }

    // დარჩენილი დრო (არასდროს უარყოფითი)
    const targetMs = tbilisiMidnight(target.year, target.month, target.day);
    const diff = Math.max(0, targetMs - ms);

    // პროგრესი: წინა თარიღიდან შემდეგამდე გავლილი გზა
    const from = ev.prev(target);
    const startMs = tbilisiMidnight(from.year, from.month, from.day);
    const ratio = celebrating ? 1 : Math.min(1, Math.max(0, (ms - startMs) / (targetMs - startMs)));
    ev.progressFill.style.setProperty("--p", ratio.toFixed(5));
    const percent = Math.floor(ratio * 100);
    if (percent !== ev.lastPercent) {
      ev.lastPercent = percent;
      ev.progressValue.textContent = percent + "%";
      ev.progress.setAttribute("aria-valuenow", String(percent));
    }
    const total = Math.floor(diff / 1000);
    const animate = !firstRun;
    setNum(ev, 'days', pad(Math.floor(total / 86400)), animate);
    setNum(ev, 'hours', pad(Math.floor((total % 86400) / 3600)), animate);
    setNum(ev, 'minutes', pad(Math.floor((total % 3600) / 60)), animate);
    setNum(ev, 'seconds', pad(total % 60), animate);
  }

  let timer = 0;
  let started = false;
  function tick() {
    clearTimeout(timer);
    const ms = now();
    const parts = tbilisiParts(ms);
    for (const ev of EVENTS) render(ev, ms, parts, !started);
    started = true;
    // შემდეგი განახლება ზუსტად შემდეგი წამის დასაწყისში
    timer = setTimeout(tick, 1000 - (ms % 1000) + 15);
  }

  function restartAnimation(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // reflow — ანიმაციის თავიდან დასაწყებად
    el.classList.add(cls);
  }

  // ---------- კონფეტი ----------
  const Confetti = (function () {
    const canvas = document.getElementById('confetti');
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let pieces = [];
    let raf = 0;
    let last = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function add(x, y, vx, vy, colors) {
      pieces.push({
        x, y, vx, vy,
        w: 5 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - .5) * .2,
        phase: Math.random() * Math.PI * 2,
        color: colors[(Math.random() * colors.length) | 0],
        round: Math.random() < .35,
        age: 0,
      });
    }

    function start() {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    function frame(t) {
      const dt = Math.min(48, t - last) / 16.67;
      last = t;
      ctx.clearRect(0, 0, width, height);
      pieces = pieces.filter((p) => p.y < height + 30 && p.age < 420);
      for (const p of pieces) {
        p.age += dt;
        p.vy = Math.min(p.vy + .06 * dt, 2.1); // ნაზი ვარდნა
        p.vx *= Math.pow(.985, dt);
        p.phase += .07 * dt;
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.phase) * .7) * dt;
        p.y += p.vy * dt;

        ctx.save();
        ctx.globalAlpha = p.age > 360 ? Math.max(0, (420 - p.age) / 60) : 1;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.phase)); // ბრუნვის ეფექტი
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h * .75, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      raf = pieces.length ? requestAnimationFrame(frame) : 0;
      if (!raf) ctx.clearRect(0, 0, width, height);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    return {
      rain(colors, count = 110) {
        if (reducedMotion.matches) return;
        for (let i = 0; i < count; i++) {
          add(Math.random() * width, -10 - Math.random() * height * .6,
            (Math.random() - .5) * .8, .6 + Math.random() * 1.2, colors);
        }
        start();
      },
      burst(x, y, colors, count = 26) {
        if (reducedMotion.matches) return;
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * .9;
          const speed = 2.5 + Math.random() * 3.5;
          add(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, colors);
        }
        start();
      },
    };
  })();

  // ---------- ინტერაქცია ----------
  document.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const card = target.closest('.card');
    const palette = card ? PALETTES[card.id] : PALETTES.bd;

    const emoji = target.closest('.emoji');
    if (emoji) {
      restartAnimation(emoji, 'is-tapped');
      const r = emoji.getBoundingClientRect();
      Confetti.burst(r.left + r.width / 2, r.top + r.height / 2, palette, 30);
      return;
    }
    const deco = target.closest('.bauble, .balloon');
    if (deco) {
      restartAnimation(deco, 'is-tapped');
      const r = deco.getBoundingClientRect();
      Confetti.burst(r.left + r.width / 2, r.bottom, palette, 10);
      return;
    }
    const unit = target.closest('.unit');
    if (unit) restartAnimation(unit, 'is-tapped');
  }, { passive: true });

  document.addEventListener('animationend', (e) => {
    const el = e.target;
    if (el.classList.contains('is-tapped') && /^(ring|balloon-pop|emoji-wiggle|unit-pop)$/.test(e.animationName)) {
      el.classList.remove('is-tapped');
    }
  });

  // ---------- დაბადების დღის თარიღის არჩევა ----------
  (function () {
    const dialog = document.getElementById('bd-dialog');
    const form = dialog.querySelector('form');
    const daySelect = document.getElementById('bd-day');
    const monthSelect = document.getElementById('bd-month');
    const openButton = document.getElementById('bd-edit');

    // ძველი Safari-სთვის, სადაც <dialog> არ არის
    if (typeof dialog.showModal !== 'function') {
      dialog.showModal = () => { dialog.setAttribute('open', ''); };
      dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
    }

    MONTHS.forEach((name, i) => monthSelect.add(new Option(name, String(i + 1))));

    // დღეების სია არჩეული თვის მიხედვით (თებერვალში 29 — ნაკიანი წლისთვის)
    function fillDays(month, selectedDay) {
      const max = daysInMonth(2024, month);
      daySelect.length = 0;
      for (let d = 1; d <= max; d++) daySelect.add(new Option(String(d), String(d)));
      daySelect.value = String(Math.min(selectedDay, max));
    }

    monthSelect.addEventListener('change', () => {
      fillDays(Number(monthSelect.value), Number(daySelect.value));
    });

    openButton.addEventListener('click', () => {
      monthSelect.value = String(birthday.month);
      fillDays(birthday.month, birthday.day);
      dialog.showModal();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const choice = { month: Number(monthSelect.value), day: Number(daySelect.value) };
      if (isValidBirthday(choice)) {
        birthday = choice;
        saveBirthday(birthday);
        tick();
      }
      dialog.close();
    });

    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());

    // ფონზე დაჭერა = გაუქმება
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });

    dialog.addEventListener('close', () => openButton.focus({ preventScroll: true }));
  })();

  // ---------- 100dvh-ის სათადარიგო ვარიანტი ძველი Safari-სთვის ----------
  if (!(window.CSS && CSS.supports && CSS.supports('height', '100dvh'))) {
    const stage = document.querySelector('.stage');
    const fit = () => { stage.style.height = window.innerHeight + 'px'; };
    fit();
    window.addEventListener('resize', fit, { passive: true });
  }

  window.addEventListener('resize', () => EVENTS.forEach((ev) => fitMeta(ev.card)), { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => EVENTS.forEach((ev) => fitMeta(ev.card)));
  }

  // ჩანართზე დაბრუნებისას მაშინვე განახლება
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  window.addEventListener('pageshow', tick);

  tick();
})();
