import { expect, type Page } from '@playwright/test'

/**
 * The "High-Glare" audit probe ([P3-16]).
 *
 * Two properties decide whether this UI is usable on a bright airfield with
 * gloves on, and both can be measured from the rendered page rather than
 * argued about in review:
 *
 *  - text meets the WCAG AA contrast minimum against what is actually painted
 *    behind it, and
 *  - every control is at least 44 CSS px in both directions.
 *
 * The probe reads computed styles and geometry, so it audits whatever the app
 * really renders — Tailwind utilities, Leaflet's own controls and Recharts'
 * SVG alike — instead of a list of classes someone remembered to update.
 * [P13-06] runs it as the accessibility check in CI.
 */

/**
 * Minimum touch target. WCAG 2.5.5 (AAA) asks for 44x44 CSS px; the field UI
 * takes that as a hard floor rather than the 24 px of the AA criterion,
 * because the operator is wearing gloves.
 */
export const MIN_TOUCH_PX = 44

/** WCAG 1.4.3 AA: 4.5:1 for body text, 3:1 once the text is large. */
export const AA_NORMAL = 4.5
export const AA_LARGE = 3

export interface ContrastFinding {
  /** Readable identity of the element, for the failure message. */
  element: string
  /** The text that was measured, truncated. */
  sample: string
  ratio: number
  required: number
  foreground: string
  background: string
}

export interface TargetFinding {
  element: string
  width: number
  height: number
}

export interface GlareReport {
  contrast: ContrastFinding[]
  targets: TargetFinding[]
  /**
   * How much each check actually looked at. A state that renders nothing would
   * otherwise pass silently, so the specs assert on these too.
   */
  counted: { contrast: number; targets: number }
}

export interface GlareOptions {
  /** Subtree to audit. Defaults to the whole document. */
  root?: string
  /** Subtrees to skip; every use documents why in the spec. */
  exclude?: string[]
}

/** Controls an operator is expected to hit, however they are marked up. */
const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export async function auditGlare(
  page: Page,
  { root = 'body', exclude = [] }: GlareOptions = {},
): Promise<GlareReport> {
  return page.evaluate(
    ({
      rootSelector,
      skipSelectors,
      interactive,
      minTouch,
      aaNormal,
      aaLarge,
    }) => {
      const rootEl = document.querySelector(rootSelector)
      if (!rootEl) throw new Error(`nothing matches ${rootSelector}`)

      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null)
        throw new Error('no 2d context to resolve colours with')
      // Typed alias: the null check above does not narrow inside the closures
      const ctx: CanvasRenderingContext2D = context

      interface Colour {
        r: number
        g: number
        b: number
        a: number
      }

      /**
       * Any CSS colour as sRGB plus alpha. Painting it over black and again
       * over white recovers both channels and opacity, which keeps this
       * independent of how the browser chose to serialise the computed value —
       * Tailwind's alpha modifiers come back as `color(srgb ...)`, not `rgba()`.
       * A value the canvas cannot parse leaves the backdrop untouched and so
       * reads as transparent, which is what `transparent` itself does.
       */
      function parseColour(value: string): Colour {
        const paint = (backdrop: string) => {
          ctx.globalCompositeOperation = 'copy'
          ctx.fillStyle = backdrop
          ctx.fillRect(0, 0, 1, 1)
          ctx.globalCompositeOperation = 'source-over'
          ctx.fillStyle = backdrop
          ctx.fillStyle = value
          ctx.fillRect(0, 0, 1, 1)
          return ctx.getImageData(0, 0, 1, 1).data
        }
        const onWhite = paint('#ffffff')
        const onBlack = paint('#000000')
        let alpha = 0
        for (let i = 0; i < 3; i++) alpha += 1 - (onWhite[i] - onBlack[i]) / 255
        alpha = Math.min(1, Math.max(0, alpha / 3))
        if (alpha < 0.004) return { r: 0, g: 0, b: 0, a: 0 }
        return {
          r: Math.min(255, onBlack[0] / alpha),
          g: Math.min(255, onBlack[1] / alpha),
          b: Math.min(255, onBlack[2] / alpha),
          a: alpha,
        }
      }

      function over(fg: Colour, bg: Colour): Colour {
        return {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
          a: 1,
        }
      }

      function luminance({ r, g, b }: Colour): number {
        const channel = (value: number) => {
          const srgb = value / 255
          return srgb <= 0.04045
            ? srgb / 12.92
            : Math.pow((srgb + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }

      function contrast(a: Colour, b: Colour): number {
        const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y)
        return (light + 0.05) / (dark + 0.05)
      }

      function describeColour(c: Colour): string {
        const round = (v: number) => Math.round(v)
        return `rgb(${round(c.r)}, ${round(c.g)}, ${round(c.b)})`
      }

      /**
       * What is painted behind an element, and how much of the element's own
       * paint survives the `opacity` applied to it and its ancestors. Layers
       * are composited down onto white, which is what the page itself sits on.
       */
      function backdropOf(el: Element): { backdrop: Colour; opacity: number } {
        const chain: Element[] = []
        for (
          let node: Element | null = el;
          node !== null;
          node = node.parentElement
        )
          chain.push(node)

        // opacity[i] is the product from chain[i] up to the document root: an
        // ancestor's opacity fades its own background and everything inside it.
        const opacity: number[] = []
        let inherited = 1
        for (let i = chain.length - 1; i >= 0; i--) {
          const own = Number(getComputedStyle(chain[i]).opacity)
          inherited *= Number.isFinite(own) ? own : 1
          opacity[i] = inherited
        }

        const layers: Colour[] = []
        for (let i = 0; i < chain.length; i++) {
          const colour = parseColour(getComputedStyle(chain[i]).backgroundColor)
          const alpha = colour.a * opacity[i]
          if (alpha <= 0) continue
          layers.push({ ...colour, a: alpha })
          if (alpha >= 0.999) break
        }

        let backdrop: Colour = { r: 255, g: 255, b: 255, a: 1 }
        for (let i = layers.length - 1; i >= 0; i--)
          backdrop = over(layers[i], backdrop)
        return { backdrop, opacity: opacity[0] }
      }

      function describe(el: Element): string {
        const parts = [el.tagName.toLowerCase()]
        const testid = el.getAttribute('data-testid')
        if (testid !== null) parts.push(`[data-testid="${testid}"]`)
        const label = el.getAttribute('aria-label')
        if (label !== null) parts.push(`[aria-label="${label}"]`)
        const className = el.getAttribute('class')
        if (testid === null && label === null && className)
          parts.push(`.${className.trim().split(/\s+/).slice(0, 3).join('.')}`)
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        return parts.join('') + (text === '' ? '' : ` "${text.slice(0, 40)}"`)
      }

      function invisible(el: Element): boolean {
        const style = getComputedStyle(el)
        if (style.visibility !== 'visible') return true
        if (style.display === 'none') return true
        if (Number(style.opacity) === 0) return true
        const box = el.getBoundingClientRect()
        return box.width === 0 || box.height === 0
      }

      function excluded(el: Element): boolean {
        if (el.closest('[aria-hidden="true"]') !== null) return true
        return skipSelectors.some((selector) => el.closest(selector) !== null)
      }

      /** WCAG exempts inactive controls from the contrast minimum. */
      function inactive(el: Element): boolean {
        return (
          el.matches(':disabled') ||
          el.closest('[aria-disabled="true"]') !== null
        )
      }

      const contrastFindings: ContrastFindingRaw[] = []
      let contrastCounted = 0

      interface ContrastFindingRaw {
        element: string
        sample: string
        ratio: number
        required: number
        foreground: string
        background: string
      }

      function measure(el: Element, sample: string, colourValue: string): void {
        const style = getComputedStyle(el)
        const size = parseFloat(style.fontSize)
        const weight = Number(style.fontWeight) || 400
        // WCAG "large text": 18pt, or 14pt once bold.
        const large = size >= 24 || (size >= 18.66 && weight >= 700)
        const required = large ? aaLarge : aaNormal

        const { backdrop, opacity } = backdropOf(el)
        const colour = parseColour(colourValue)
        if (colour.a === 0) return
        const foreground = over({ ...colour, a: colour.a * opacity }, backdrop)
        const ratio = Math.round(contrast(foreground, backdrop) * 100) / 100

        contrastCounted++
        if (ratio >= required) return
        contrastFindings.push({
          element: describe(el),
          sample,
          ratio,
          required,
          foreground: describeColour(foreground),
          background: describeColour(backdrop),
        })
      }

      const everything = [rootEl, ...rootEl.querySelectorAll('*')]
      for (const el of everything) {
        if (excluded(el) || invisible(el) || inactive(el)) continue

        const own = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => (node.textContent ?? '').trim())
          .filter((text) => text !== '')
          .join(' ')
        const style = getComputedStyle(el)
        if (own !== '') {
          // SVG text is painted with `fill`; `color` says nothing about it.
          const painted =
            el instanceof SVGElement &&
            style.fill !== '' &&
            style.fill !== 'none'
              ? style.fill
              : style.color
          measure(el, own.replace(/\s+/g, ' ').slice(0, 60), painted)
        }

        // Placeholders are text the operator has to read to know what a field
        // wants, and Tailwind styles them separately from the value.
        if (
          el instanceof HTMLInputElement &&
          el.placeholder !== '' &&
          el.value === ''
        ) {
          const placeholder = getComputedStyle(el, '::placeholder')
          measure(el, `placeholder: ${el.placeholder}`, placeholder.color)
        }
      }

      const targetFindings: TargetFinding[] = []
      let targetsCounted = 0
      for (const el of rootEl.querySelectorAll(interactive)) {
        if (excluded(el) || invisible(el)) continue

        const box = el.getBoundingClientRect()
        let width = box.width
        let height = box.height

        // A checkbox or radio is activated by its own label as well, so the
        // label is the real target. Nothing else gets that credit: clicking a
        // text field's label only moves focus there.
        if (
          el instanceof HTMLInputElement &&
          (el.type === 'checkbox' || el.type === 'radio')
        ) {
          const label =
            el.closest('label') ??
            (el.id === ''
              ? null
              : document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
          if (label !== null) {
            const labelBox = label.getBoundingClientRect()
            width =
              Math.max(box.right, labelBox.right) -
              Math.min(box.left, labelBox.left)
            height =
              Math.max(box.bottom, labelBox.bottom) -
              Math.min(box.top, labelBox.top)
          }
        }

        targetsCounted++
        // Sub-pixel layout rounds a nominally 44 px box to 43.99
        if (width + 0.5 >= minTouch && height + 0.5 >= minTouch) continue
        targetFindings.push({
          element: describe(el),
          width: Math.round(width * 10) / 10,
          height: Math.round(height * 10) / 10,
        })
      }

      return {
        contrast: contrastFindings,
        targets: targetFindings,
        counted: { contrast: contrastCounted, targets: targetsCounted },
      }
    },
    {
      rootSelector: root,
      skipSelectors: exclude,
      interactive: INTERACTIVE,
      minTouch: MIN_TOUCH_PX,
      aaNormal: AA_NORMAL,
      aaLarge: AA_LARGE,
    },
  )
}

function describeContrast(finding: ContrastFinding): string {
  return (
    `${finding.element} — ${finding.ratio}:1, needs ${finding.required}:1 ` +
    `(${finding.foreground} on ${finding.background}) [${finding.sample}]`
  )
}

function describeTarget(finding: TargetFinding): string {
  return `${finding.element} — ${finding.width}x${finding.height} px, needs ${MIN_TOUCH_PX}x${MIN_TOUCH_PX}`
}

/**
 * Assert one screen state is glare-ready. Both checks are soft so a single run
 * reports every problem in that state rather than the first one.
 */
export async function expectGlareReady(
  page: Page,
  options: GlareOptions = {},
): Promise<GlareReport> {
  const report = await auditGlare(page, options)
  expect
    .soft(report.contrast.map(describeContrast), 'text below WCAG AA contrast')
    .toEqual([])
  expect
    .soft(report.targets.map(describeTarget), 'controls under 44 px')
    .toEqual([])
  return report
}
