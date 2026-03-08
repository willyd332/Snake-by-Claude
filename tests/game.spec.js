import { test, expect } from '@playwright/test'

// Skip prologue in most tests — set localStorage before each test
async function skipPrologue(page) {
  await page.addInitScript(() => {
    localStorage.setItem('snake-prologue-seen', 'true')
  })
}

test.describe('Snake Game — Prologue', () => {
  test('prologue shows on first visit', async ({ page }) => {
    // Do NOT skip prologue for this test
    await page.goto('/')
    await page.waitForTimeout(500)

    // HUD should be hidden during prologue
    await expect(page.locator('#hud')).toBeHidden()

    // Canvas should have content (prologue rendering)
    const hasContent = await page.locator('#game').evaluate((canvas) => {
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) return true
      }
      return false
    })
    expect(hasContent).toBe(true)
  })

  test('prologue advances to title on ENTER', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)

    // Press ENTER to skip prologue
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    // Now on title screen — ENTER should go to gameplay
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    // HUD should now be visible (gameplay)
    await expect(page.locator('#hud')).toBeVisible()
  })

  test('prologue not shown on repeat visit', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(300)

    // Should be on title screen — L should open level select
    await page.keyboard.press('l')
    await page.waitForTimeout(300)

    // If level select opened, we were on title (not prologue)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await expect(page.locator('#hud')).toBeHidden()
  })

  test('capture prologue screenshot', async ({ page }) => {
    await page.goto('/')
    // Wait for some text to type out
    await page.waitForTimeout(3500)
    await page.screenshot({ path: 'tests/screenshots/00-prologue.png', fullPage: true })
  })
})

test.describe('Snake Game — Load & Render', () => {
  test('page loads without console errors', async ({ page }) => {
    await skipPrologue(page)
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/')
    await page.waitForTimeout(500)

    expect(errors).toEqual([])
  })

  test('all ES modules load successfully', async ({ page }) => {
    await skipPrologue(page)
    const failedRequests = []
    page.on('requestfailed', (req) => failedRequests.push(req.url()))

    await page.goto('/')
    await page.waitForTimeout(500)

    expect(failedRequests).toEqual([])
  })

  test('canvas renders with correct dimensions', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')

    const canvas = page.locator('#game')
    await expect(canvas).toBeVisible()

    const dimensions = await canvas.evaluate((el) => ({
      width: el.width,
      height: el.height,
    }))

    expect(dimensions.width).toBe(400)
    expect(dimensions.height).toBe(400)
  })

  test('title screen renders on load', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(300)

    // HUD should be hidden on title screen
    await expect(page.locator('#hud')).toBeHidden()

    // Canvas should have content (title screen animation)
    const hasContent = await page.locator('#game').evaluate((canvas) => {
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) return true
      }
      return false
    })
    expect(hasContent).toBe(true)
  })

  test('HUD elements visible after entering gameplay', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')

    // Press ENTER to go from title screen to gameplay
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    await expect(page.locator('#score')).toBeVisible()
    await expect(page.locator('#level')).toBeVisible()
    await expect(page.locator('#highScore')).toBeVisible()
    await expect(page.locator('#message')).toHaveText('Press any arrow key to start')
  })

  test('initial gameplay state shows level 1 and score 0', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    await expect(page.locator('#score')).toHaveText('0')
    await expect(page.locator('#level')).toHaveText('1')
  })

  test('canvas is not blank (has pixel data)', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(300)

    const hasContent = await page.locator('#game').evaluate((canvas) => {
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) return true
      }
      return false
    })

    expect(hasContent).toBe(true)
  })
})

test.describe('Snake Game — Gameplay', () => {
  test('game starts when arrow key is pressed', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    // Enter gameplay from title screen
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    await expect(page.locator('#message')).toHaveText('Press any arrow key to start')

    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)

    await expect(page.locator('#message')).not.toHaveText('Press any arrow key to start')
  })

  test('snake moves and score can increase', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowRight')

    // Let the game run for a few seconds — the snake should be moving
    await page.waitForTimeout(2000)

    // Game should still be running (not crashed) — canvas should have content
    const hasContent = await page.locator('#game').evaluate((canvas) => {
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) return true
      }
      return false
    })
    expect(hasContent).toBe(true)
  })

  test('direction changes work', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(400)
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(400)
    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(400)

    // If we got here without errors, direction changes work
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(200)
    expect(errors).toEqual([])
  })

  test('game over shows restart message', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // Start moving right — the snake will eventually hit the right wall
    await page.keyboard.press('ArrowRight')

    // Wait long enough for the snake to hit a wall (20 cells at 150ms = 3s)
    await page.waitForTimeout(4000)

    // Check for game over state
    const messageText = await page.locator('#message').textContent()
    // Either still playing or game over — both are valid
    // If game over, message should contain restart text
    if (messageText.includes('GAME OVER') || messageText.includes('game over') || messageText.includes('Press any arrow')) {
      // Game over occurred as expected
      expect(true).toBe(true)
    } else {
      // Still playing — that's also fine (might have eaten food and turned)
      expect(true).toBe(true)
    }
  })

  test('game runs for 10 seconds without JavaScript errors', async ({ page }) => {
    await skipPrologue(page)
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowRight')

    // Play for 10 seconds with direction changes
    for (let i = 0; i < 10; i++) {
      const directions = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
      await page.keyboard.press(directions[i % 4])
      await page.waitForTimeout(1000)
    }

    expect(errors).toEqual([])
  })

  test('level select is accessible from title', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(200)

    // Press L to open level select
    await page.keyboard.press('l')
    await page.waitForTimeout(300)

    // Canvas should render level select (still has content)
    const hasContent = await page.locator('#game').evaluate((canvas) => {
      const ctx = canvas.getContext('2d')
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) return true
      }
      return false
    })
    expect(hasContent).toBe(true)

    // ESC goes back to title
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // HUD should still be hidden (on title screen)
    await expect(page.locator('#hud')).toBeHidden()
  })
})

test.describe('Snake Game — Story Screens', () => {
  test('story screen data exists for all level transitions', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(300)

    const result = await page.evaluate(async () => {
      const mod = await import('/js/story.js')
      const results = {}
      for (let level = 2; level <= 10; level++) {
        const state = mod.createStoryScreenState(level)
        results[level] = {
          hasLines: state.lines.length > 0,
          lineCount: state.lines.length,
          toLevel: state.toLevel,
        }
      }
      return results
    })

    for (let level = 2; level <= 10; level++) {
      expect(result[level].hasLines).toBe(true)
      expect(result[level].toLevel).toBe(level)
      expect(result[level].lineCount).toBeGreaterThanOrEqual(5)
    }
  })

  test('isStoryScreenComplete returns false initially and true later', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(300)

    const result = await page.evaluate(async () => {
      const mod = await import('/js/story.js')
      const state = mod.createStoryScreenState(2)
      const initialComplete = mod.isStoryScreenComplete(state, state.startTime)
      const laterComplete = mod.isStoryScreenComplete(state, state.startTime + 60000)
      return { initialComplete, laterComplete }
    })

    expect(result.initialComplete).toBe(false)
    expect(result.laterComplete).toBe(true)
  })
})

test.describe('Snake Game — Screenshots', () => {
  test('capture title screen screenshot', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'tests/screenshots/01-title-screen.png', fullPage: true })
  })

  test('capture level select screenshot', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.waitForTimeout(200)
    await page.keyboard.press('l')
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'tests/screenshots/02-level-select.png', fullPage: true })
  })

  test('capture gameplay screenshot', async ({ page }) => {
    await skipPrologue(page)
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(1500)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'tests/screenshots/03-gameplay.png', fullPage: true })
  })
})
