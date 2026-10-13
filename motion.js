/* ===========================================================================
   MOTION LAYER
   GSAP + ScrollTrigger + SplitText + DrawSVG, with Lenis for smooth scroll.

   Two things shape every decision in this file:

   1. The page is drawn by a React-based runtime (support.js) AFTER this script
      runs, and it re-renders on every click. So we wait for the markup to
      appear, and we only animate nodes whose inline `style` attribute is a
      fixed string. The runtime resets `cssText` whenever an element's style
      string changes, which would wipe GSAP's inline transforms. Nodes with a
      constant style string are written once and then left alone, so they are
      safe. That is what the `data-m` tags mark.

   2. Every "hidden" start state is set by GSAP, never by CSS. If this file
      fails to load or throws, nothing is left invisible.

   No GSAP pinning: pinning re-parents DOM nodes, which would fight the
   runtime's reconciler. The one pinned-feeling section ("A day here") uses
   CSS `position: sticky` and only has its inner track moved.
   =========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const preloader = document.querySelector('.preloader');

  /* Reduced motion: the <head> never added .has-motion, so there is nothing to
     play. motion.css hides the preloader for us in that case. */
  if (!root.classList.contains('has-motion')) return;

  const { gsap, ScrollTrigger, SplitText, DrawSVGPlugin, Lenis } = window;

  /* The vendor bundles and this file are all `defer`, so they run in order and
     gsap is here. If something went wrong fetching them, uncover the page. */
  if (!gsap || !ScrollTrigger) {
    console.warn('motion.js: GSAP not available, serving the page unanimated.');
    if (preloader) preloader.remove();
    root.classList.remove('has-motion');
    return;
  }

  gsap.registerPlugin(...[ScrollTrigger, SplitText, DrawSVGPlugin].filter(Boolean));
  gsap.defaults({ ease: 'power3.out' });

  /* ---------------------------------------------------------------------------
     Small helpers
     --------------------------------------------------------------------------- */
  const one = (sel, ctx) => (ctx || document).querySelector(sel);
  const all = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const dm = (name, ctx) => one(`[data-m="${name}"]`, ctx);
  const dmAll = (name, ctx) => all(`[data-m="${name}"]`, ctx);
  const kids = (el) => (el ? Array.from(el.children) : []);

  /* clip-path reveals have to keep the element's rounded corners, and both ends
     of the tween must have the same shape for GSAP to interpolate the numbers. */
  function inset(el, edges) {
    const r = getComputedStyle(el).borderTopLeftRadius;
    return `inset(${edges}${parseFloat(r) ? ` round ${r}` : ''})`;
  }

  /* Count a number up while keeping whatever sits around it ("₹28,000", "2 min").
     Finishes by restoring the exact original string, so the runtime never sees
     text it did not write. */
  function countUp(el, duration) {
    if (!el || el.dataset.counted) return null;
    const raw = (el.textContent || '').trim();
    const hit = raw.match(/\d[\d,]*/);
    if (!hit) return null;
    const target = parseFloat(hit[0].replace(/,/g, ''));
    if (!target) return null;

    el.dataset.counted = '1';
    const pre = raw.slice(0, hit.index);
    const post = raw.slice(hit.index + hit[0].length);
    const grouped = hit[0].includes(',');
    const box = { v: 0 };

    return gsap.to(box, {
      v: target,
      duration: duration || 1.5,
      ease: 'power2.out',
      onUpdate() {
        const n = Math.round(box.v);
        el.textContent = pre + (grouped ? n.toLocaleString('en-IN') : String(n)) + post;
      },
      onComplete() { el.textContent = raw; },
    });
  }

  /* ScrollTrigger measures a trigger's position once per refresh. Inside the
     sticky "day" section an element's own rect depends on scroll, so anything
     in there is triggered off the section instead. */
  const triggerFor = (el) => el.closest('.day') || el;

  /* ---------------------------------------------------------------------------
     Smooth scroll
     Lenis keeps the native scrollbar and only eases wheel input, so CSS sticky
     and the carousel's own touch handling both keep working. Touch is left
     native (syncTouch defaults to false).
     --------------------------------------------------------------------------- */
  let lenis = null;
  if (Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true, anchors: true, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // held until the preloader clears
  }

  /* Start the intro from the top, whatever the browser remembers. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  /* ---------------------------------------------------------------------------
     Preloader
     Runs immediately, which is the point: it covers the gap before the runtime
     has drawn anything. The counter creeps to 92% on its own and only closes
     out once the markup is up and the page has loaded (or we run out of
     patience).
     --------------------------------------------------------------------------- */
  const countEl = one('[data-preloader-count]');
  const progress = { v: 0 };
  const showCount = () => { if (countEl) countEl.textContent = String(Math.round(progress.v)); };

  if (preloader) {
    /* motion.css fades the preloader on its own after 6s in case this file never
       runs. It did run, so take the wheel. */
    preloader.style.animation = 'none';
    gsap.to(progress, { v: 92, duration: 1.4, ease: 'power1.out', onUpdate: showCount });
    gsap.to('.preloader__bar span', { scaleX: 0.92, duration: 1.4, ease: 'power1.out' });
  }

  const rendered = new Promise((resolve) => {
    const found = () => one('[data-m="hero-title"]');
    if (found()) return resolve();
    const obs = new MutationObserver(() => {
      if (found()) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    /* Never hang on this: if the runtime fails, we still take the cover off. */
    setTimeout(() => { obs.disconnect(); resolve(); }, 6000);
  });

  const loaded = new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });

  const fonts = document.fonts
    ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
    : Promise.resolve();

  const patience = new Promise((r) => setTimeout(r, 3200));

  Promise.all([rendered, fonts, Promise.race([loaded, patience])])
    .then(() => {
      let intro = null;
      try {
        intro = build();
      } catch (err) {
        console.error('motion.js: scroll animations failed to build.', err);
      }
      finish(intro);
    })
    .catch((err) => {
      console.error('motion.js: startup failed.', err);
      finish(null);
    });

  /* Play the preloader out, hand scrolling back, then run the hero intro. */
  function finish(intro) {
    if (lenis) lenis.start();

    if (!preloader) {
      ScrollTrigger.refresh();
      if (intro) intro.play();
      return;
    }

    gsap.timeline()
      .to(progress, { v: 100, duration: 0.4, ease: 'power2.out', onUpdate: showCount }, 0)
      .to('.preloader__bar span', { scaleX: 1, duration: 0.4, ease: 'power2.out' }, 0)
      .to('.preloader__word span', { yPercent: -115, duration: 0.5, ease: 'expo.in', stagger: 0.06 }, 0.25)
      .to('.preloader__count, .preloader__mark', { autoAlpha: 0, duration: 0.3 }, 0.25)
      .to(preloader, { yPercent: -101, duration: 0.9, ease: 'expo.inOut' }, 0.5)
      .set(preloader, { display: 'none' })
      .add(() => { ScrollTrigger.refresh(); })
      /* `intro` is a paused timeline, so start it by hand rather than nesting
         it: a paused child never advances inside a parent timeline. */
      .add(() => { if (intro) intro.play(); }, '-=0.5');
  }

  /* =========================================================================
     build()
     Creates every animation and returns the paused hero intro timeline.
     Each block is independent and guards its own targets, so a missing
     element costs you one effect rather than the whole file.
     ========================================================================= */
  function build() {
    const hero = one('.hero');
    const heroMedia = dm('hero-media');
    const heroContent = dm('hero-content');

    /* ---------- Hero intro (paused; played once the preloader lifts) ---------
       These are `from` tweens, so GSAP writes the hidden start states the
       moment the timeline is created, before the preloader moves. */
    const intro = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });

    if (heroMedia) intro.from(heroMedia, { scale: 1.22, duration: 2.2, ease: 'expo.out' }, 0);

    const nav = dm('nav');
    if (nav) intro.from(nav, { y: -24, autoAlpha: 0, duration: 1 }, 0.1);

    const heroTitle = dm('hero-title');
    if (heroTitle && SplitText) {
      const split = SplitText.create(heroTitle, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      intro.from(split.lines, { yPercent: 115, duration: 1.2, stagger: 0.1 }, 0.2);
    } else if (heroTitle) {
      intro.from(heroTitle, { y: 40, autoAlpha: 0, duration: 1 }, 0.2);
    }

    const badge = dm('hero-badge');
    if (badge) intro.from(badge, { y: 18, autoAlpha: 0, duration: 0.8 }, 0.15);

    ['hero-lede', 'hero-ctas', 'hero-stats'].forEach((name, i) => {
      const el = dm(name);
      if (el) intro.from(el, { y: 26, autoAlpha: 0, duration: 0.9 }, 0.55 + i * 0.12);
    });

    /* Hero numbers tick up as the stats row arrives. */
    const stats = dm('hero-stats');
    if (stats) {
      intro.add(() => {
        all('[data-count]', stats).forEach((el, i) => {
          const tween = countUp(el, 1.4);
          if (tween) tween.delay(i * 0.08);
        });
      }, 0.8);
    }

    /* ---------- Hero on scroll: video drifts, text fades ---------- */
    if (hero) {
      const heroScrub = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
      if (heroMedia) gsap.to(heroMedia, { yPercent: 14, ease: 'none', scrollTrigger: heroScrub });
      if (heroContent) gsap.to(heroContent, { yPercent: -7, opacity: 0, ease: 'none', scrollTrigger: { ...heroScrub, end: 'bottom 30%' } });
    }

    /* ---------- Scroll progress bar ---------- */
    const bar = one('.scroll-progress span');
    if (bar) {
      gsap.fromTo(bar, { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
      });
    }

    /* ---------- Headings reveal line by line ---------- */
    if (SplitText) {
      dmAll('split').forEach((el) => {
        SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'split-line',
          autoSplit: true, // re-split on resize / font swap
          onSplit(self) {
            return gsap.from(self.lines, {
              yPercent: 115,
              duration: 1,
              ease: 'expo.out',
              stagger: 0.09,
              scrollTrigger: { trigger: triggerFor(el), start: 'top 88%', once: true },
            });
          },
        });
      });
    }

    /* ---------- "Live here for a week": words light up on scroll ---------- */
    const scrubWords = dm('scrub-words');
    if (scrubWords && SplitText) {
      const split = SplitText.create(scrubWords, { type: 'words' });
      gsap.fromTo(split.words,
        { opacity: 0.18 },
        {
          opacity: 1, ease: 'none', stagger: 0.4,
          scrollTrigger: { trigger: scrubWords, start: 'top 85%', end: 'bottom 45%', scrub: true },
        });
    }

    /* ---------- Generic fade-up blocks ---------- */
    dmAll('fade-up').forEach((el) => {
      gsap.from(el, {
        y: 34, autoAlpha: 0, duration: 0.9,
        scrollTrigger: { trigger: triggerFor(el), start: 'top 88%', once: true },
      });
    });

    /* ---------- Carousel and before/after slider open out from the centre ----
       Both ends of a clip-path tween need the same shape so GSAP can
       interpolate the numbers, hence the explicit fromTo. */
    [one('[data-glass-carousel]'), dm('ba')].forEach((el) => {
      if (!el) return;
      gsap.fromTo(el,
        { clipPath: inset(el, '0% 50% 0% 50%') },
        {
          clipPath: inset(el, '0% 0% 0% 0%'),
          duration: 1.3,
          ease: 'expo.inOut',
          scrollTrigger: { trigger: el, start: 'top 82%', once: true },
          /* Drop the inline clip-path afterwards; `overflow` already does the
             corner clipping and the carousel canvas is happier without it. */
          onComplete: () => gsap.set(el, { clearProps: 'clipPath' }),
        });
    });

    /* ---------- Pillar icons draw themselves ---------- */
    const pillars = dm('pillars');
    if (pillars) {
      all('.pillar', pillars).forEach((pillar) => {
        const strokes = all('svg path, svg circle, svg line, svg polyline, svg rect, svg ellipse', pillar);
        const tl = gsap.timeline({
          scrollTrigger: { trigger: pillars, start: 'top 80%', once: true },
        });
        if (strokes.length && DrawSVGPlugin) {
          tl.from(strokes, { drawSVG: '0%', duration: 1.1, ease: 'power2.inOut', stagger: 0.07 }, 0);
        } else if (strokes.length) {
          tl.from(pillar.querySelector('svg'), { autoAlpha: 0, scale: 0.85, duration: 0.7 }, 0);
        }
        tl.from(all('h3, p', pillar), { y: 22, autoAlpha: 0, duration: 0.8, stagger: 0.1 }, 0.2);
      });
    }

    /* ---------- Gallery: photos wipe in, then drift inside their frames ------
       The images sit slightly oversized so the drift never exposes an edge. */
    const gallery = dm('gallery');
    kids(gallery).forEach((card) => {
      const img = card.querySelector('img');
      const caption = card.querySelector('span');

      gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 92%', once: true } })
        .fromTo(card,
          { clipPath: inset(card, '100% 0% 0% 0%') },
          { clipPath: inset(card, '0% 0% 0% 0%'), duration: 1.1, ease: 'expo.inOut' }, 0)
        .fromTo(img || [], { scale: 1.45 }, { scale: 1.16, duration: 1.3, ease: 'expo.out' }, 0)
        .from(caption || [], { yPercent: 40, autoAlpha: 0, duration: 0.6 }, 0.45);

      if (img) {
        gsap.fromTo(img, { yPercent: -5 }, {
          yPercent: 5, ease: 'none',
          scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      }
    });

    /* ---------- Meditation wall photo + the quote beside it ---------- */
    const parallax = dm('parallax');
    const pImg = parallax && parallax.querySelector('img');
    if (pImg) {
      gsap.set(pImg, { scale: 1.2 });
      gsap.fromTo(pImg, { yPercent: -7 }, {
        yPercent: 7, ease: 'none',
        scrollTrigger: { trigger: parallax, start: 'top bottom', end: 'bottom top', scrub: true },
      });
      gsap.fromTo(parallax,
        { clipPath: inset(parallax, '0% 0% 100% 0%') },
        {
          clipPath: inset(parallax, '0% 0% 0% 0%'), duration: 1.2, ease: 'expo.inOut',
          scrollTrigger: { trigger: parallax, start: 'top 88%', once: true },
          onComplete: () => gsap.set(parallax, { clearProps: 'clipPath' }),
        });
    }

    const quote = dm('quote');
    if (quote) {
      gsap.from(quote, {
        y: 44, autoAlpha: 0, scale: 0.97, duration: 1,
        scrollTrigger: { trigger: quote, start: 'top 88%', once: true },
      });
    }

    /* ---------- Trial steps flip into place ---------- */
    const steps = dm('steps');
    if (steps) {
      gsap.from(kids(steps), {
        rotateX: -55, y: 56, autoAlpha: 0, transformOrigin: '50% 0%',
        duration: 1, stagger: 0.12,
        scrollTrigger: { trigger: steps, start: 'top 85%', once: true },
      });
    }

    /* ---------- Calculator card ---------- */
    const rise = dm('rise');
    if (rise) {
      gsap.from(rise, {
        y: 60, autoAlpha: 0, duration: 1.1,
        scrollTrigger: { trigger: rise, start: 'top 88%', once: true },
      });
    }

    /* ---------- Price: the big number counts up, then the chips pop ---------- */
    const price = dm('price');
    if (price) {
      gsap.from(price, {
        y: 40, autoAlpha: 0, duration: 1,
        scrollTrigger: { trigger: price, start: 'top 85%', once: true },
      });
      ScrollTrigger.create({
        trigger: price, start: 'top 75%', once: true,
        onEnter: () => countUp(one('[data-count]', price), 1.6),
      });
    }

    const chips = dm('chips');
    if (chips) {
      gsap.from(kids(chips), {
        scale: 0.6, autoAlpha: 0, y: 14, duration: 0.5,
        ease: 'back.out(2.2)', stagger: 0.06,
        scrollTrigger: { trigger: chips, start: 'top 90%', once: true },
      });
    }

    const facts = dm('price-facts');
    if (facts) {
      gsap.from(kids(facts), {
        y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08,
        scrollTrigger: { trigger: facts, start: 'top 85%', once: true },
      });
    }

    /* ---------- Trial planner ---------- */
    const trial = dm('trial');
    if (trial) {
      gsap.fromTo(trial,
        { clipPath: inset(trial, '0% 0% 100% 0%') },
        {
          clipPath: inset(trial, '0% 0% 0% 0%'), duration: 1.2, ease: 'expo.inOut',
          scrollTrigger: { trigger: trial, start: 'top 85%', once: true },
          onComplete: () => gsap.set(trial, { clearProps: 'clipPath' }),
        });
    }

    const trialCard = dm('trial-card');
    if (trialCard) {
      gsap.from(trialCard, {
        y: 54, autoAlpha: 0, scale: 0.96, duration: 1.1,
        scrollTrigger: { trigger: trial || trialCard, start: 'top 78%', once: true },
      });
    }

    /* ---------- Floating CTA ----------------------------------------------
       On screen between the hero and the trial planner. It stands down over the
       planner and the footer, which carry their own call to action and which it
       would otherwise sit on top of. */
    const floatCta = dm('float-cta');
    if (floatCta && hero) {
      const hidden = { autoAlpha: 0, y: 26, scale: 0.9, duration: 0.35, ease: 'power2.in' };
      const shown = { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.7)' };
      gsap.set(floatCta, { autoAlpha: 0, y: 26, scale: 0.9 });

      ScrollTrigger.create({
        trigger: hero,
        start: 'bottom 85%',
        onEnter: () => gsap.to(floatCta, shown),
        onLeaveBack: () => gsap.to(floatCta, hidden),
      });

      const planner = one('#trial');
      if (planner) {
        ScrollTrigger.create({
          trigger: planner,
          start: 'top 75%',
          onEnter: () => gsap.to(floatCta, hidden),
          onLeaveBack: () => gsap.to(floatCta, shown),
        });
      }
    }

    marquee();
    dayScroll();

    return intro;
  }

  /* ---------------------------------------------------------------------------
     Marquee
     Drifts left on its own, speeds up with the scroll, and flips direction when
     you scroll back up. Driven off gsap.ticker rather than a tween so the
     direction change has no edge cases, and parked while off screen.
     --------------------------------------------------------------------------- */
  function marquee() {
    const band = dm('marquee');
    const track = band && band.querySelector('.marquee__track');
    const row = track && track.querySelector('.marquee__row');
    if (!row) return;

    /* Two identical rows are authored, so wrapping at one row's width loops
       seamlessly. */
    let span = row.offsetWidth;
    if (!span) return;

    const setX = gsap.quickSetter(track, 'x', 'px');
    const BASE = 0.045; // px per ms at rest
    let offset = 0;
    let velocity = 0;
    let awake = false;

    const tick = (time, delta) => {
      const dt = Math.min(delta, 50);
      const back = velocity < -40;
      const boost = Math.min(Math.abs(velocity) * 0.0011, 2.1);
      offset += (back ? 1 : -1) * (BASE + boost) * dt;
      /* Keep offset inside one row's width so the number never grows unbounded. */
      offset = ((offset % span) + span) % span - span;
      setX(offset);
      velocity *= 0.9;
    };

    ScrollTrigger.create({
      trigger: band,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => { velocity = self.getVelocity(); },
      onToggle: (self) => {
        if (self.isActive && !awake) { gsap.ticker.add(tick); awake = true; }
        else if (!self.isActive && awake) { gsap.ticker.remove(tick); awake = false; }
      },
    });

    ScrollTrigger.addEventListener('refreshInit', () => {
      const next = row.offsetWidth;
      if (next) span = next;
    });
  }

  /* ---------------------------------------------------------------------------
     "A day here" sideways scroll, 1024px and up
     .day__sticky is stuck by CSS (see motion.css) and the section is given just
     enough height to cover the sideways distance. Only the inner track moves,
     so no DOM gets re-parented and the runtime stays none the wiser. Below
     1024px gsap.matchMedia tears all of this down and the plain grid returns.
     --------------------------------------------------------------------------- */
  function dayScroll() {
    const section = dm('day');
    const track = dm('day-track');
    const inner = section && section.querySelector('.day__inner');
    const fill = section && section.querySelector('.day__progress-fill');
    if (!section || !track || !inner) return;

    gsap.matchMedia().add('(min-width: 1024px)', () => {
      root.classList.add('is-hscroll');

      let distance = 0;

      /* How far the track has to travel for the last card to finish flush with
         the content's right edge.

         The reference is .day__head's right edge, not track.scrollWidth and not
         the padding box of .day__inner. The head is an ordinary block, so its
         edges are exactly where this section's content starts and stops; the
         track is `width: max-content` and reports a width that has nothing to
         do with the column. The track's current x is subtracted back out, so
         this reads the same whether or not a scrub is in progress. */
      const head = section.querySelector('.day__head');
      const measure = () => {
        const cards = kids(track);
        if (!cards.length || !head) return (distance = 0);
        const x = parseFloat(gsap.getProperty(track, 'x')) || 0;
        const trackRight = cards[cards.length - 1].getBoundingClientRect().right - x;
        distance = Math.max(0, Math.round(trackRight - head.getBoundingClientRect().right));
        /* One viewport to read the cards in, plus the sideways travel. */
        section.style.height = (window.innerHeight + distance) + 'px';
        return distance;
      };
      measure();

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.5,
          invalidateOnRefresh: true,
          onRefreshInit: measure,
        },
      });
      tl.fromTo(track, { x: 0 }, { x: () => -distance, ease: 'none' }, 0);
      if (fill) tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none' }, 0);

      /* Cards ease in as the section arrives, before the sideways travel starts. */
      const cards = gsap.from(kids(track), {
        y: 40, autoAlpha: 0, duration: 0.7, stagger: 0.08,
        scrollTrigger: { trigger: section, start: 'top 70%', once: true },
      });

      return () => {
        cards.scrollTrigger && cards.scrollTrigger.kill();
        cards.revert();
        root.classList.remove('is-hscroll');
        section.style.removeProperty('height');
        gsap.set(track, { clearProps: 'x' });
        if (fill) gsap.set(fill, { clearProps: 'transform' });
      };
    });
  }

  /* ---------------------------------------------------------------------------
     Pointer layer: custom cursor + magnetic buttons
     Set up outside build() because it depends on neither the runtime's markup
     nor the preloader. Every listener is delegated off the document, so nodes
     the runtime swaps out keep working without rebinding.
     --------------------------------------------------------------------------- */
  (function pointer() {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!fine.matches) return;

    const cursor = one('.cursor');
    const ring = cursor && cursor.querySelector('.cursor__ring');
    const dot = cursor && cursor.querySelector('.cursor__dot');
    const label = cursor && cursor.querySelector('.cursor__label');
    if (!ring || !dot) return;

    root.classList.add('has-cursor');
    /* Hidden until the pointer actually moves, so it never sits parked in the
       top-left corner on a freshly loaded page. */
    gsap.set(cursor, { autoAlpha: 0 });
    let seen = false;

    const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
    const dotX = gsap.quickSetter(dot, 'x', 'px');
    const dotY = gsap.quickSetter(dot, 'y', 'px');

    /* What the ring says when it is over each kind of thing. */
    const ZONES = [
      ['[data-m="gallery"] button', 'View'],
      ['[data-m="parallax"]', 'View'],
      ['[data-glass-carousel] canvas', 'Drag'],
      ['.ba', 'Drag'],
    ];
    const HOVER = 'a[href], button, input, label, select';

    /* Links that lean towards the pointer. Deliberately excludes the pill
       buttons (their inline style changes on click, which resets transforms)
       and the floating CTA (its own reveal owns x/y). */
    const MAGNET = 'a[href]:not(.navlink):not([data-m="float-cta"]), .glass-carousel__step';
    let magnet = null;

    document.addEventListener('pointermove', (e) => {
      dotX(e.clientX);
      dotY(e.clientY);
      if (!seen) {
        /* Jump both parts to the pointer before fading in, so the ring does not
           fly in from the corner. */
        seen = true;
        gsap.set([ring, dot], { x: e.clientX, y: e.clientY });
        gsap.to(cursor, { autoAlpha: 1, duration: 0.3 });
      }
      ringX(e.clientX);
      ringY(e.clientY);

      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      /* Cursor label / hover state */
      let text = '';
      for (const [sel, word] of ZONES) {
        if (target.closest(sel)) { text = word; break; }
      }
      if (label && label.textContent !== text) label.textContent = text;
      cursor.classList.toggle('is-label', !!text);
      cursor.classList.toggle('is-hover', !text && !!target.closest(HOVER));

      /* Magnetic pull */
      const next = target.closest(MAGNET);
      if (next !== magnet) {
        if (magnet) gsap.to(magnet, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
        magnet = next;
      }
      if (!next) return;
      const box = next.getBoundingClientRect();
      if (!box.width || !box.height) return;
      gsap.to(next, {
        x: ((e.clientX - (box.left + box.width / 2)) / box.width) * 16,
        y: ((e.clientY - (box.top + box.height / 2)) / box.height) * 12,
        duration: 0.4,
        ease: 'power3.out',
      });
    }, { passive: true });

    /* Leaving the window: park the cursor and release whatever was pulled. */
    document.addEventListener('pointerleave', () => {
      gsap.to(cursor, { autoAlpha: 0, duration: 0.2 });
      if (magnet) { gsap.to(magnet, { x: 0, y: 0, duration: 0.4 }); magnet = null; }
    });
    document.addEventListener('pointerenter', () => gsap.to(cursor, { autoAlpha: 1, duration: 0.2 }));

    document.addEventListener('pointerdown', () => gsap.to(ring, { scale: 0.82, duration: 0.18 }));
    document.addEventListener('pointerup', () => gsap.to(ring, { scale: 1, duration: 0.3 }));

    /* Plugged-in mouse removed, or a tablet switching to touch. */
    fine.addEventListener('change', (ev) => {
      if (!ev.matches) {
        root.classList.remove('has-cursor');
        if (magnet) { gsap.set(magnet, { clearProps: 'transform' }); magnet = null; }
      } else {
        root.classList.add('has-cursor');
      }
    });
  })();

  /* Late-arriving images change the page height; keep triggers honest. */
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
