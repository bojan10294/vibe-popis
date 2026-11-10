import { useEffect, useRef } from 'react'

// Short fireworks show over the whole screen, drawn on a canvas — no library.
// Rockets rise from the bottom and burst into sparks that fall and fade.
// Clicks pass through; skipped for people who turned off animations.

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  hue: number
  rocket: boolean
  /** Rocket only: height where it bursts. */
  burstY?: number
}

const COLORS = [0, 30, 50, 140, 190, 220, 280, 320]

export function Fireworks({ duration = 4500 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const sparks: Spark[] = []
    const launch = () => {
      sparks.push({
        x: w * (0.15 + Math.random() * 0.7),
        y: h,
        vx: (Math.random() - 0.5) * 2,
        vy: -(h / 70 + Math.random() * 3),
        life: 0,
        max: 200,
        hue: COLORS[Math.floor(Math.random() * COLORS.length)],
        rocket: true,
        burstY: h * (0.15 + Math.random() * 0.3),
      })
    }
    const burst = (r: Spark) => {
      const n = 60 + Math.floor(Math.random() * 40)
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n
        const speed = 2 + Math.random() * 4
        sparks.push({
          x: r.x,
          y: r.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 0,
          max: 50 + Math.random() * 40,
          hue: Math.random() < 0.2 ? r.hue + 40 : r.hue,
          rocket: false,
        })
      }
    }

    const start = performance.now()
    let last = start
    let nextLaunch = 0
    let raf = 0
    const frame = (now: number) => {
      const t = now - start
      // Motion is per 60 fps frame; scaled so slow phones run at the same speed.
      const dt = Math.min((now - last) / (1000 / 60), 4)
      last = now
      if (t < duration && t >= nextLaunch) {
        launch()
        if (Math.random() < 0.35) launch()
        nextLaunch = t + 250 + Math.random() * 350
      }

      // Fade the previous frame instead of clearing it: gives the sparks tails.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(0.78, dt)})`
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.life += dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        if (s.rocket) {
          s.vy += 0.05 * dt
          if (s.y <= s.burstY! || s.vy >= 0) {
            burst(s)
            sparks.splice(i, 1)
            continue
          }
        } else {
          const drag = Math.pow(0.97, dt)
          s.vx *= drag
          s.vy = s.vy * drag + 0.06 * dt
        }
        const fade = 1 - s.life / s.max
        if (fade <= 0) {
          sparks.splice(i, 1)
          continue
        }
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.rocket ? 2 : 2.2 * fade + 0.4, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${s.hue}, 100%, ${s.rocket ? 85 : 60}%, ${fade})`
        ctx.fill()
      }

      if (t < duration || sparks.length) raf = requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [duration])

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-full w-full" />
}
