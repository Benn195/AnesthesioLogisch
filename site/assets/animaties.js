// AnesthesioLogisch – interactieve animaties (Web Components).
// Gebruik in een notitie:
//   ```animatie
//   monitor
//   ```
// Beschikbaar: <al-monitor>, <al-hart>, <al-inductie>, <al-capnogram>, <al-o2curve>
(() => {
  'use strict';

  // =====================================================================
  // Hulpfuncties
  // =====================================================================
  const g = (x, mu, sd) => Math.exp(-0.5 * ((x - mu) / sd) ** 2);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const minderBeweging = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (v, d = 0) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });

  function cssVar(el, name) {
    return getComputedStyle(el).getPropertyValue(name).trim() || '#888';
  }

  /** Canvas dat meeschaalt met zijn container en scherp blijft op retina-schermen. */
  function maakCanvas(container, onResize) {
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const state = { canvas, ctx, w: 0, h: 0 };
    const resize = () => {
      const r = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(10, Math.round(r.width));
      const h = Math.max(10, Math.round(r.height));
      if (w === state.w && h === state.h) return;
      state.w = w;
      state.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      onResize?.(state);
    };
    new ResizeObserver(resize).observe(container);
    resize();
    return state;
  }

  /** Roept cb(true/false) aan wanneer het element in/uit beeld komt. */
  function bijZichtbaarheid(el, cb) {
    if (!('IntersectionObserver' in window)) return cb(true);
    new IntersectionObserver((entries) => cb(entries[entries.length - 1].isIntersecting), { threshold: 0.05 }).observe(el);
  }

  /** Eenvoudige animatielus met pauze/verder en zichtbaarheidsdetectie. */
  class Lus {
    constructor(el, tick) {
      this.tick = tick;
      this.speelt = !minderBeweging;
      this.inBeeld = false;
      this.raf = 0;
      this.vorige = 0;
      bijZichtbaarheid(el, (v) => {
        this.inBeeld = v;
        this.update();
      });
      document.addEventListener('visibilitychange', () => this.update());
    }
    update() {
      const moet = this.speelt && this.inBeeld && !document.hidden;
      if (moet && !this.raf) {
        this.vorige = performance.now();
        const stap = (nu) => {
          const dt = Math.min(0.1, (nu - this.vorige) / 1000);
          this.vorige = nu;
          this.tick(dt);
          this.raf = requestAnimationFrame(stap);
        };
        this.raf = requestAnimationFrame(stap);
      } else if (!moet && this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
    }
    zet(speelt) {
      this.speelt = speelt;
      this.update();
    }
  }

  // =====================================================================
  // Golfvormen
  // =====================================================================
  /** ECG-complex; s = seconden sinds begin van de slag, rr = RR-interval in s */
  function ecgSlag(s, rr) {
    if (s < -0.05 || s > 1.6) return 0;
    const qt = Math.sqrt(rr);
    return (
      0.11 * g(s, 0.06, 0.022) -
      0.07 * g(s, 0.15, 0.008) +
      1.0 * g(s, 0.17, 0.009) -
      0.24 * g(s, 0.19, 0.009) +
      0.26 * g(s, 0.17 + 0.24 * qt, 0.05 * qt)
    );
  }
  function plethSlag(s, rr) {
    if (s < 0) return 0;
    const op = 0.13;
    if (s < op) return Math.sin(((s / op) * Math.PI) / 2) ** 2;
    const d = s - op;
    return Math.exp(-d / (0.32 * rr)) + 0.07 * g(d, 0.2 * Math.sqrt(rr), 0.045);
  }
  function abpSlag(s, rr) {
    if (s < 0) return 0;
    const op = 0.09;
    if (s < op) return Math.sin(((s / op) * Math.PI) / 2) ** 1.4;
    const d = s - op;
    const tn = 0.2 * Math.sqrt(rr);
    return 0.45 * Math.exp(-d / 0.16) + 0.55 * Math.exp(-d / (0.9 * rr)) - 0.1 * g(d, tn, 0.014) + 0.06 * g(d, tn + 0.04, 0.03);
  }
  /**
   * Genormaliseerd capnogram (0..1) voor één ademcyclus.
   * s = seconden sinds begin uitademing, P = cyclusduur in s.
   */
  function capnoCyclus(s, P, patroon) {
    const Te = (P * 2) / 3; // I:E = 1:2
    const vorm = (x) => {
      if (patroon === 'obstructie') {
        if (x < 0.15) return 0;
        const k = 0.42 * Te;
        return (1 - Math.exp(-(x - 0.15) / k)) / (1 - Math.exp(-(Te - 0.15) / k));
      }
      if (x < 0.16) return 0; // fase I
      const fase2 = 0.9 * smooth(0.16, 0.42, x);
      const fase3 = x > 0.42 ? (0.1 * (x - 0.42)) / (Te - 0.42) : 0;
      let v = fase2 + fase3;
      if (patroon === 'curare') v -= 0.3 * g(x, 0.62 * Te, 0.06 * Te);
      return v;
    };
    if (s < Te) return vorm(s);
    const eind = vorm(Te);
    return eind * (1 - smooth(0, 0.16, s - Te)); // fase 0: inademing
  }

  // =====================================================================
  // 1. OK-monitor
  // =====================================================================
  const NORMAAL = { hr: 72, spo2: 99, sys: 122, dia: 72, et: 5.0, af: 12, temp: 36.6, perf: 1 };
  const SCENARIOS = {
    normaal: {
      naam: 'Normaal',
      wat: 'Stabiele patiënt onder algehele anesthesie. Sinusritme, saturatie 99%, goede arteriële curve en een normaal capnogram met een duidelijk plateau.',
      oorzaken: ['Dit is de uitgangssituatie: leer hoe “normaal” eruitziet, dan valt afwijkend direct op.'],
      acties: ['Volg de trend, niet alleen het getal.', 'Stel alarmgrenzen passend bij de patiënt in.'],
    },
    tachycardie: {
      naam: 'Tachycardie',
      doel: { hr: 128, sys: 146, dia: 88, et: 5.2 },
      wat: 'Sinustachycardie met hoge bloeddruk: het lichaam reageert op een prikkel.',
      oorzaken: ['Te oppervlakkige anesthesie of onvoldoende analgesie', 'Hypovolemie / bloedverlies (dan meestal mét lage bloeddruk)', 'Hypoxie of hypercapnie', 'Medicatie (bijv. efedrine, atropine)', 'Zeldzaam: maligne hyperthermie, thyreotoxicose'],
      acties: ['Beoordeel diepte van anesthesie en pijnstilling', 'Schat bloedverlies en volumestatus in', 'Controleer oxygenatie en ventilatie', 'Brede complexen of instabiel? Denk aan een ritmestoornis'],
    },
    bradycardie: {
      naam: 'Bradycardie',
      doel: { hr: 41, sys: 92, dia: 50 },
      wat: 'Trage hartfrequentie met een dalende bloeddruk.',
      oorzaken: ['Vagale reflex: tractie aan peritoneum, oculocardiale reflex, laryngoscopie', 'Medicatie: opioïden (remifentanil), bètablokkers, neostigmine', 'Hoge spinale/epidurale blokkade', 'Hypoxie (laat en onheilspellend teken!)'],
      acties: ['Vraag de operateur de stimulus te stoppen', 'Controleer oxygenatie', 'Overweeg atropine of efedrine volgens protocol'],
    },
    hypoxie: {
      naam: 'Hypoxie',
      tijdlijn: [
        [0, { spo2: 83 }],
        [10, { hr: 104, sys: 135, dia: 82 }],
      ],
      wat: 'De saturatie daalt geleidelijk. Luister naar de toon van de piep: die wordt lager naarmate de saturatie zakt (zet het geluid aan).',
      oorzaken: ['Tube: dislocatie, endobronchiale (rechts) intubatie, knik', 'Obstructie: secreet, bronchospasme', 'Atelectase, aspiratie, pneumothorax', 'Apparatuur: O₂-toevoer, lekkage, losgeschoten slang'],
      acties: ['FiO₂ naar 100%', 'Ga systematisch na: DOPES (Dislocatie, Obstructie, Pneumothorax, Equipment, Stacking)', 'Handmatig beademen met de ballon: hoe voelt de compliantie?', 'Ausculteer, zuig uit, roep hulp'],
    },
    hypotensie: {
      naam: 'Hypotensie',
      doel: { hr: 88, sys: 76, dia: 40, perf: 0.55, et: 4.6 },
      wat: 'Lage bloeddruk (MAP < 65 mmHg) met een kleinere plethysmografie-golf door vasoconstrictie en slechte perifere perfusie.',
      oorzaken: ['Inductiemiddelen (propofol) en vluchtige anesthetica: vasodilatatie en minder contractiliteit', 'Hypovolemie of bloeding', 'Neuraxiale blokkade (spinaal/epiduraal)', 'Anafylaxie', 'Hoge beademingsdrukken (minder veneuze terugstroom)'],
      acties: ['Verlaag zo mogelijk de dosis anesthetica', 'Vasopressor (bijv. fenylefrine of noradrenaline) volgens protocol', 'Vochtbolus bij hypovolemie', 'Denk aan anafylaxie bij huiduitslag en bronchospasme'],
    },
    bronchospasme: {
      naam: 'Bronchospasme',
      capno: 'obstructie',
      doel: { et: 6.3, spo2: 91, hr: 104 },
      wat: 'Het capnogram krijgt een “haaienvin”-vorm: de uitademing is vertraagd door vernauwde luchtwegen. Beademingsdrukken stijgen, de saturatie daalt.',
      oorzaken: ['Luchtwegmanipulatie bij te oppervlakkige anesthesie', 'Astma of COPD', 'Anafylaxie', 'Aspiratie'],
      acties: ['FiO₂ 100%, verdiep de anesthesie (bijv. sevofluraan, propofol)', 'Salbutamol via de tube; bij ernst: adrenaline', 'Sluit tube-obstructie en endobronchiale ligging uit', 'Langere uitademingstijd instellen'],
    },
    oesofageaal: {
      naam: 'Oesofageale intubatie',
      capno: 'oesofageaal',
      tijdlijn: [
        [14, { spo2: 84, hr: 110 }],
        [30, { spo2: 76, hr: 58, sys: 90, dia: 48 }],
      ],
      wat: 'Na het intuberen verschijnen enkele kleine CO₂-golfjes die snel uitdoven: de tube zit in de slokdarm. Enige tijd later volgt desaturatie.',
      oorzaken: ['Tube in de slokdarm in plaats van de trachea', '“No trace = wrong place”: geen blijvende capnografie is een verkeerde ligging, tot het tegendeel bewezen is'],
      acties: ['Bij twijfel: tube eruit', 'Oxygeneer met masker/ballon', 'Opnieuw intuberen, bij voorkeur met videolaryngoscoop', 'Capnografie is de gouden standaard voor tubeligging'],
    },
    mh: {
      naam: 'Maligne hyperthermie',
      tijdlijn: [
        [0, { et: 6.5, hr: 104 }],
        [12, { et: 8.0, hr: 124, temp: 38.0 }],
        [26, { et: 9.4, hr: 138, sys: 152, dia: 92, temp: 39.2, spo2: 94 }],
      ],
      wat: 'Onverklaarde, snel stijgende EtCO₂ ondanks gelijke beademing, gevolgd door tachycardie en (later) temperatuurstijging. Zeldzaam maar levensbedreigend.',
      oorzaken: ['Erfelijke afwijking van de ryanodinereceptor', 'Uitgelokt door vluchtige anesthetica en succinylcholine'],
      acties: ['Stop de triggers, roep hulp, MH-protocol', 'Hyperventileer met 100% O₂, hoge verse gasflow', 'Dantroleen 2,5 mg/kg i.v., herhalen op geleide van effect', 'Koelen, behandel hyperkaliëmie en aritmieën'],
    },
    vf: {
      naam: 'Ventrikelfibrilleren',
      ritme: 'vf',
      doel: { perf: 0, sys: 22, dia: 16, et: 0.8 },
      wat: 'Chaotisch ECG zonder QRS-complexen. Geen pulsaties in de arteriële lijn en plethysmografie; de EtCO₂ zakt weg doordat er geen circulatie is.',
      oorzaken: ['Myocardischemie', 'Elektrolytstoornissen (K⁺), hypoxie, hypothermie', 'Medicatie, elektrocutie', 'Denk aan de 4 H’s en 4 T’s'],
      acties: ['Hulp roepen, start borstcompressies', 'Defibrilleer zo snel mogelijk', 'Volg het ALS-algoritme', 'EtCO₂ tijdens reanimatie: maat voor kwaliteit van compressies; plotse stijging kan op ROSC wijzen'],
    },
  };
  const TAU = { hr: 2.5, spo2: 5, sys: 3, dia: 3, et: 4, af: 2, temp: 14, perf: 2 };

  class AlMonitor extends HTMLElement {
    connectedCallback() {
      if (this._klaar) return;
      this._klaar = true;
      const kanalen = [
        { key: 'ecg', naam: 'II', kleur: '#39e87a', klas: 'c-ecg', snelheid: 1 / 6 },
        { key: 'pleth', naam: 'Pleth', kleur: '#3fd2ff', klas: 'c-pleth', snelheid: 1 / 6 },
        { key: 'abp', naam: 'ABP', kleur: '#ff5468', klas: 'c-abp', snelheid: 1 / 6 },
        { key: 'co2', naam: 'CO₂', kleur: '#ffd23f', klas: 'c-co2', snelheid: 1 / 16 },
      ];
      const nums = {
        ecg: `<div class="lbl"><span>HF</span><span>/min</span></div><div class="val" data-v="hr">--</div>`,
        pleth: `<div class="lbl"><span>SpO₂</span><span>%</span></div><div class="val" data-v="spo2">--</div><div class="sub">PI <span data-v="pi">--</span></div>`,
        abp: `<div class="lbl"><span>ABP</span><span>mmHg</span></div><div class="val klein" data-v="abp">--/--</div><div class="sub">(<span data-v="map">--</span>)</div>`,
        co2: `<div class="lbl"><span>EtCO₂</span><span>kPa</span></div><div class="val" data-v="et">--</div><div class="sub">AF <span data-v="af">--</span>/min</div>`,
      };
      this.innerHTML = `
<div class="al-kaart">
  <div class="al-kop"><span class="al-label">Interactief</span><h4>OK-monitor</h4>
    <div class="al-knoppen">
      <button type="button" class="al-knop" data-act="speel"></button>
      <button type="button" class="al-knop" data-act="geluid" aria-pressed="false">🔇 Geluid</button>
    </div>
  </div>
  <div class="mon-scherm">
    <div class="mon-alarm" aria-live="polite"></div>
    ${kanalen
      .map(
        (k) => `<div class="mon-rij"><div class="mon-golf" data-k="${k.key}"><span class="mon-naam ${k.klas}">${k.naam}</span></div><div class="mon-num ${k.klas}" data-n="${k.key}">${nums[k.key]}</div></div>`,
      )
      .join('')}
    <div class="mon-onder"><span>Temp <b data-v="temp">--</b> °C</span><span>Sweep 25 mm/s</span><span data-v="scen"></span></div>
  </div>
  <div class="al-chips" role="group" aria-label="Kies een scenario">${Object.entries(SCENARIOS)
    .map(([k, s]) => `<button type="button" class="al-chip" data-scen="${k}" aria-pressed="false">${s.naam}</button>`)
    .join('')}</div>
  <div class="al-uitleg" aria-live="polite"></div>
  <p class="al-voetnoot">Gesimuleerde waarden ter illustratie. Volg altijd de lokale protocollen.</p>
</div>`;

      this.p = { ...NORMAAL };
      this.doel = { ...NORMAAL };
      this.t = 0;
      this.slagen = [];
      this.ademteugen = [];
      this.volgendeSlag = 0.3;
      this.volgendeAdem = 0.5;
      this.etGemeten = NORMAAL.et;
      this.etMaxHuidig = 0;
      this.geluid = false;

      this.kanalen = kanalen.map((k) => {
        const el = this.querySelector(`.mon-golf[data-k="${k.key}"]`);
        const kanaal = { ...k, x: 0, data: new Float32Array(0) };
        kanaal.cv = maakCanvas(el, (cv) => {
          kanaal.data = new Float32Array(cv.w).fill(NaN);
          kanaal.x = 0;
        });
        return kanaal;
      });
      this.velden = {};
      this.querySelectorAll('[data-v]').forEach((el) => (this.velden[el.dataset.v] = el));

      this.lus = new Lus(this, (dt) => this.stap(dt));
      const speelKnop = this.querySelector('[data-act="speel"]');
      const zetSpeelKnop = () => (speelKnop.textContent = this.lus.speelt ? '⏸ Pauze' : '▶ Start');
      zetSpeelKnop();
      speelKnop.addEventListener('click', () => {
        this.lus.zet(!this.lus.speelt);
        zetSpeelKnop();
      });
      const geluidKnop = this.querySelector('[data-act="geluid"]');
      geluidKnop.addEventListener('click', () => {
        this.geluid = !this.geluid;
        geluidKnop.setAttribute('aria-pressed', String(this.geluid));
        geluidKnop.textContent = this.geluid ? '🔊 Geluid' : '🔇 Geluid';
        if (this.geluid && !this.audio) {
          try {
            this.audio = new (window.AudioContext || window.webkitAudioContext)();
          } catch (e) {}
        }
        this.audio?.resume?.();
      });
      this.querySelectorAll('[data-scen]').forEach((b) => b.addEventListener('click', () => this.kiesScenario(b.dataset.scen)));
      this.kiesScenario(SCENARIOS[this.getAttribute('scenario')] ? this.getAttribute('scenario') : 'normaal');
      this.tekenStil();
    }

    kiesScenario(key) {
      const s = SCENARIOS[key];
      this.scenario = key;
      this.scenStart = this.t;
      this.tijdlijnIdx = 0;
      this.ritme = s.ritme || 'sinus';
      this.capnoPatroon = s.capno || 'normaal';
      this.ademSindsStart = 0;
      this.doel = { ...NORMAAL, ...(s.doel || {}) };
      this.querySelectorAll('[data-scen]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scen === key)));
      const lijst = (a) => `<ul>${a.map((x) => `<li>${x}</li>`).join('')}</ul>`;
      this.querySelector('.al-uitleg').innerHTML = `<h5>${s.naam}</h5><p>${s.wat}</p>
        <div class="al-kolommen"><div><strong>Mogelijke oorzaken</strong>${lijst(s.oorzaken)}</div><div><strong>Wat doe je?</strong>${lijst(s.acties)}</div></div>`;
      this.velden.scen.textContent = 'Scenario: ' + s.naam;
    }

    stap(dt) {
      const t0 = this.t;
      this.t += dt;
      const t = this.t;
      const s = SCENARIOS[this.scenario];
      // tijdlijn van het scenario
      while (s.tijdlijn && this.tijdlijnIdx < s.tijdlijn.length && t - this.scenStart >= s.tijdlijn[this.tijdlijnIdx][0]) {
        Object.assign(this.doel, s.tijdlijn[this.tijdlijnIdx][1]);
        this.tijdlijnIdx++;
      }
      // parameters schuiven richting doelwaarden
      for (const k in this.doel) this.p[k] += (this.doel[k] - this.p[k]) * (1 - Math.exp(-dt / (TAU[k] || 3)));

      // hartslagen en ademteugen plannen
      while (this.volgendeSlag <= t) {
        if (this.ritme === 'sinus') {
          this.slagen.push(this.volgendeSlag);
          if (this.slagen.length > 6) this.slagen.shift();
          if (this.geluid && this.audio && this.lus.inBeeld) this.piep();
        }
        this.volgendeSlag += (60 / this.p.hr) * (1 + (Math.random() - 0.5) * 0.03);
      }
      while (this.volgendeAdem <= t) {
        this.ademteugen.push(this.volgendeAdem);
        if (this.ademteugen.length > 4) this.ademteugen.shift();
        this.ademSindsStart++;
        this.etGemeten = this.etMaxHuidig;
        this.etMaxHuidig = 0;
        this.volgendeAdem += 60 / this.p.af;
      }

      for (const k of this.kanalen) {
        const { w } = k.cv;
        if (!w) continue;
        const px = w * k.snelheid; // pixels per seconde
        const xOud = k.x;
        const xNieuw = xOud + dt * px;
        for (let c = Math.floor(xOud) + 1; c <= Math.floor(xNieuw); c++) {
          const tc = t - (xNieuw - c) / px;
          const col = c % w;
          k.data[col] = this.monster(k.key, Math.max(t0, tc));
          for (let gap = 1; gap <= 12; gap++) k.data[(col + gap) % w] = NaN;
        }
        k.x = xNieuw % w;
        if (xNieuw >= w) k.x = xNieuw - w;
        this.tekenKanaal(k);
      }
      this.updateGetallen(dt);
    }

    laatsteSlagen(tc, vertraging, n = 2) {
      const r = [];
      for (let i = this.slagen.length - 1; i >= 0 && r.length < n; i--) {
        if (this.slagen[i] + vertraging <= tc) r.push(tc - this.slagen[i] - vertraging);
      }
      return r;
    }

    monster(kanaal, tc) {
      const p = this.p;
      const rr = 60 / p.hr;
      const ruis = (Math.random() - 0.5) * 0.012;
      if (kanaal === 'ecg') {
        let v;
        if (this.ritme === 'vf') {
          v = (0.45 * Math.sin(2 * Math.PI * 4.6 * tc + 0.9 * Math.sin(2 * Math.PI * 0.37 * tc)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.21 * tc)) + 0.15 * Math.sin(2 * Math.PI * 7.3 * tc + 1)) * 0.9;
        } else {
          v = 0;
          for (const s of this.laatsteSlagen(tc, 0, 3)) v += ecgSlag(s, rr);
        }
        return clamp(0.32 + (v + ruis) * 0.52, 0, 1);
      }
      if (kanaal === 'pleth') {
        let v = 0;
        for (const s of this.laatsteSlagen(tc, 0.24)) v = Math.max(v, plethSlag(s, rr));
        return 0.12 + 0.76 * v * clamp(p.perf, 0.04, 1) + ruis * 0.4;
      }
      if (kanaal === 'abp') {
        let druk;
        if (this.ritme === 'vf' || p.perf < 0.05) {
          druk = p.dia + 3 * Math.sin(2 * Math.PI * 4.6 * tc);
        } else {
          let v = 0;
          for (const s of this.laatsteSlagen(tc, 0.16)) v = Math.max(v, abpSlag(s, rr));
          const basis = abpSlag(rr, rr);
          druk = p.dia + ((p.sys - p.dia) * (v - basis)) / (1 - basis);
        }
        return clamp(0.06 + (druk / 180) * 0.88, 0, 1);
      }
      if (kanaal === 'co2') {
        const P = 60 / p.af;
        let idx = -1;
        for (let i = this.ademteugen.length - 1; i >= 0; i--) if (this.ademteugen[i] <= tc) { idx = i; break; }
        if (idx < 0) return 0.05;
        const s = tc - this.ademteugen[idx];
        let amp = p.et;
        let basis = 0;
        if (this.capnoPatroon === 'oesofageaal') {
          const n = this.ademSindsStart - (this.ademteugen.length - 1 - idx);
          amp = n <= 1 ? 1.6 : n > 5 ? 0 : 1.6 * 0.5 ** (n - 1);
        }
        const kpa = basis + amp * capnoCyclus(s, P, this.capnoPatroon === 'oesofageaal' ? 'normaal' : this.capnoPatroon);
        if (tc > this.t - 0.05) this.etMaxHuidig = Math.max(this.etMaxHuidig, kpa);
        return clamp(0.05 + (kpa / 10) * 0.9, 0, 1);
      }
      return 0;
    }

    tekenKanaal(k) {
      const { ctx, w, h } = k.cv;
      ctx.clearRect(0, 0, w, h);
      // hulplijnen
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const hulplijn = (yNorm, label) => {
        const y = h - yNorm * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        if (label) ctx.fillText(label, w - 26, y - 3);
      };
      if (k.key === 'abp') {
        hulplijn(0.06 + (120 / 180) * 0.88, '120');
        hulplijn(0.06 + (60 / 180) * 0.88, '60');
      } else if (k.key === 'co2') {
        hulplijn(0.05 + 0.5 * 0.9, '5');
      }
      ctx.setLineDash([]);
      // golf
      ctx.strokeStyle = k.kleur;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let pen = false;
      const marge = 6;
      for (let x = 0; x < w; x++) {
        const v = k.data[x];
        if (Number.isNaN(v)) {
          pen = false;
          continue;
        }
        const y = marge + (1 - v) * (h - 2 * marge);
        if (!pen) {
          ctx.moveTo(x, y);
          pen = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    tekenStil() {
      // Eerste beeld als de animatie (nog) niet speelt: vul het scherm alvast.
      const opslag = this.geluid;
      this.geluid = false;
      for (let i = 0; i < 200; i++) this.stap(0.05);
      this.geluid = opslag;
    }

    updateGetallen(dt) {
      this._getalTimer = (this._getalTimer || 0) + dt;
      if (this._getalTimer < 0.5) return;
      this._getalTimer = 0;
      const p = this.p;
      const vf = this.ritme === 'vf';
      const v = this.velden;
      v.hr.textContent = vf ? '---' : Math.round(p.hr);
      v.spo2.textContent = vf || p.perf < 0.1 ? '--' : Math.round(p.spo2);
      v.pi.textContent = vf ? '--' : fmt(clamp(p.perf * 3.2, 0.1, 9.9), 1);
      const map = Math.round((p.sys + 2 * p.dia) / 3);
      v.abp.textContent = `${Math.round(p.sys)}/${Math.round(p.dia)}`;
      v.map.textContent = map;
      v.et.textContent = fmt(this.etGemeten, 1);
      v.af.textContent = Math.round(p.af);
      v.temp.textContent = fmt(p.temp, 1);

      const alarmen = [];
      const zet = (kanaal, aan) => this.querySelector(`[data-n="${kanaal}"]`).classList.toggle('alarm', aan);
      if (vf) alarmen.push(['VENTRIKELFIBRILLEREN', 'rood']);
      else if (p.hr > 120) alarmen.push(['HF HOOG', 'geel']);
      else if (p.hr < 50) alarmen.push(['HF LAAG', 'geel']);
      zet('ecg', vf || p.hr > 120 || p.hr < 50);
      const satLaag = !vf && p.spo2 < 90;
      if (satLaag) alarmen.push(['SpO₂ LAAG', p.spo2 < 85 ? 'rood' : 'geel']);
      zet('pleth', satLaag || vf);
      const mapLaag = map < 65;
      if (mapLaag && !vf) alarmen.push(['MAP LAAG', 'rood']);
      zet('abp', mapLaag);
      const geenCo2 = this.etGemeten < 0.5;
      if (geenCo2) alarmen.push(['GEEN CO₂', 'rood']);
      else if (this.etGemeten < 3.5) alarmen.push(['EtCO₂ LAAG', 'geel']);
      else if (this.etGemeten > 6.5) alarmen.push(['EtCO₂ HOOG', 'geel']);
      zet('co2', geenCo2 || this.etGemeten < 3.5 || this.etGemeten > 6.5);
      if (p.temp > 38.3) alarmen.push(['TEMP HOOG', 'geel']);
      const html = alarmen.map(([t, k]) => `<span class="${k === 'geel' ? 'geel' : ''}">${t}</span>`).join('');
      const doos = this.querySelector('.mon-alarm');
      if (doos.innerHTML !== html) doos.innerHTML = html;
    }

    piep() {
      const a = this.audio;
      if (!a || a.state !== 'running') return;
      // Toonhoogte daalt ongeveer een halve toon per procent saturatie
      const f = 880 * 2 ** ((Math.round(this.p.spo2) - 100) / 12);
      const o = a.createOscillator();
      const gn = a.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, a.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.12, a.currentTime + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.12);
      o.connect(gn).connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.13);
    }
  }

  // =====================================================================
  // 2. Bloedstroom door het hart
  // =====================================================================
  const HART_ROUTE = [
    { id: 'vcava', deel: 'vcava', snel: 1.2, pts: [[140, 485], [55, 485], [55, 215], [112, 215]],
      titel: 'Vv. cavae (holle aders)',
      tekst: 'Zuurstofarm bloed uit het lichaam keert via de vena cava superior en inferior terug naar het hart. De saturatie is hier ca. 70–75%.',
      rel: 'Een CVC ligt met de tip in de v. cava superior en meet de CVD en ScvO₂. Overdrukbeademing remt de veneuze terugstroom → bloeddrukdaling.' },
    { id: 'ra', deel: 'ra', snel: 0.55, kamer: true, pts: [[112, 215], [185, 215], [200, 262]],
      titel: 'Rechter atrium',
      tekst: 'Het rechter atrium verzamelt het veneuze bloed. In de wand zit de sinusknoop: de natuurlijke pacemaker van het hart.',
      rel: 'De CVD weerspiegelt de druk in het rechter atrium (normaal ca. 2–8 mmHg). Lucht uit een infuuslijn komt hier als eerste terecht.' },
    { id: 'tric', deel: 'tric', snel: 0.7, pts: [[200, 262], [200, 302]],
      titel: 'Tricuspidalisklep',
      tekst: 'Drieslippige klep tussen rechter atrium en rechter ventrikel. Open in de diastole, sluit bij het begin van de systole (eerste harttoon).',
      rel: 'Tricuspidalisinsufficiëntie geeft grote v-golven in de CVD-curve.' },
    { id: 'rv', deel: 'rv', snel: 0.55, kamer: true, pts: [[200, 302], [200, 378], [255, 362], [275, 322]],
      titel: 'Rechter ventrikel',
      tekst: 'Pompt het bloed tegen een lage druk (systolisch ca. 25 mmHg) naar de longen. De wand is relatief dun.',
      rel: 'Het RV verdraagt een plotselinge stijging van de longvaatweerstand slecht: denk aan longembolie, hypoxie, hypercapnie of hoge PEEP.' },
    { id: 'pulmklep', deel: 'pulmklep', snel: 0.8, pts: [[275, 322], [275, 280]],
      titel: 'Pulmonalisklep',
      tekst: 'Halvemaanvormige klep: opent in de systole en voorkomt terugstroom in de diastole.',
      rel: '' },
    { id: 'ap', deel: 'ap', snel: 1.3, pts: [[275, 280], [275, 96]],
      titel: 'A. pulmonalis',
      tekst: 'De enige slagader met zuurstofarm bloed. Ze vertakt naar de linker en rechter long.',
      rel: 'Met een Swan-Ganz-katheter meet je hier de pulmonale druk en de wiggedruk.' },
    { id: 'long', deel: 'long', snel: 0.7, pts: [[275, 96], [275, 58], [420, 58], [420, 96]],
      titel: 'Longcapillairen: gasuitwisseling',
      tekst: 'CO₂ diffundeert naar de alveoli en wordt uitgeademd; O₂ bindt aan hemoglobine. In ca. 0,75 seconde is het bloed volledig verzadigd.',
      rel: 'Preoxygenatie vult de longen (FRC) met zuurstof. Bij shunt (bijv. atelectase) passeert bloed zonder oxygenatie: hypoxemie die slecht reageert op extra O₂.' },
    { id: 'vpulm', deel: 'vpulm', snel: 1.2, pts: [[420, 96], [420, 165]],
      titel: 'Vv. pulmonales',
      tekst: 'Vier longaders brengen het zuurstofrijke bloed naar het linker atrium.',
      rel: '' },
    { id: 'la', deel: 'la', snel: 0.55, kamer: true, pts: [[420, 165], [415, 218], [400, 262]],
      titel: 'Linker atrium',
      tekst: 'Ontvangt het geoxygeneerde bloed uit de longen en vult de linker ventrikel.',
      rel: 'Bij atriumfibrilleren valt de “atriumkick” weg: tot ca. 20% minder vulling – belangrijk bij een stijve of vernauwde linker ventrikel.' },
    { id: 'mitr', deel: 'mitr', snel: 0.7, pts: [[400, 262], [400, 302]],
      titel: 'Mitralisklep',
      tekst: 'Tweeslippige klep tussen linker atrium en linker ventrikel. Open in de diastole.',
      rel: 'Bij mitralisstenose is een lage hartfrequentie gunstig: meer tijd om de ventrikel te vullen.' },
    { id: 'lv', deel: 'lv', snel: 0.55, kamer: true, pts: [[400, 302], [400, 382], [345, 362], [325, 322]],
      titel: 'Linker ventrikel',
      tekst: 'Dikke, krachtige spier die het bloed met hoge druk (systolisch ca. 120 mmHg) het lichaam in pompt.',
      rel: 'Propofol en vluchtige anesthetica verlagen contractiliteit en vaatweerstand: verwacht een bloeddrukdaling na inductie.' },
    { id: 'aoklep', deel: 'aoklep', snel: 0.8, pts: [[325, 322], [325, 280]],
      titel: 'Aortaklep',
      tekst: 'Opent in de systole zodra de druk in de linker ventrikel hoger is dan in de aorta.',
      rel: 'Bij ernstige aortastenose is de uitstroom vast beperkt: vermijd hypotensie en tachycardie.' },
    { id: 'aorta', deel: 'aorta', snel: 1.4, pts: [[325, 280], [325, 125], [555, 125], [555, 485], [460, 485]],
      titel: 'Aorta',
      tekst: 'De grote lichaamsslagader verdeelt het bloed over alle organen. Een arteriële lijn (meestal a. radialis) toont de druk van slag tot slag.',
      rel: 'MAP ≈ diastolisch + ⅓ × (systolisch − diastolisch). Meestal streef je naar een MAP ≥ 65 mmHg voor voldoende orgaanperfusie.' },
    { id: 'lichaam', deel: 'lichaam', snel: 0.7, pts: [[460, 485], [300, 485], [140, 485]],
      titel: 'Weefsels: zuurstofafgifte',
      tekst: 'In de capillairen geeft het bloed O₂ af aan de weefsels en neemt het CO₂ op. Het bloed wordt weer zuurstofarm en de cyclus begint opnieuw.',
      rel: 'O₂-aanbod (DO₂) = hartminuutvolume × arterieel O₂-gehalte. Anesthesie verlaagt het O₂-verbruik van het lichaam.' },
  ];

  class AlHart extends HTMLElement {
    connectedCallback() {
      if (this._klaar) return;
      this._klaar = true;
      this.innerHTML = `
<div class="al-kaart">
  <div class="al-kop"><span class="al-label">Interactief</span><h4>Bloedstroom door het hart</h4>
    <div class="al-knoppen">
      <button type="button" class="al-knop" data-act="speel"></button>
      <button type="button" class="al-knop" data-act="trager" aria-label="Langzamer">🐢</button>
      <button type="button" class="al-knop" data-act="sneller" aria-label="Sneller">🐇</button>
    </div>
  </div>
  <div class="hart-wrap">
    <svg class="hart-svg" viewBox="0 0 610 530" role="img" aria-label="Schematische weergave van de bloedsomloop door het hart">
      <defs>
        <marker id="pijl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker>
      </defs>
      <!-- longen en lichaam -->
      <rect class="kamer" data-deel="long" x="140" y="18" width="330" height="78" rx="22" fill="color-mix(in srgb, #7aa7ff 18%, var(--bg-2))" stroke="#7aa7ff" stroke-width="2"/>
      <path d="M180 58 q12 -20 24 0 t24 0 t24 0 M390 58 q12 -20 24 0 t24 0" fill="none" stroke="#7aa7ff" stroke-opacity=".5" stroke-width="2"/>
      <text x="305" y="44" text-anchor="middle">Longen</text>
      <text x="305" y="84" text-anchor="middle" class="klein">O₂ erin · CO₂ eruit</text>
      <rect class="kamer" data-deel="lichaam" x="140" y="455" width="330" height="60" rx="22" fill="color-mix(in srgb, #f0a35e 16%, var(--bg-2))" stroke="#f0a35e" stroke-width="2"/>
      <text x="305" y="481" text-anchor="middle">Lichaam</text>
      <text x="305" y="500" text-anchor="middle" class="klein">organen en weefsels</text>
      <!-- vaten -->
      <path class="kamer" data-deel="vcava" d="M140 485 H55 V215 H112" fill="none" stroke="#5876d6" stroke-opacity=".55" stroke-width="20" stroke-linejoin="round"/>
      <path class="kamer" data-deel="ap" d="M275 300 V96" fill="none" stroke="#5876d6" stroke-opacity=".55" stroke-width="20"/>
      <path class="kamer" data-deel="vpulm" d="M420 96 V170" fill="none" stroke="#d64550" stroke-opacity=".55" stroke-width="20"/>
      <path class="kamer" data-deel="aorta" d="M325 300 V125 H555 V485 H470" fill="none" stroke="#d64550" stroke-opacity=".6" stroke-width="22" stroke-linejoin="round"/>
      <!-- hartkamers -->
      <g class="hart-atria">
        <rect class="kamer" data-deel="ra" x="110" y="165" width="152" height="100" rx="40" fill="color-mix(in srgb, #5876d6 22%, var(--bg-2))" stroke="#5876d6" stroke-width="2"/>
        <rect class="kamer" data-deel="la" x="340" y="165" width="152" height="100" rx="40" fill="color-mix(in srgb, #d64550 20%, var(--bg-2))" stroke="#d64550" stroke-width="2"/>
      </g>
      <g class="hart-ventrikels">
        <rect class="kamer" data-deel="rv" x="110" y="292" width="180" height="132" rx="50" fill="color-mix(in srgb, #5876d6 22%, var(--bg-2))" stroke="#5876d6" stroke-width="2"/>
        <rect class="kamer" data-deel="lv" x="312" y="292" width="180" height="132" rx="50" fill="color-mix(in srgb, #d64550 20%, var(--bg-2))" stroke="#d64550" stroke-width="2"/>
      </g>
      <rect x="290" y="300" width="22" height="120" rx="6" fill="color-mix(in srgb, var(--tekst-3) 30%, var(--bg-2))"/>
      <!-- kleppen -->
      <g data-deel="tric" class="klep" data-type="av"><line x1="162" y1="280" x2="200" y2="280"/><line x1="238" y1="280" x2="200" y2="280"/></g>
      <g data-deel="mitr" class="klep" data-type="av"><line x1="362" y1="280" x2="400" y2="280"/><line x1="438" y1="280" x2="400" y2="280"/></g>
      <g data-deel="pulmklep" class="klep" data-type="sl"><line x1="264" y1="292" x2="275" y2="292"/><line x1="286" y1="292" x2="275" y2="292"/></g>
      <g data-deel="aoklep" class="klep" data-type="sl"><line x1="313" y1="292" x2="325" y2="292"/><line x1="337" y1="292" x2="325" y2="292"/></g>
      <!-- labels -->
      <text x="160" y="200" text-anchor="middle">RA</text>
      <text x="446" y="200" text-anchor="middle">LA</text>
      <text x="150" y="405" text-anchor="middle">RV</text>
      <text x="455" y="405" text-anchor="middle">LV</text>
      <text x="40" y="350" text-anchor="middle" class="klein" transform="rotate(-90 40 350)">vv. cavae</text>
      <text x="582" y="300" text-anchor="middle" class="klein" transform="rotate(90 582 300)">aorta</text>
      <text x="262" y="140" text-anchor="end" class="klein">a. pulm.</text>
      <text x="434" y="140" class="klein">vv. pulm.</text>
      <g class="deeltjes"></g>
    </svg>
    <div class="hart-info" aria-live="polite">
      <span class="hart-fase"><i></i><span data-fase>Diastole</span></span>
      <span class="hart-stap"></span>
      <h5></h5>
      <p class="hart-tekst"></p>
      <p class="hart-relevant"></p>
      <div class="al-knoppen">
        <button type="button" class="al-knop" data-act="vorige">◀ Vorige</button>
        <button type="button" class="al-knop" data-act="volgende">Volgende ▶</button>
      </div>
      <div class="hart-legenda"><span><i style="background:#4b6fe0"></i>zuurstofarm</span><span><i style="background:#e0333f"></i>zuurstofrijk</span><span><i style="background:#fff;border:2px solid var(--tekst)"></i>gevolgde cel</span></div>
    </div>
  </div>
  <p class="al-voetnoot">Schematische weergave (geen exacte anatomie): rechts in het lichaam is links in de tekening, zoals bij een vooraanzicht.</p>
</div>`;
      this.svg = this.querySelector('svg');
      // stijl kleppen
      this.querySelectorAll('.klep line').forEach((l) => {
        l.dataset.len = Math.abs(+l.getAttribute('x2') - +l.getAttribute('x1'));
        l.setAttribute('stroke', 'var(--tekst)');
        l.setAttribute('stroke-width', '5');
        l.setAttribute('stroke-linecap', 'round');
      });
      // route opbouwen
      this.segs = [];
      let L = 0;
      HART_ROUTE.forEach((r, i) => {
        const start = L;
        for (let k = 0; k < r.pts.length - 1; k++) {
          const [x1, y1] = r.pts[k];
          const [x2, y2] = r.pts[k + 1];
          const len = Math.hypot(x2 - x1, y2 - y1);
          this.segs.push({ x1, y1, x2, y2, len, s0: L, route: i });
          L += len;
        }
        r.s0 = start;
        r.s1 = L;
      });
      this.L = L;
      // deeltjes
      const groep = this.querySelector('.deeltjes');
      const NS = 'http://www.w3.org/2000/svg';
      this.deeltjes = [];
      const N = 80;
      for (let i = 0; i < N; i++) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', '4.2');
        groep.appendChild(c);
        this.deeltjes.push({ s: (i / N) * L, off: (Math.random() - 0.5) * 2, el: c });
      }
      this.cel = document.createElementNS(NS, 'circle');
      this.cel.setAttribute('r', '8');
      this.cel.setAttribute('stroke', '#fff');
      this.cel.setAttribute('stroke-width', '3');
      groep.appendChild(this.cel);
      this.celS = HART_ROUTE[0].s0;
      this.fase = 0;
      this.tempo = 1;
      this.huidigeRoute = -1;

      this.lus = new Lus(this, (dt) => this.stap(dt));
      const speelKnop = this.querySelector('[data-act="speel"]');
      const zetSpeelKnop = () => (speelKnop.textContent = this.lus.speelt ? '⏸ Pauze' : '▶ Start');
      zetSpeelKnop();
      speelKnop.addEventListener('click', () => {
        this.lus.zet(!this.lus.speelt);
        zetSpeelKnop();
      });
      this.querySelector('[data-act="trager"]').addEventListener('click', () => (this.tempo = Math.max(0.25, this.tempo / 1.5)));
      this.querySelector('[data-act="sneller"]').addEventListener('click', () => (this.tempo = Math.min(3, this.tempo * 1.5)));
      const spring = (d) => {
        const i = (this.routeVan(this.celS) + d + HART_ROUTE.length) % HART_ROUTE.length;
        this.celS = HART_ROUTE[i].s0 + 0.5;
        this.stap(0);
      };
      this.querySelector('[data-act="vorige"]').addEventListener('click', () => spring(-1));
      this.querySelector('[data-act="volgende"]').addEventListener('click', () => spring(1));
      this.stap(0);
    }

    routeVan(s) {
      for (let i = 0; i < HART_ROUTE.length; i++) if (s < HART_ROUTE[i].s1) return i;
      return HART_ROUTE.length - 1;
    }

    positie(s, off) {
      s = ((s % this.L) + this.L) % this.L;
      let lo = 0;
      let hi = this.segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (this.segs[mid].s0 <= s) lo = mid;
        else hi = mid - 1;
      }
      const sg = this.segs[lo];
      const t = (s - sg.s0) / sg.len;
      const dx = (sg.x2 - sg.x1) / sg.len;
      const dy = (sg.y2 - sg.y1) / sg.len;
      const r = HART_ROUTE[sg.route];
      const breedte = r.kamer ? 16 : 6;
      return { x: sg.x1 + dx * t * sg.len - dy * off * breedte, y: sg.y1 + dy * t * sg.len + dx * off * breedte, route: sg.route, frac: (s - r.s0) / (r.s1 - r.s0) };
    }

    zuurstof(route, frac) {
      const id = HART_ROUTE[route].id;
      if (id === 'long') return frac;
      if (id === 'lichaam') return 1 - frac;
      const i = HART_ROUTE.findIndex((r) => r.id === 'long');
      const j = HART_ROUTE.findIndex((r) => r.id === 'lichaam');
      return route > i && route < j ? 1 : 0;
    }

    stap(dt) {
      const periode = 1.25; // seconden per hartslag bij tempo 1 (48/min, rustig te volgen)
      this.fase = (this.fase + (dt * this.tempo) / periode) % 1;
      const f = this.fase;
      const vSys = f > 0.14 && f < 0.5 ? Math.sin(((f - 0.14) / 0.36) * Math.PI) : 0;
      const aSys = f < 0.13 ? Math.sin((f / 0.13) * Math.PI) : 0;
      // kamers laten samentrekken
      const schaal = (sel, k, cx, cy) => this.querySelector(sel).setAttribute('transform', `translate(${cx} ${cy}) scale(${1 - k}) translate(${-cx} ${-cy})`);
      schaal('.hart-ventrikels', 0.06 * vSys, 301, 360);
      schaal('.hart-atria', 0.05 * aSys, 301, 215);
      // kleppen
      const avOpen = 1 - smooth(0.12, 0.17, f) + smooth(0.48, 0.53, f);
      const slOpen = smooth(0.16, 0.2, f) * (1 - smooth(0.46, 0.5, f));
      this.querySelectorAll('.klep').forEach((k) => {
        const open = k.dataset.type === 'av' ? avOpen : slOpen;
        const [l1, l2] = k.querySelectorAll('line');
        const hoek = (open * Math.PI) / 2.3;
        const richting = k.dataset.type === 'av' ? 1 : -1; // av-kleppen openen naar beneden, semilunaire naar boven
        for (const [l, kant] of [[l1, 1], [l2, -1]]) {
          const x1 = +l.getAttribute('x1');
          const y1 = +l.getAttribute('y1');
          const len = +l.dataset.len;
          l.setAttribute('x2', x1 + kant * len * Math.cos(hoek));
          l.setAttribute('y2', y1 + richting * len * Math.sin(hoek));
        }
      });
      this.querySelector('[data-fase]').textContent = vSys > 0 ? 'Ventrikelsystole' : aSys > 0 ? 'Atriumcontractie' : 'Diastole (vulling)';
      this.querySelector('.hart-fase i').style.background = vSys > 0 ? 'var(--rood)' : 'var(--blauw)';

      const pomp = 0.45 + 1.1 * vSys + 0.3 * aSys;
      const basis = 70 * this.tempo;
      const beweeg = (s) => {
        const r = HART_ROUTE[this.routeVan(((s % this.L) + this.L) % this.L)];
        return s + dt * basis * r.snel * pomp;
      };
      for (const d of this.deeltjes) {
        d.s = beweeg(d.s) % this.L;
        const p = this.positie(d.s, d.off);
        const o2 = this.zuurstof(p.route, p.frac);
        d.el.setAttribute('cx', p.x.toFixed(1));
        d.el.setAttribute('cy', p.y.toFixed(1));
        d.el.setAttribute('fill', mengKleur(o2));
      }
      this.celS = beweeg(this.celS) % this.L;
      const pc = this.positie(this.celS, 0);
      this.cel.setAttribute('cx', pc.x.toFixed(1));
      this.cel.setAttribute('cy', pc.y.toFixed(1));
      this.cel.setAttribute('fill', mengKleur(this.zuurstof(pc.route, pc.frac)));
      if (pc.route !== this.huidigeRoute) {
        this.huidigeRoute = pc.route;
        const r = HART_ROUTE[pc.route];
        this.querySelector('.hart-stap').textContent = `Stap ${pc.route + 1} van ${HART_ROUTE.length}`;
        this.querySelector('.hart-info h5').textContent = r.titel;
        this.querySelector('.hart-tekst').textContent = r.tekst;
        const rel = this.querySelector('.hart-relevant');
        rel.hidden = !r.rel;
        rel.innerHTML = r.rel ? `<b>Anesthesie:</b> ${r.rel}` : '';
        this.querySelectorAll('[data-deel]').forEach((el) => el.classList.toggle('is-actief', el.dataset.deel === r.deel));
      }
    }
  }
  function mengKleur(t) {
    const a = [75, 111, 224];
    const b = [224, 51, 63];
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
  }

  // =====================================================================
  // 3. Inductie van anesthesie
  // =====================================================================
  const IND_SLEUTELS = {
    bis: [[0, 96], [3.5, 95], [5.0, 88], [5.6, 84], [6.1, 52], [6.6, 40], [8.2, 41], [8.4, 50], [9.0, 45], [10, 44], [12, 44]],
    map: [[0, 96], [3.5, 94], [5.5, 90], [6.0, 84], [7.4, 67], [8.2, 66], [8.45, 90], [9.2, 78], [10, 75], [12, 76]],
    hr: [[0, 82], [3.5, 80], [5.5, 72], [6.6, 70], [8.2, 66], [8.45, 94], [9.2, 74], [10, 66], [12, 64]],
    spo2: [[0, 96], [1.5, 99], [3.0, 100], [12, 100]],
    eto2: [[0, 17], [0.6, 22], [2.0, 76], [3.4, 90], [8.3, 91], [9.5, 55], [12, 50]],
    tof: [[0, 4], [6.6, 4], [7.1, 3.6], [7.5, 2], [7.9, 0.4], [8.1, 0], [12, 0]],
  };
  const IND_MIDDELEN = [
    { t: 3.5, naam: 'Sufentanil' },
    { t: 5.5, naam: 'Propofol' },
    { t: 6.6, naam: 'Rocuronium' },
  ];
  const IND_STAPPEN = [
    { t: 0, kort: 'Voorbereiding', titel: 'Voorbereiding en sign-in',
      tekst: 'Patiënt gecontroleerd (identiteit, nuchter, allergieën, ingreep). Monitoring aangesloten: ECG, saturatie en bloeddruk. Infuus loopt goed. Apparatuur gecheckt: zuigunit, laryngoscoop, tubes, ballon en masker. Medicatie is opgetrokken en gelabeld.' },
    { t: 3.4, kort: 'Preoxygenatie', titel: 'Preoxygenatie',
      tekst: 'Kapje strak op het gezicht, 100% O₂ gedurende ca. 3 minuten (of 8 diepe teugen). De eind-expiratoire O₂ (EtO₂) stijgt naar ≥ 90%: de longen (FRC) zijn nu een zuurstofreservoir voor de apneu die gaat komen.' },
    { t: 5.4, kort: 'Opioïd', middel: 'Sufentanil (bijv. 0,1–0,3 µg/kg)', titel: 'Opioïd',
      tekst: 'Het opioïd dempt de pijnprikkel en de sympathische reactie op de laryngoscopie. Laat het enkele minuten inwerken. De patiënt wordt suf en ademt mogelijk trager.' },
    { t: 6.2, kort: 'Hypnoticum', middel: 'Propofol (bijv. 1,5–2,5 mg/kg)', titel: 'Hypnoticum: in slaap',
      tekst: 'Binnen ca. 30–60 seconden (één “arm-hersencirculatietijd”) verliest de patiënt het bewustzijn: de ooglidreflex verdwijnt. Let op: de bloeddruk daalt door vasodilatatie en de ademhaling stopt (apneu).' },
    { t: 6.6, kort: 'Maskerbeademing', titel: 'Maskerbeademing controleren',
      tekst: 'Lukt beademen met masker en ballon? Kijk naar thoraxexcursies en capnografie. Hulpmiddelen: kinlift, jaw thrust, Guedel-tube, twee-handentechniek.' },
    { t: 8.1, kort: 'Spierverslapper', middel: 'Rocuronium (bijv. 0,6 mg/kg)', titel: 'Spierverslapping',
      tekst: 'De train-of-four (TOF) daalt van 4 naar 0 reacties in ca. 1–2 minuten. Blijf intussen beademen. Pas bij volledige relaxatie zijn de intubatiecondities optimaal.' },
    { t: 8.45, kort: 'Intubatie', titel: 'Laryngoscopie en intubatie',
      tekst: 'De tube wordt tussen de stembanden door in de trachea geplaatst en de cuff wordt opgeblazen. De laryngoscopie is een sterke prikkel: hartfrequentie en bloeddruk stijgen even.' },
    { t: 9.2, kort: 'Tubecontrole', titel: 'Tubepositie bevestigen',
      tekst: 'Capnografie: blijvende, regelmatige CO₂-curves bewijzen een ligging in de luchtweg (“no trace = wrong place”). Ausculteer beiderzijds en kijk naar symmetrische thoraxexcursies. Noteer de tubediepte en fixeer de tube.' },
    { t: 12, kort: 'Onderhoud', titel: 'Onderhoud van anesthesie',
      tekst: 'De patiënt ligt aan de beademingsmachine. De anesthesie wordt onderhouden met een vluchtig middel (sevofluraan) of met propofol (TIVA). Doel: een BIS van 40–60, stabiele hemodynamiek en een FiO₂ terug naar ca. 40–50%.' },
  ];
  function interp(punten, t) {
    if (t <= punten[0][0]) return punten[0][1];
    for (let i = 1; i < punten.length; i++) {
      if (t <= punten[i][0]) {
        const [t0, v0] = punten[i - 1];
        const [t1, v1] = punten[i];
        return lerp(v0, v1, smooth(0, 1, (t - t0) / (t1 - t0)));
      }
    }
    return punten[punten.length - 1][1];
  }

  class AlInductie extends HTMLElement {
    connectedCallback() {
      if (this._klaar) return;
      this._klaar = true;
      this.innerHTML = `
<div class="al-kaart">
  <div class="al-kop"><span class="al-label">Interactief</span><h4>Inductie van algehele anesthesie</h4>
    <div class="al-knoppen"><button type="button" class="al-knop" data-act="auto">▶ Afspelen</button><button type="button" class="al-knop" data-act="reset">↺ Opnieuw</button></div>
  </div>
  <div class="ind-grid">
    <ol class="ind-stappen">${IND_STAPPEN.map((s, i) => `<li><button type="button" data-stap="${i}">${s.kort}</button></li>`).join('')}</ol>
    <div class="ind-rechts">
      <div class="ind-boven">
        <svg class="ind-patient" viewBox="0 0 200 200" aria-hidden="true">
          <rect x="10" y="150" width="180" height="50" rx="18" fill="var(--bg-3)"/>
          <g class="borst"><rect x="40" y="140" width="120" height="70" rx="34" fill="#7fb3d5"/></g>
          <ellipse cx="100" cy="132" rx="64" ry="12" fill="var(--rand)"/>
          <circle cx="100" cy="82" r="50" fill="#f2c4a2"/>
          <path d="M52 70 q8 -46 48 -44 q42 -2 48 44 q-10 -22 -48 -24 q-38 2 -48 24z" fill="#5b3a29"/>
          <g class="ogen-open"><ellipse cx="81" cy="80" rx="6" ry="7" fill="#fff"/><ellipse cx="119" cy="80" rx="6" ry="7" fill="#fff"/><circle cx="81" cy="81" r="3.4" fill="#2a2a2a"/><circle cx="119" cy="81" r="3.4" fill="#2a2a2a"/></g>
          <g class="ogen-dicht" stroke="#2a2a2a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0"><path d="M74 82 q7 5 14 0"/><path d="M112 82 q7 5 14 0"/></g>
          <path d="M92 108 q8 5 16 0" stroke="#a0574a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          <g class="masker" opacity="0">
            <path d="M100 84 l26 30 q-26 16 -52 0z" fill="rgba(200,230,255,.75)" stroke="#5b8db8" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M100 118 q0 30 70 36" stroke="#5b8db8" stroke-width="7" fill="none" stroke-linecap="round"/>
          </g>
          <g class="tube" opacity="0">
            <path d="M100 110 q2 20 70 40" stroke="#9fd3c7" stroke-width="7" fill="none" stroke-linecap="round"/>
            <rect x="84" y="104" width="32" height="7" rx="3" fill="#f6f1e1" stroke="#c9bfa0"/>
          </g>
          <text class="zzz" x="152" y="40" font-size="18" font-weight="700" fill="var(--accent-2)" opacity="0">Zzz</text>
        </svg>
        <div class="ind-params">
          <div class="ind-param"><span>BIS</span><b data-p="bis">--</b></div>
          <div class="ind-param"><span>MAP</span><b data-p="map">--</b><small>mmHg</small></div>
          <div class="ind-param"><span>HF</span><b data-p="hr">--</b><small>/min</small></div>
          <div class="ind-param"><span>SpO₂</span><b data-p="spo2">--</b><small>%</small></div>
          <div class="ind-param"><span>EtO₂</span><b data-p="eto2">--</b><small>%</small></div>
          <div class="ind-param"><span>TOF</span><div class="ind-tof"><i></i><i></i><i></i><i></i></div></div>
          <div class="ind-param" style="grid-column: 1 / -1"><span>Ademhaling</span><b data-p="adem" style="font-size:17px">--</b></div>
        </div>
      </div>
      <div class="ind-legenda"><span><i style="background:#e0485a"></i>MAP</span><span><i style="background:#2ea86a"></i>Hartfrequentie</span><span><i style="background:#8b6ee6"></i>BIS</span><span><i style="background:#2aa7d6"></i>EtO₂</span></div>
      <div class="ind-trend"></div>
      <div class="ind-tekst" aria-live="polite"></div>
      <div class="ind-nav">
        <button type="button" class="al-knop" data-act="vorige">◀ Vorige</button>
        <button type="button" class="al-knop" data-act="volgende">Volgende ▶</button>
        <span class="ind-klok"></span>
      </div>
    </div>
  </div>
  <p class="al-voetnoot">Vereenvoudigde, gemiddelde verlopen ter illustratie. Doseringen zijn indicatief; volg altijd het lokale protocol.</p>
</div>`;
      this.tijd = 0;
      this.doelTijd = 0;
      this.stapIdx = 0;
      this.auto = false;
      this.wacht = 0;
      this.trend = maakCanvas(this.querySelector('.ind-trend'), () => this.tekenTrend());
      this.querySelectorAll('[data-stap]').forEach((b) => b.addEventListener('click', () => this.gaNaar(+b.dataset.stap, true)));
      this.querySelector('[data-act="vorige"]').addEventListener('click', () => this.gaNaar(this.stapIdx - 1, true));
      this.querySelector('[data-act="volgende"]').addEventListener('click', () => this.gaNaar(this.stapIdx + 1, true));
      this.querySelector('[data-act="reset"]').addEventListener('click', () => {
        this.tijd = 0;
        this.gaNaar(0, true);
      });
      const autoKnop = this.querySelector('[data-act="auto"]');
      autoKnop.addEventListener('click', () => {
        this.auto = !this.auto;
        autoKnop.textContent = this.auto ? '⏸ Pauze' : '▶ Afspelen';
        if (this.auto && this.stapIdx >= IND_STAPPEN.length - 1 && this.tijd >= this.doelTijd) {
          this.tijd = 0;
          this.gaNaar(0);
        }
        this.wacht = 0.8;
      });
      this.lus = new Lus(this, (dt) => this.stap(dt));
      this.lus.zet(true);
      document.addEventListener('al-thema', () => this.tekenTrend());
      this.gaNaar(0);
      this.render();
    }

    gaNaar(i, handmatig) {
      i = clamp(i, 0, IND_STAPPEN.length - 1);
      if (handmatig && this.auto) this.querySelector('[data-act="auto"]').click();
      this.stapIdx = i;
      this.doelTijd = IND_STAPPEN[i].t;
      if (this.doelTijd < this.tijd) this.tijd = i > 0 ? IND_STAPPEN[i - 1].t : 0;
      const s = IND_STAPPEN[i];
      this.querySelector('.ind-tekst').innerHTML = `${s.middel ? `<span class="ind-middel">💉 ${s.middel}</span>` : ''}<h5>${i + 1}. ${s.titel}</h5><p>${s.tekst}</p>`;
      this.querySelectorAll('[data-stap]').forEach((b, j) => {
        b.classList.toggle('actief', j === i);
        b.classList.toggle('klaar', j < i);
      });
      this.querySelector('[data-act="vorige"]').disabled = i === 0;
      this.querySelector('[data-act="volgende"]').disabled = i === IND_STAPPEN.length - 1;
    }

    stap(dt) {
      if (this.tijd < this.doelTijd) {
        this.tijd = Math.min(this.doelTijd, this.tijd + dt * (minderBeweging ? 10 : 0.9));
        this.render();
      } else if (this.auto) {
        this.wacht -= dt;
        if (this.wacht <= 0) {
          if (this.stapIdx < IND_STAPPEN.length - 1) {
            this.gaNaar(this.stapIdx + 1);
            this.wacht = 5;
          } else {
            this.querySelector('[data-act="auto"]').click();
          }
        }
      }
      // ademhaling animeren
      const t = this.tijd;
      const ademt = !(t > 6.0 && t < 6.3);
      const freq = t < 3.5 ? 0.25 : t < 6 ? 0.18 : 0.2;
      this.ademFase = ((this.ademFase || 0) + dt * freq) % 1;
      const k = ademt ? Math.sin(this.ademFase * Math.PI * 2) * 0.04 : 0;
      this.querySelector('.borst').setAttribute('transform', `translate(100 175) scale(1 ${1 + k}) translate(-100 -175)`);
    }

    waarden(t) {
      const w = {};
      for (const k in IND_SLEUTELS) w[k] = interp(IND_SLEUTELS[k], t);
      return w;
    }

    render() {
      const t = this.tijd;
      const w = this.waarden(t);
      const q = (s) => this.querySelector(s);
      q('[data-p="bis"]').textContent = Math.round(w.bis);
      q('[data-p="map"]').textContent = Math.round(w.map);
      q('[data-p="hr"]').textContent = Math.round(w.hr);
      q('[data-p="spo2"]').textContent = Math.round(w.spo2);
      q('[data-p="eto2"]').textContent = Math.round(w.eto2);
      const tof = Math.round(w.tof);
      this.querySelectorAll('.ind-tof i').forEach((el, i) => el.classList.toggle('aan', i < tof));
      const adem = t < 5.6 ? 'Spontaan' : t < 6.0 ? 'Spontaan, oppervlakkig' : t < 6.3 ? 'Apneu' : t < 8.3 ? 'Maskerbeademing' : t < 8.5 ? 'Intubatie…' : 'Beademingsmachine';
      q('[data-p="adem"]').textContent = adem;
      const slaapt = w.bis < 70;
      q('.ogen-open').setAttribute('opacity', slaapt ? 0 : 1);
      q('.ogen-dicht').setAttribute('opacity', slaapt ? 1 : 0);
      q('.zzz').setAttribute('opacity', slaapt ? 1 : 0);
      q('.masker').setAttribute('opacity', t > 0.5 && t < 8.3 ? 1 : 0);
      q('.tube').setAttribute('opacity', t >= 8.3 ? 1 : 0);
      const min = Math.floor(t);
      const sec = Math.floor((t - min) * 60);
      q('.ind-klok').textContent = `t = ${min}:${String(sec).padStart(2, '0')} min`;
      this.tekenTrend();
    }

    tekenTrend() {
      if (!this.trend) return;
      const { ctx, w, h } = this.trend;
      if (!w) return;
      const tekst = cssVar(this, '--tekst-3');
      const rand = cssVar(this, '--rand');
      ctx.clearRect(0, 0, w, h);
      const L = 30;
      const R = 8;
      const T = 8;
      const B = 22;
      const X = (t) => L + (t / 12) * (w - L - R);
      const Y = (v) => T + (1 - v / 150) * (h - T - B);
      ctx.font = '10.5px system-ui, sans-serif';
      ctx.fillStyle = tekst;
      ctx.strokeStyle = rand;
      ctx.lineWidth = 1;
      for (const v of [0, 50, 100, 150]) {
        ctx.beginPath();
        ctx.moveTo(L, Y(v));
        ctx.lineTo(w - R, Y(v));
        ctx.stroke();
        ctx.fillText(String(v), 4, Y(v) + 4);
      }
      for (let m = 0; m <= 12; m += 2) ctx.fillText(m + "'", X(m) - 4, h - 6);
      // middelen
      ctx.setLineDash([4, 4]);
      for (const m of IND_MIDDELEN) {
        if (m.t > this.tijd) continue;
        ctx.strokeStyle = '#c2417c';
        ctx.beginPath();
        ctx.moveTo(X(m.t), T);
        ctx.lineTo(X(m.t), h - B);
        ctx.stroke();
        ctx.fillStyle = '#c2417c';
        ctx.fillText(m.naam, X(m.t) + 3, T + 10 + IND_MIDDELEN.indexOf(m) * 12);
      }
      ctx.setLineDash([]);
      const lijn = (k, kleur) => {
        ctx.strokeStyle = kleur;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let t = 0; t <= this.tijd + 1e-6; t += 0.05) {
          const v = interp(IND_SLEUTELS[k], Math.min(t, this.tijd));
          t === 0 ? ctx.moveTo(X(t), Y(v)) : ctx.lineTo(X(t), Y(v));
        }
        ctx.stroke();
      };
      lijn('eto2', '#2aa7d6');
      lijn('bis', '#8b6ee6');
      lijn('hr', '#2ea86a');
      lijn('map', '#e0485a');
      ctx.strokeStyle = cssVar(this, '--tekst-2');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(this.tijd), T);
      ctx.lineTo(X(this.tijd), h - B);
      ctx.stroke();
    }
  }

  // =====================================================================
  // 4. Capnografie-patronen
  // =====================================================================
  const CAPNO = {
    normaal: { naam: 'Normaal', et: [5, 5, 5], af: 12,
      tekst: '<b>Fase I</b>: begin van de uitademing – lucht uit de dode ruimte, geen CO₂. <b>Fase II</b>: snelle stijging door menging van dode-ruimte- en alveolaire lucht. <b>Fase III</b>: alveolair plateau, licht oplopend; het eindpunt is de EtCO₂ (normaal ca. 4,5–5,5 kPa). <b>Fase 0</b>: inademing, de CO₂ daalt snel naar nul.' },
    obstructie: { naam: 'Obstructie (haaienvin)', et: [5.8, 5.9, 6], af: 12, patroon: 'obstructie',
      tekst: 'Trage stijging zonder duidelijk plateau: de uitademing is belemmerd. Denk aan bronchospasme, astma/COPD, een geknikte tube of secreet. Hoe schuiner de stijging, hoe ernstiger de obstructie.' },
    rebreathing: { naam: 'Rebreathing', et: [5.4, 5.6, 5.8], af: 12, basis: [0.6, 0.8, 1.0],
      tekst: 'De basislijn komt niet meer op nul: de patiënt ademt CO₂ opnieuw in. Oorzaken: uitgeputte CO₂-absorber (kalk), een defect ventiel in het beademingscircuit of een te lage verse gasflow.' },
    curare: { naam: 'Curare-cleft', et: [5, 5, 5], af: 12, patroon: 'curare',
      tekst: 'Een inkeping in het plateau: de patiënt probeert zelf in te ademen tijdens de uitademing. Een teken dat de spierverslapping uitwerkt (of dat de anesthesie te oppervlakkig wordt).' },
    oesofageaal: { naam: 'Oesofageale intubatie', et: [1.6, 0.7, 0.2], af: 12,
      tekst: 'Een paar kleine, snel afnemende golfjes (CO₂ uit de maag na maskerbeademing), daarna niets. De tube ligt in de slokdarm: <b>no trace = wrong place</b>.' },
    hyperventilatie: { naam: 'Hyperventilatie', et: [3.2, 3.1, 3.1], af: 20,
      tekst: 'Snelle ademfrequentie en/of groot teugvolume: het plateau is laag (EtCO₂ < 4,5 kPa). Gevolg: vasoconstrictie van de hersenvaten en een respiratoire alkalose.' },
    hypoventilatie: { naam: 'Hypoventilatie', et: [7, 7.1, 7.2], af: 8,
      tekst: 'Lage ademfrequentie of klein teugvolume: het plateau is hoog (EtCO₂ > 6 kPa). Bijv. door opioïden, restcurarisatie of te lage beademingsinstellingen. Ook een sterk verhoogde CO₂-productie (koorts, MH) geeft een hoge EtCO₂.' },
    lageoutput: { naam: 'Daling hartminuutvolume', et: [4.8, 3.4, 2.2], af: 12,
      tekst: 'Bij gelijke beademing daalt de EtCO₂ plotseling: er wordt minder CO₂ naar de longen gebracht. Denk aan bloeding, longembolie of een circulatiestilstand. Tijdens reanimatie is de EtCO₂ een maat voor de kwaliteit van de borstcompressies.' },
  };

  class AlCapnogram extends HTMLElement {
    connectedCallback() {
      if (this._klaar) return;
      this._klaar = true;
      this.innerHTML = `
<div class="al-kaart">
  <div class="al-kop"><span class="al-label">Interactief</span><h4>Capnografie: patronen herkennen</h4>
    <div class="al-knoppen"><button type="button" class="al-knop" data-act="speel">↺ Opnieuw tekenen</button></div>
  </div>
  <div class="al-chips" role="group" aria-label="Kies een patroon">${Object.entries(CAPNO)
    .map(([k, c]) => `<button type="button" class="al-chip" data-p="${k}" aria-pressed="false">${c.naam}</button>`)
    .join('')}</div>
  <div class="cap-canvas"></div>
  <div class="al-uitleg" aria-live="polite"></div>
</div>`;
      this.cv = maakCanvas(this.querySelector('.cap-canvas'), () => this.teken());
      this.voortgang = 1;
      this.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => this.kies(b.dataset.p)));
      this.querySelector('[data-act="speel"]').addEventListener('click', () => {
        this.voortgang = 0;
        this.lus.zet(true);
      });
      this.lus = new Lus(this, (dt) => {
        this.voortgang = Math.min(1, this.voortgang + dt / 3.5);
        this.teken();
        if (this.voortgang >= 1) this.lus.zet(false);
      });
      document.addEventListener('al-thema', () => this.teken());
      this.kies(CAPNO[this.getAttribute('patroon')] ? this.getAttribute('patroon') : 'normaal');
    }

    kies(k) {
      this.patroon = k;
      this.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === k)));
      this.querySelector('.al-uitleg').innerHTML = `<h5>${CAPNO[k].naam}</h5><p>${CAPNO[k].tekst}</p>`;
      this.voortgang = minderBeweging ? 1 : 0;
      this.lus.zet(!minderBeweging);
      this.teken();
    }

    teken() {
      if (!this.cv || !this.patroon) return;
      const { ctx, w, h } = this.cv;
      if (!w) return;
      const c = CAPNO[this.patroon];
      const L = 34;
      const R = 10;
      const T = 14;
      const B = 26;
      const P = 60 / c.af;
      const duur = P * 3 + 0.6;
      const X = (t) => L + (t / duur) * (w - L - R);
      const Y = (v) => T + (1 - v / 8) * (h - T - B);
      ctx.clearRect(0, 0, w, h);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = cssVar(this, '--tekst-3');
      ctx.strokeStyle = cssVar(this, '--rand');
      ctx.lineWidth = 1;
      for (const v of [0, 2, 4, 6, 8]) {
        ctx.beginPath();
        ctx.moveTo(L, Y(v));
        ctx.lineTo(w - R, Y(v));
        ctx.stroke();
        ctx.fillText(String(v), 10, Y(v) + 4);
      }
      ctx.fillText('kPa', L + 4, T + 10);
      ctx.fillText('tijd →', w - R - 40, h - 6);
      // normaalgebied
      ctx.fillStyle = 'rgba(44,154,90,0.10)';
      ctx.fillRect(L, Y(5.5), w - L - R, Y(4.5) - Y(5.5));

      const eind = this.voortgang * duur;
      ctx.strokeStyle = '#e8a710';
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let t = 0; t <= eind; t += duur / 600) {
        const tt = t - 0.6;
        let v = c.basis?.[0] || 0;
        if (tt >= 0) {
          const i = Math.min(2, Math.floor(tt / P));
          const basis = c.basis?.[i] || 0;
          v = basis + (c.et[i] - basis) * capnoCyclus(tt - i * P, P, c.patroon || 'normaal');
        }
        t === 0 ? ctx.moveTo(X(t), Y(v)) : ctx.lineTo(X(t), Y(v));
      }
      ctx.stroke();

      if (this.patroon === 'normaal' && this.voortgang >= 1) {
        // fasen benoemen bij de eerste ademteug
        const s0 = 0.6;
        const Te = (P * 2) / 3;
        ctx.fillStyle = cssVar(this, '--accent-2');
        ctx.font = 'bold 12px system-ui, sans-serif';
        const label = (t, v, txt) => ctx.fillText(txt, X(s0 + t) - 6, Y(v) - 8);
        label(0.04, 0, 'I');
        label(0.25, 2.8, 'II');
        label(Te / 2 + 0.2, 4.9, 'III');
        label(Te + 0.08, 2.6, '0');
        ctx.fillText('EtCO₂', X(s0 + Te) - 20, Y(5.1) - 22);
        ctx.beginPath();
        ctx.arc(X(s0 + Te), Y(5), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // =====================================================================
  // 5. Zuurstofdissociatiecurve
  // =====================================================================
  const P50_NORMAAL = 3.57; // kPa (26,8 mmHg)
  const HILL_N = 2.7;
  const sat = (po2, p50) => (po2 <= 0 ? 0 : 100 / (1 + (p50 / po2) ** HILL_N));

  class AlO2Curve extends HTMLElement {
    connectedCallback() {
      if (this._klaar) return;
      this._klaar = true;
      this.innerHTML = `
<div class="al-kaart">
  <div class="al-kop"><span class="al-label">Interactief</span><h4>Zuurstofdissociatiecurve</h4>
    <div class="al-knoppen"><button type="button" class="al-knop" data-act="reset">↺ Normaal</button></div>
  </div>
  <div class="o2-canvas"></div>
  <div class="o2-uitslag">
    <div>SaO₂ bij gekozen PaO₂<b data-u="sat">--</b></div>
    <div>P50<b data-u="p50">--</b></div>
    <div>Verschuiving<b data-u="shift">--</b></div>
  </div>
  <div class="o2-regelaars">
    <label class="al-slider">PaO₂ <input type="range" data-r="po2" min="1" max="14" step="0.1" value="8"><output data-o="po2"></output></label>
    <label class="al-slider">pH <input type="range" data-r="ph" min="7.0" max="7.7" step="0.01" value="7.40"><output data-o="ph"></output></label>
    <label class="al-slider">Temperatuur <input type="range" data-r="temp" min="32" max="42" step="0.1" value="37"><output data-o="temp"></output></label>
  </div>
  <div class="al-uitleg" aria-live="polite"></div>
</div>`;
      this.cv = maakCanvas(this.querySelector('.o2-canvas'), () => this.teken());
      this.r = {};
      this.querySelectorAll('[data-r]').forEach((el) => {
        this.r[el.dataset.r] = el;
        el.addEventListener('input', () => this.teken());
      });
      this.querySelector('[data-act="reset"]').addEventListener('click', () => {
        this.r.ph.value = 7.4;
        this.r.temp.value = 37;
        this.teken();
      });
      document.addEventListener('al-thema', () => this.teken());
      this.teken();
    }

    teken() {
      if (!this.cv || !this.r?.po2) return;
      const po2 = +this.r.po2.value;
      const ph = +this.r.ph.value;
      const temp = +this.r.temp.value;
      const p50 = P50_NORMAAL * 10 ** (0.48 * (7.4 - ph) + 0.024 * (temp - 37));
      const s = sat(po2, p50);
      const q = (x) => this.querySelector(x);
      q('[data-o="po2"]').textContent = `${fmt(po2, 1)} kPa`;
      q('[data-o="ph"]').textContent = fmt(ph, 2);
      q('[data-o="temp"]').textContent = `${fmt(temp, 1)} °C`;
      q('[data-u="sat"]').textContent = `${fmt(s, 0)}%`;
      q('[data-u="p50"]').textContent = `${fmt(p50, 2)} kPa`;
      const d = p50 - P50_NORMAAL;
      q('[data-u="shift"]').textContent = Math.abs(d) < 0.05 ? 'geen' : d > 0 ? 'naar rechts →' : '← naar links';
      q('.al-uitleg').innerHTML =
        Math.abs(d) < 0.05
          ? `<p>Normale curve: P50 ≈ 3,6 kPa (27 mmHg). Let op de S-vorm: boven een PaO₂ van ca. 8 kPa is de curve vlak (saturatie > 90%), daaronder daalt de saturatie snel. <b>Bij een saturatie onder 90% zit je op het steile deel!</b></p>`
          : d > 0
            ? `<p><b>Rechtsverschuiving</b> (zuur, warm, CO₂↑, 2,3-DPG↑): hemoglobine bindt O₂ minder sterk en <b>geeft het makkelijker af aan de weefsels</b>, bijvoorbeeld in werkende spieren. Bij dezelfde PaO₂ is de saturatie lager.</p>`
            : `<p><b>Linksverschuiving</b> (alkalose, hypothermie, CO₂↓, 2,3-DPG↓, foetaal Hb, CO-vergiftiging): hemoglobine houdt O₂ steviger vast. De saturatie lijkt goed, maar de <b>afgifte aan de weefsels is minder</b>.</p>`;

      const { ctx, w, h } = this.cv;
      if (!w) return;
      const L = 40;
      const R = 12;
      const T = 12;
      const B = 30;
      const X = (p) => L + (p / 14) * (w - L - R);
      const Y = (v) => T + (1 - v / 100) * (h - T - B);
      ctx.clearRect(0, 0, w, h);
      ctx.font = '11px system-ui, sans-serif';
      ctx.strokeStyle = cssVar(this, '--rand');
      ctx.fillStyle = cssVar(this, '--tekst-3');
      ctx.lineWidth = 1;
      for (let v = 0; v <= 100; v += 25) {
        ctx.beginPath();
        ctx.moveTo(L, Y(v));
        ctx.lineTo(w - R, Y(v));
        ctx.stroke();
        ctx.fillText(v + '%', 4, Y(v) + 4);
      }
      for (let p = 0; p <= 14; p += 2) ctx.fillText(String(p), X(p) - 3, h - 14);
      ctx.fillText('PaO₂ (kPa)', w - R - 62, h - 2);
      // normaal (gestippeld)
      const curve = (p50c, kleur, breedte, dash) => {
        ctx.strokeStyle = kleur;
        ctx.lineWidth = breedte;
        ctx.setLineDash(dash);
        ctx.beginPath();
        for (let p = 0; p <= 14; p += 0.05) {
          const v = sat(p, p50c);
          p === 0 ? ctx.moveTo(X(p), Y(v)) : ctx.lineTo(X(p), Y(v));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      curve(P50_NORMAAL, cssVar(this, '--tekst-3'), 1.5, [5, 5]);
      // referentiepunten
      ctx.fillStyle = cssVar(this, '--tekst-3');
      for (const [p, lbl, dx] of [[5.3, 'veneus', 6], [13, 'arterieel', -58]]) {
        ctx.beginPath();
        ctx.arc(X(p), Y(sat(p, P50_NORMAAL)), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(lbl, X(p) + dx, Y(sat(p, P50_NORMAAL)) + 14);
      }
      curve(p50, d > 0.05 ? '#e0485a' : d < -0.05 ? '#2f80d1' : cssVar(this, '--accent'), 3, []);
      // P50
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = cssVar(this, '--tekst-3');
      ctx.beginPath();
      ctx.moveTo(L, Y(50));
      ctx.lineTo(X(p50), Y(50));
      ctx.lineTo(X(p50), Y(0));
      ctx.stroke();
      // gekozen punt
      ctx.strokeStyle = cssVar(this, '--accent-2');
      ctx.beginPath();
      ctx.moveTo(X(po2), Y(0));
      ctx.lineTo(X(po2), Y(s));
      ctx.lineTo(L, Y(s));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar(this, '--accent-2');
      ctx.beginPath();
      ctx.arc(X(po2), Y(s), 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const defs = { 'al-monitor': AlMonitor, 'al-hart': AlHart, 'al-inductie': AlInductie, 'al-capnogram': AlCapnogram, 'al-o2curve': AlO2Curve };
  for (const [naam, klasse] of Object.entries(defs)) if (!customElements.get(naam)) customElements.define(naam, klasse);
})();
