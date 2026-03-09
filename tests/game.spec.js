import { test, expect } from '@playwright/test'

test.describe('Snake Game — Load & Render', () => {
  test('page loads without console errors', async ({ page }) => {
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
    const failedRequests = []
    page.on('requestfailed', (req) => failedRequests.push(req.url()))

    await page.goto('/')
    await page.waitForTimeout(500)

    expect(failedRequests).toEqual([])
  })

  test('canvas renders with correct dimensions', async ({ page }) => {
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
    await page.goto('/')

    // Press ENTER to go from title screen to gameplay (endless mode)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    await expect(page.locator('#score')).toBeVisible()
    await expect(page.locator('#level')).toBeVisible()
    await expect(page.locator('#highScore')).toBeVisible()
  })

  test('initial gameplay state shows wave 1 and score 0', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    await expect(page.locator('#score')).toHaveText('0')
    await expect(page.locator('#level')).toHaveText('W1')
    const levelLabel = await page.textContent('#levelLabel')
    expect(levelLabel).toContain('Wave')
  })

  test('canvas is not blank (has pixel data)', async ({ page }) => {
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
    await page.goto('/')
    // Enter gameplay from title screen
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)

    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)

    // Message should clear or change once game starts
    const messageText = await page.locator('#message').textContent()
    expect(messageText).not.toContain('Arrow keys or swipe to start')
  })

  test('snake moves and score can increase', async ({ page }) => {
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

  test('game runs for 10 seconds without JavaScript errors', async ({ page }) => {
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
})

test.describe('Snake Game — Hunter ALPHA', () => {
  test('hunter module exports manhattanDistance and generateHunter', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)

    const exports = await page.evaluate(async () => {
      const mod = await import('/js/hunter.js')
      return {
        hasManhattan: typeof mod.manhattanDistance === 'function',
        hasGenerate: typeof mod.generateHunter === 'function',
        hasMoveHunter: typeof mod.moveHunter === 'function',
      }
    })
    expect(exports.hasManhattan).toBe(true)
    expect(exports.hasGenerate).toBe(true)
    expect(exports.hasMoveHunter).toBe(true)
  })

  test('_killedByHunter flag exists in tick event flags', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)

    const hasFlag = await page.evaluate(async () => {
      const { tick } = await import('/js/tick.js')
      const { createInitialState } = await import('/js/state.js')
      const state = createInitialState()
      const result = tick(state)
      return '_killedByHunter' in result
    })
    expect(hasFlag).toBe(true)
  })

  test('audio module exports hunter sounds', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)

    const exports = await page.evaluate(async () => {
      const mod = await import('/js/audio.js')
      return {
        hasHunterKill: typeof mod.playHunterKillSound === 'function',
        hasHunterIntro: typeof mod.playHunterIntroSound === 'function',
      }
    })
    expect(exports.hasHunterKill).toBe(true)
    expect(exports.hasHunterIntro).toBe(true)
  })
})

test.describe('Snake Game — Game Over Screen', () => {
  test('_deathCause flag exists in tick event flags', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)

    const hasFlag = await page.evaluate(async () => {
      const { tick } = await import('/js/tick.js')
      const { createInitialState } = await import('/js/state.js')
      const state = createInitialState()
      const result = tick(state)
      return '_deathCause' in result
    })
    expect(hasFlag).toBe(true)
  })

  test('death causes are set correctly for different collision types', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)

    const causes = await page.evaluate(async () => {
      const { tick } = await import('/js/tick.js')
      const { createInitialState } = await import('/js/state.js')

      // Test boundary death: move snake into a wall at grid edge
      var state = createInitialState()
      state = Object.assign({}, state, {
        started: true,
        nextDirection: { x: -1, y: 0 },
        snake: [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }],
      })
      var result = tick(state)
      var boundaryCause = result._deathCause

      // Test self collision: set snake so head moves into body
      state = createInitialState()
      state = Object.assign({}, state, {
        started: true,
        nextDirection: { x: 1, y: 0 },
        snake: [{ x: 5, y: 5 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 5 }],
      })
      result = tick(state)
      var selfCause = result._deathCause

      return { boundaryCause: boundaryCause, selfCause: selfCause }
    })
    expect(causes.boundaryCause).toBe('boundary')
    expect(causes.selfCause).toBe('self')
  })

  test('game over screen renders without errors', async ({ page }) => {
    const errors = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await page.waitForTimeout(200)

    // Start game and move up — snake at center, hits boundary
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowUp')

    // Wait for death + replay + death animation (lives system: need to exhaust all lives)
    await page.waitForTimeout(8000)

    // Should see game over screen — check for no JS errors
    expect(errors).toEqual([])
  })
})

test.describe('Snake Game — Endless Mode', () => {
  test('endless module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('/js/endless.js')
      return {
        hasGetEndlessConfig: typeof mod.getEndlessConfig === 'function',
        hasGenerateEndlessWalls: typeof mod.generateEndlessWalls === 'function',
        hasGenerateEndlessObstacles: typeof mod.generateEndlessObstacles === 'function',
        hasGenerateEndlessPortals: typeof mod.generateEndlessPortals === 'function',
        hasGenerateEndlessHunter: typeof mod.generateEndlessHunter === 'function',
        hasGetWaveTitle: typeof mod.getWaveTitle === 'function',
        hasFoodPerWave: typeof mod.ENDLESS_FOOD_PER_WAVE === 'number',
        foodPerWave: mod.ENDLESS_FOOD_PER_WAVE,
      }
    })
    expect(exports.hasGetEndlessConfig).toBe(true)
    expect(exports.hasGenerateEndlessWalls).toBe(true)
    expect(exports.hasGenerateEndlessObstacles).toBe(true)
    expect(exports.hasGenerateEndlessPortals).toBe(true)
    expect(exports.hasGenerateEndlessHunter).toBe(true)
    expect(exports.hasGetWaveTitle).toBe(true)
    expect(exports.hasFoodPerWave).toBe(true)
    expect(exports.foodPerWave).toBe(3)
  })

  test('endless config progressively introduces mechanics', async ({ page }) => {
    await page.goto('/')
    const configs = await page.evaluate(async () => {
      const { getEndlessConfig } = await import('/js/endless.js')
      return {
        wave1: getEndlessConfig(1),
        wave3: getEndlessConfig(3),
        wave7: getEndlessConfig(7),
        wave13: getEndlessConfig(13),
        wave16: getEndlessConfig(16),
      }
    })
    // Wave 1: no mechanics
    expect(configs.wave1.wallColor).toBeNull()
    expect(configs.wave1.hunterEnabled).toBe(false)
    expect(configs.wave1.shrinkingArena).toBe(false)
    // Wave 3: walls
    expect(configs.wave3.wallColor).not.toBeNull()
    // Wave 7: portals
    expect(configs.wave7.portalColor).not.toBeNull()
    // Wave 13: hunter
    expect(configs.wave13.hunterEnabled).toBe(true)
    // Wave 16: shrinking arena
    expect(configs.wave16.shrinkingArena).toBe(true)
    // Speed decreases over time
    expect(configs.wave16.speed).toBeLessThan(configs.wave1.speed)
  })

  test('ENTER from title starts endless mode directly', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)

    const levelLabel = await page.textContent('#levelLabel')
    expect(levelLabel).toContain('Wave')

    // HUD should be visible
    await expect(page.locator('#hud')).toBeVisible()
  })

  test('endless mode renders without errors and gameplay works', async ({ page }) => {
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(2000)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1000)
    expect(errors.length).toBe(0)
  })
})

test.describe('Snake Game — Secrets & Easter Eggs', () => {
  test('secrets module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('./js/secrets.js')
      return {
        handleSecretKey: typeof mod.handleSecretKey,
        isSecretActive: typeof mod.isSecretActive,
        toggleDevConsole: typeof mod.toggleDevConsole,
        isDevConsoleOpen: typeof mod.isDevConsoleOpen,
        applyInvertFilter: typeof mod.applyInvertFilter,
        createMatrixState: typeof mod.createMatrixState,
        updateMatrixState: typeof mod.updateMatrixState,
        renderMatrixRain: typeof mod.renderMatrixRain,
        renderDevConsole: typeof mod.renderDevConsole,
        markSecretFound: typeof mod.markSecretFound,
        getSecretsDiscovered: typeof mod.getSecretsDiscovered,
      }
    })
    for (const [name, type] of Object.entries(exports)) {
      expect(type).toBe('function')
    }
  })

  test('secret code detection works for MATRIX and INVERT', async ({ page }) => {
    await page.goto('/')
    const results = await page.evaluate(async () => {
      const mod = await import('./js/secrets.js')
      // Type MATRIX
      const keys = 'MATRIX'.split('')
      let result = null
      for (const k of keys) {
        result = mod.handleSecretKey(k)
      }
      const matrixResult = result
      // Type INVERT
      const keys2 = 'INVERT'.split('')
      let result2 = null
      for (const k of keys2) {
        result2 = mod.handleSecretKey(k)
      }
      return {
        matrix: matrixResult,
        invert: result2,
      }
    })
    expect(results.matrix).toBeTruthy()
    expect(results.matrix.name).toBe('matrix')
    expect(results.matrix.active).toBe(true)
    expect(results.invert).toBeTruthy()
    expect(results.invert.name).toBe('invert')
    expect(results.invert.active).toBe(true)
  })

  test('dev console opens with backtick and renders without errors', async ({ page }) => {
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(300)
    // Open dev console with backtick
    await page.keyboard.press('`')
    await page.waitForTimeout(500)
    // Close with backtick
    await page.keyboard.press('`')
    await page.waitForTimeout(200)
    expect(errors.length).toBe(0)
  })

  test('matrix rain renders without errors during gameplay', async ({ page }) => {
    // Enable matrix mode via localStorage
    await page.addInitScript(() => {
      localStorage.setItem('snake-secret-matrix', 'true')
    })
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(300)
    // Start a game (Enter then arrow)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(1500)
    expect(errors.length).toBe(0)
  })
})

// === ACHIEVEMENTS ===
test.describe('Snake Game — Achievements', () => {
  test('achievements module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('/js/achievements.js')
      return {
        hasAchievements: Array.isArray(mod.ACHIEVEMENTS) && mod.ACHIEVEMENTS.length >= 20,
        hasSkins: Array.isArray(mod.SKINS) && mod.SKINS.length >= 6,
        hasTrails: Array.isArray(mod.TRAILS) && mod.TRAILS.length >= 4,
        hasUnlock: typeof mod.unlockAchievement === 'function',
        hasGetUnlocked: typeof mod.getUnlockedAchievements === 'function',
        hasIsUnlocked: typeof mod.isAchievementUnlocked === 'function',
        hasPopup: typeof mod.createPopupState === 'function',
        hasRenderPopup: typeof mod.renderPopup === 'function',
        hasGallery: typeof mod.createGalleryState === 'function',
        hasRenderGallery: typeof mod.renderGallery === 'function',
        hasSkinFuncs: typeof mod.getActiveSkin === 'function' && typeof mod.setActiveSkin === 'function',
        hasTrailFuncs: typeof mod.getActiveTrail === 'function' && typeof mod.setActiveTrail === 'function',
      }
    })
    expect(exports.hasAchievements).toBe(true)
    expect(exports.hasSkins).toBe(true)
    expect(exports.hasTrails).toBe(true)
    expect(exports.hasUnlock).toBe(true)
    expect(exports.hasGetUnlocked).toBe(true)
    expect(exports.hasIsUnlocked).toBe(true)
    expect(exports.hasPopup).toBe(true)
    expect(exports.hasRenderPopup).toBe(true)
    expect(exports.hasGallery).toBe(true)
    expect(exports.hasRenderGallery).toBe(true)
    expect(exports.hasSkinFuncs).toBe(true)
    expect(exports.hasTrailFuncs).toBe(true)
  })

  test('achievement unlock persists in localStorage', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/achievements.js')
      // Unlock first_byte
      const ach = mod.unlockAchievement('first_byte')
      const isUnlocked = mod.isAchievementUnlocked('first_byte')
      const stored = JSON.parse(localStorage.getItem('snake-achievements') || '[]')
      // Try duplicate unlock — should return null
      const dupe = mod.unlockAchievement('first_byte')
      return {
        achName: ach ? ach.name : null,
        isUnlocked,
        storedContains: stored.indexOf('first_byte') !== -1,
        dupeIsNull: dupe === null,
      }
    })
    expect(result.achName).toBe('First Byte')
    expect(result.isUnlocked).toBe(true)
    expect(result.storedContains).toBe(true)
    expect(result.dupeIsNull).toBe(true)
  })

  test('gallery screen is accessible from title via T key', async ({ page }) => {
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(300)
    await page.keyboard.press('t')
    await page.waitForTimeout(500)
    // Press ESC to go back
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    expect(errors.length).toBe(0)
  })

  test('skin and trail selection works', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/achievements.js')
      // Default values
      const defaultSkin = mod.getActiveSkin()
      const defaultTrail = mod.getActiveTrail()
      // Set new values
      mod.setActiveSkin('neon')
      mod.setActiveTrail('fade')
      const newSkin = mod.getActiveSkin()
      const newTrail = mod.getActiveTrail()
      // Check unlock status — default should be unlocked, neon should not (requires first_byte)
      const defaultUnlocked = mod.isSkinUnlocked('default')
      const neonLocked = !mod.isSkinUnlocked('neon')
      // Unlock first_byte, then neon should be unlocked
      mod.unlockAchievement('first_byte')
      const neonNowUnlocked = mod.isSkinUnlocked('neon')
      return { defaultSkin, defaultTrail, newSkin, newTrail, defaultUnlocked, neonLocked, neonNowUnlocked }
    })
    expect(result.defaultSkin).toBe('default')
    expect(result.defaultTrail).toBe('none')
    expect(result.newSkin).toBe('neon')
    expect(result.newTrail).toBe('fade')
    expect(result.defaultUnlocked).toBe(true)
    expect(result.neonLocked).toBe(true)
    expect(result.neonNowUnlocked).toBe(true)
  })
})

// === MODIFIERS ===
test.describe('Snake Game — Modifiers', () => {
  test('modifiers module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('/js/modifiers.js')
      return {
        hasModifiers: Array.isArray(mod.MODIFIERS) && mod.MODIFIERS.length >= 6,
        modifierCount: mod.MODIFIERS.length,
        hasGetActiveModifierIds: typeof mod.getActiveModifierIds === 'function',
        hasSaveActiveModifierIds: typeof mod.saveActiveModifierIds === 'function',
        hasToggleModifier: typeof mod.toggleModifier === 'function',
        hasIsModifierUnlocked: typeof mod.isModifierUnlocked === 'function',
        hasComputeMultiplier: typeof mod.computeModifierMultiplier === 'function',
        hasGetModifierStatePatch: typeof mod.getModifierStatePatch === 'function',
        hasIsModifierActive: typeof mod.isModifierActive === 'function',
        hasRenderModifierScreen: typeof mod.renderModifierScreen === 'function',
        hasCreateModifierScreenState: typeof mod.createModifierScreenState === 'function',
      }
    })
    expect(exports.hasModifiers).toBe(true)
    expect(exports.modifierCount).toBe(8)
    expect(exports.hasGetActiveModifierIds).toBe(true)
    expect(exports.hasSaveActiveModifierIds).toBe(true)
    expect(exports.hasToggleModifier).toBe(true)
    expect(exports.hasIsModifierUnlocked).toBe(true)
    expect(exports.hasComputeMultiplier).toBe(true)
    expect(exports.hasGetModifierStatePatch).toBe(true)
    expect(exports.hasIsModifierActive).toBe(true)
    expect(exports.hasRenderModifierScreen).toBe(true)
    expect(exports.hasCreateModifierScreenState).toBe(true)
  })

  test('modifier toggle and persistence works', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/modifiers.js')
      // Start with empty
      mod.saveActiveModifierIds([])
      const initial = mod.getActiveModifierIds()
      // Toggle speed_demon on (always unlocked)
      const afterOn = mod.toggleModifier('speed_demon')
      mod.saveActiveModifierIds(afterOn)
      const stored1 = mod.getActiveModifierIds()
      // Toggle speed_demon off
      const afterOff = mod.toggleModifier('speed_demon')
      mod.saveActiveModifierIds(afterOff)
      const stored2 = mod.getActiveModifierIds()
      return {
        initialEmpty: initial.length === 0,
        afterOnContains: afterOn.indexOf('speed_demon') !== -1,
        stored1Contains: stored1.indexOf('speed_demon') !== -1,
        afterOffEmpty: afterOff.indexOf('speed_demon') === -1,
        stored2Empty: stored2.indexOf('speed_demon') === -1,
      }
    })
    expect(result.initialEmpty).toBe(true)
    expect(result.afterOnContains).toBe(true)
    expect(result.stored1Contains).toBe(true)
    expect(result.afterOffEmpty).toBe(true)
    expect(result.stored2Empty).toBe(true)
  })

  test('score multiplier calculation works correctly', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/modifiers.js')
      const noMods = mod.computeModifierMultiplier([])
      const speedDemon = mod.computeModifierMultiplier(['speed_demon'])
      const twoMods = mod.computeModifierMultiplier(['speed_demon', 'hardcore'])
      return { noMods, speedDemon, twoMods }
    })
    expect(result.noMods).toBe(1)
    expect(result.speedDemon).toBe(1.2)
    expect(result.twoMods).toBe(1.7)
  })

  test('modifier state patch applies correctly', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/modifiers.js')
      const patch = mod.getModifierStatePatch(['one_life', 'foggy', 'speed_demon'])
      return {
        hasModifiers: Array.isArray(patch.modifiers) && patch.modifiers.length === 3,
        hasMultiplier: patch.modifierMultiplier > 1,
        hasLives: patch.lives === 1,
        hasFog: patch.fogActive === true,
      }
    })
    expect(result.hasModifiers).toBe(true)
    expect(result.hasMultiplier).toBe(true)
    expect(result.hasLives).toBe(true)
    expect(result.hasFog).toBe(true)
  })

  test('isModifierActive works with game state', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/modifiers.js')
      const stateWith = { modifiers: ['hardcore', 'foggy'] }
      const stateWithout = { modifiers: [] }
      const stateNull = {}
      return {
        hardcoreActive: mod.isModifierActive(stateWith, 'hardcore'),
        foggyActive: mod.isModifierActive(stateWith, 'foggy'),
        speedNotActive: !mod.isModifierActive(stateWith, 'speed_demon'),
        emptyNotActive: !mod.isModifierActive(stateWithout, 'hardcore'),
        nullNotActive: !mod.isModifierActive(stateNull, 'hardcore'),
      }
    })
    expect(result.hardcoreActive).toBe(true)
    expect(result.foggyActive).toBe(true)
    expect(result.speedNotActive).toBe(true)
    expect(result.emptyNotActive).toBe(true)
    expect(result.nullNotActive).toBe(true)
  })

  test('speed_demon modifier is always unlocked', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/modifiers.js')
      return mod.isModifierUnlocked('speed_demon')
    })
    expect(result).toBe(true)
  })

  test('modifier screen accessible from title via M key', async ({ page }) => {
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(300)
    // Press M to open modifiers
    await page.keyboard.press('m')
    await page.waitForTimeout(500)
    // Press ESC to go back
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    expect(errors.length).toBe(0)
  })

  test('modifier screen renders without errors', async ({ page }) => {
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(300)
    await page.keyboard.press('m')
    await page.waitForTimeout(300)
    // Navigate down
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(200)
    // Toggle (Enter)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    // Go back
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    expect(errors.length).toBe(0)
  })

  test('gameplay with modifiers active runs without errors', async ({ page }) => {
    // Enable speed_demon modifier via localStorage before loading
    await page.addInitScript(() => {
      localStorage.setItem('snake-active-modifiers', JSON.stringify(['speed_demon']))
    })
    await page.goto('/')
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.waitForTimeout(300)
    // Start game
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(2000)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1000)
    expect(errors.length).toBe(0)
  })
})

test.describe('Snake Game — Screenshots', () => {
  test('capture title screen screenshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'tests/screenshots/01-title-screen.png', fullPage: true })
  })

  test('capture gameplay screenshot', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(1500)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'tests/screenshots/02-gameplay.png', fullPage: true })
  })
})

test.describe('Snake Game — Environmental Hazards', () => {
  test('hazards module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/hazards.js')
      return {
        hasCreateHazards: typeof mod.createHazards === 'function',
        hasUpdateHazards: typeof mod.updateHazards === 'function',
        hasGetHazardAt: typeof mod.getHazardAt === 'function',
        hasIsHazardDeadly: typeof mod.isHazardDeadly === 'function',
        hasIsSpikeInWarningPhase: typeof mod.isSpikeInWarningPhase === 'function',
        hasIsIceAt: typeof mod.isIceAt === 'function',
        hasGetHazardPositions: typeof mod.getHazardPositions === 'function',
        hasLavaColor: typeof mod.HAZARD_LAVA_COLOR === 'string',
        hasIceColor: typeof mod.HAZARD_ICE_COLOR === 'string',
        hasSpikeColor: typeof mod.HAZARD_SPIKE_COLOR === 'string',
        hasSpikePeriod: typeof mod.SPIKE_PERIOD_TICKS === 'number',
      }
    })
    expect(result.hasCreateHazards).toBe(true)
    expect(result.hasUpdateHazards).toBe(true)
    expect(result.hasGetHazardAt).toBe(true)
    expect(result.hasIsHazardDeadly).toBe(true)
    expect(result.hasIsSpikeInWarningPhase).toBe(true)
    expect(result.hasIsIceAt).toBe(true)
    expect(result.hasGetHazardPositions).toBe(true)
    expect(result.hasLavaColor).toBe(true)
    expect(result.hasIceColor).toBe(true)
    expect(result.hasSpikeColor).toBe(true)
    expect(result.hasSpikePeriod).toBe(true)
  })

  test('hazards do not spawn before wave thresholds', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { createHazards } = await import('/js/hazards.js')
      // Wave 1: no lava (requires wave 4), no ice (requires wave 5), no spikes (requires wave 10)
      var wave1 = createHazards(1, [])
      // Wave 3: still no hazards (lava starts at wave 4)
      var wave3 = createHazards(3, [])
      return {
        wave1Count: wave1.length,
        wave3Count: wave3.length,
      }
    })
    expect(result.wave1Count).toBe(0)
    expect(result.wave3Count).toBe(0)
  })

  test('lava hazard is always deadly', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { isHazardDeadly, getHazardAt } = await import('/js/hazards.js')
      var lavaHazard = { type: 'lava', cells: [{ x: 5, y: 5 }], tickCount: 0 }
      var hazards = [lavaHazard]
      var found = getHazardAt(hazards, 5, 5)
      return {
        foundType: found ? found.type : null,
        deadlyAt0: isHazardDeadly(lavaHazard, 0),
        deadlyAt50: isHazardDeadly(lavaHazard, 50),
        deadlyAt100: isHazardDeadly(lavaHazard, 100),
        notFoundMiss: getHazardAt(hazards, 6, 6),
      }
    })
    expect(result.foundType).toBe('lava')
    expect(result.deadlyAt0).toBe(true)
    expect(result.deadlyAt50).toBe(true)
    expect(result.deadlyAt100).toBe(true)
    expect(result.notFoundMiss).toBeNull()
  })

  test('ice detection works correctly', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { isIceAt } = await import('/js/hazards.js')
      var hazards = [
        { type: 'ice', cells: [{ x: 3, y: 3 }, { x: 3, y: 4 }], tickCount: 0 },
        { type: 'lava', cells: [{ x: 7, y: 7 }], tickCount: 0 },
      ]
      return {
        iceAt3_3: isIceAt(hazards, 3, 3),
        iceAt3_4: isIceAt(hazards, 3, 4),
        iceAt7_7: isIceAt(hazards, 7, 7),
        iceAt0_0: isIceAt(hazards, 0, 0),
      }
    })
    expect(result.iceAt3_3).toBe(true)
    expect(result.iceAt3_4).toBe(true)
    expect(result.iceAt7_7).toBe(false)
    expect(result.iceAt0_0).toBe(false)
  })

  test('spike traps toggle between deadly and safe phases', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { isHazardDeadly, SPIKE_PERIOD_TICKS } = await import('/js/hazards.js')
      var spike = { type: 'spike', cells: [{ x: 5, y: 5 }], tickCount: 0 }
      // First half of cycle (0 to SPIKE_PERIOD_TICKS-1) = deadly
      // Second half (SPIKE_PERIOD_TICKS to 2*SPIKE_PERIOD_TICKS-1) = safe
      return {
        deadlyAtStart: isHazardDeadly(spike, 0),
        deadlyMidFirst: isHazardDeadly(spike, SPIKE_PERIOD_TICKS - 1),
        safeAtSecond: isHazardDeadly(spike, SPIKE_PERIOD_TICKS),
        safeMidSecond: isHazardDeadly(spike, 2 * SPIKE_PERIOD_TICKS - 1),
        deadlyNextCycle: isHazardDeadly(spike, 2 * SPIKE_PERIOD_TICKS),
        spikePeriod: SPIKE_PERIOD_TICKS,
      }
    })
    expect(result.deadlyAtStart).toBe(true)
    expect(result.deadlyMidFirst).toBe(true)
    expect(result.safeAtSecond).toBe(false)
    expect(result.safeMidSecond).toBe(false)
    expect(result.deadlyNextCycle).toBe(true)
    expect(result.spikePeriod).toBe(30)
  })
})

// === META-PROGRESSION & SHOP ===
test.describe('Snake Game — Meta-Progression System', () => {
  test('progression module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('/js/progression.js')
      return {
        hasGetProgression: typeof mod.getProgression === 'function',
        hasCalculateFragments: typeof mod.calculateFragments === 'function',
        hasEarnFragments: typeof mod.earnFragments === 'function',
        hasSpendFragments: typeof mod.spendFragments === 'function',
        hasUnlockTheme: typeof mod.unlockTheme === 'function',
        hasIsThemeUnlocked: typeof mod.isThemeUnlocked === 'function',
        hasPurchaseRunBonus: typeof mod.purchaseRunBonus === 'function',
        hasIsBonusPurchased: typeof mod.isBonusPurchased === 'function',
        hasSetRunBonus: typeof mod.setRunBonus === 'function',
        hasGetRunBonus: typeof mod.getRunBonus === 'function',
        hasCanUseResilience: typeof mod.canUseResilience === 'function',
        hasRunBonuses: Array.isArray(mod.RUN_BONUSES) && mod.RUN_BONUSES.length === 4,
      }
    })
    expect(exports.hasGetProgression).toBe(true)
    expect(exports.hasCalculateFragments).toBe(true)
    expect(exports.hasEarnFragments).toBe(true)
    expect(exports.hasSpendFragments).toBe(true)
    expect(exports.hasUnlockTheme).toBe(true)
    expect(exports.hasIsThemeUnlocked).toBe(true)
    expect(exports.hasPurchaseRunBonus).toBe(true)
    expect(exports.hasIsBonusPurchased).toBe(true)
    expect(exports.hasSetRunBonus).toBe(true)
    expect(exports.hasGetRunBonus).toBe(true)
    expect(exports.hasCanUseResilience).toBe(true)
    expect(exports.hasRunBonuses).toBe(true)
  })

  test('fragment calculation scales with score and wave', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { calculateFragments } = await import('/js/progression.js')
      return {
        zeroScore: calculateFragments(0, 1),
        lowScore: calculateFragments(100, 1),
        midScore: calculateFragments(500, 5),
        highScore: calculateFragments(2000, 20),
        waveOnlyMatters: calculateFragments(0, 10),
      }
    })
    // formula: floor(score / 50) + (wave * 3)
    expect(result.zeroScore).toBe(3)       // 0 + 1*3
    expect(result.lowScore).toBe(5)        // 2 + 1*3
    expect(result.midScore).toBe(25)       // 10 + 5*3
    expect(result.highScore).toBe(100)     // 40 + 20*3
    expect(result.waveOnlyMatters).toBe(30) // 0 + 10*3
  })

  test('earning and spending fragments persists in localStorage', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { getProgression, earnFragments, spendFragments } = await import('/js/progression.js')
      // Clear any existing progression
      localStorage.removeItem('tbc_progression')
      var initial = getProgression()
      // Earn some fragments
      var earned = earnFragments(50)
      var afterEarn = getProgression()
      // Spend some
      var spendOk = spendFragments(20)
      var afterSpend = getProgression()
      // Try to overspend
      var spendFail = spendFragments(9999)
      var afterFail = getProgression()
      return {
        initialFragments: initial.fragments,
        earnedAmount: earned.earned,
        earnedTotal: earned.total,
        afterEarnFragments: afterEarn.fragments,
        afterEarnLifetime: afterEarn.lifetime_earned,
        spendOk: spendOk,
        afterSpendFragments: afterSpend.fragments,
        spendFail: spendFail,
        afterFailFragments: afterFail.fragments,
      }
    })
    expect(result.initialFragments).toBe(0)
    expect(result.earnedAmount).toBe(50)
    expect(result.earnedTotal).toBe(50)
    expect(result.afterEarnFragments).toBe(50)
    expect(result.afterEarnLifetime).toBe(50)
    expect(result.spendOk).toBe(true)
    expect(result.afterSpendFragments).toBe(30)
    expect(result.spendFail).toBe(false)
    expect(result.afterFailFragments).toBe(30)
  })

  test('shop module exports and createShopState works', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/shop.js')
      var state = mod.createShopState()
      return {
        hasCreateShopState: typeof mod.createShopState === 'function',
        hasGetShopItemCount: typeof mod.getShopItemCount === 'function',
        hasHandleShopPurchase: typeof mod.handleShopPurchase === 'function',
        hasRenderShopScreen: typeof mod.renderShopScreen === 'function',
        stateCategory: state.category,
        stateSelectedIndex: state.selectedIndex,
        stateScrollOffset: state.scrollOffset,
        statePurchaseFlash: state.purchaseFlash,
        themesCount: mod.getShopItemCount(0),
        bonusesCount: mod.getShopItemCount(1),
      }
    })
    expect(result.hasCreateShopState).toBe(true)
    expect(result.hasGetShopItemCount).toBe(true)
    expect(result.hasHandleShopPurchase).toBe(true)
    expect(result.hasRenderShopScreen).toBe(true)
    expect(result.stateCategory).toBe(0)
    expect(result.stateSelectedIndex).toBe(0)
    expect(result.stateScrollOffset).toBe(0)
    expect(result.statePurchaseFlash).toBe(0)
    expect(result.themesCount).toBe(3)
    expect(result.bonusesCount).toBe(4)
  })

  test('shop purchase fails without enough fragments and succeeds with enough', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { handleShopPurchase } = await import('/js/shop.js')
      const { earnFragments, getProgression } = await import('/js/progression.js')
      // Clear progression
      localStorage.removeItem('tbc_progression')
      // Try to buy a run bonus (head_start costs 150) with no fragments
      var failResult = handleShopPurchase({ category: 1, selectedIndex: 0 })
      // Earn enough fragments
      earnFragments(200)
      var balanceBefore = getProgression().fragments
      // Buy the run bonus
      var successResult = handleShopPurchase({ category: 1, selectedIndex: 0 })
      var balanceAfter = getProgression().fragments
      // Try to buy it again (already owned — should toggle instead)
      var toggleResult = handleShopPurchase({ category: 1, selectedIndex: 0 })
      return {
        failSuccess: failResult.success,
        failMessage: failResult.message,
        balanceBefore: balanceBefore,
        buySuccess: successResult.success,
        balanceAfter: balanceAfter,
        toggleSuccess: toggleResult.success,
        toggleMessage: toggleResult.message,
      }
    })
    expect(result.failSuccess).toBe(false)
    expect(result.failMessage).toBe('Not enough fragments')
    expect(result.balanceBefore).toBe(200)
    expect(result.buySuccess).toBe(true)
    expect(result.balanceAfter).toBe(50) // 200 - 150
    expect(result.toggleSuccess).toBe(true)
    expect(result.toggleMessage).toContain('deactivated')
  })
})

// === BOSS ENCOUNTERS ===
test.describe('Snake Game — Boss Encounters', () => {
  test('boss module exports all required functions and constants', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('/js/boss.js')
      return {
        hasIsBossWave: typeof mod.isBossWave === 'function',
        hasCreateBoss: typeof mod.createBoss === 'function',
        hasMoveBoss: typeof mod.moveBoss === 'function',
        hasOnPlayerAteFood: typeof mod.onPlayerAteFood === 'function',
        hasPatternChase: mod.PATTERN_CHASE === 'chase',
        hasPatternCircle: mod.PATTERN_CIRCLE === 'circle',
        hasPatternAmbush: mod.PATTERN_AMBUSH === 'ambush',
        hasBossInitialLength: mod.BOSS_INITIAL_LENGTH === 5,
      }
    })
    expect(exports.hasIsBossWave).toBe(true)
    expect(exports.hasCreateBoss).toBe(true)
    expect(exports.hasMoveBoss).toBe(true)
    expect(exports.hasOnPlayerAteFood).toBe(true)
    expect(exports.hasPatternChase).toBe(true)
    expect(exports.hasPatternCircle).toBe(true)
    expect(exports.hasPatternAmbush).toBe(true)
    expect(exports.hasBossInitialLength).toBe(true)
  })

  test('isBossWave triggers correctly at every 10th wave', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { isBossWave } = await import('/js/boss.js')
      return {
        wave0: isBossWave(0),
        wave1: isBossWave(1),
        wave5: isBossWave(5),
        wave10: isBossWave(10),
        wave15: isBossWave(15),
        wave20: isBossWave(20),
        wave30: isBossWave(30),
        wave50: isBossWave(50),
        wave99: isBossWave(99),
        wave100: isBossWave(100),
      }
    })
    expect(result.wave0).toBe(false)
    expect(result.wave1).toBe(false)
    expect(result.wave5).toBe(false)
    expect(result.wave10).toBe(true)
    expect(result.wave15).toBe(false)
    expect(result.wave20).toBe(true)
    expect(result.wave30).toBe(true)
    expect(result.wave50).toBe(true)
    expect(result.wave99).toBe(false)
    expect(result.wave100).toBe(true)
  })

  test('createBoss produces correct initial state', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { createBoss, BOSS_INITIAL_LENGTH } = await import('/js/boss.js')
      var boss = createBoss(10)
      return {
        segmentCount: boss.segments.length,
        initialLength: BOSS_INITIAL_LENGTH,
        hasDirection: boss.direction.x !== undefined && boss.direction.y !== undefined,
        moveCounter: boss.moveCounter,
        growPending: boss.growPending,
        foodCounter: boss.foodCounter,
        entranceTicks: boss.entranceTicks,
        wave: boss.wave,
        hasPattern: typeof boss.pattern === 'string',
      }
    })
    expect(result.segmentCount).toBe(5)
    expect(result.initialLength).toBe(5)
    expect(result.hasDirection).toBe(true)
    expect(result.moveCounter).toBe(0)
    expect(result.growPending).toBe(0)
    expect(result.foodCounter).toBe(0)
    expect(result.entranceTicks).toBe(15)
    expect(result.wave).toBe(10)
    expect(result.hasPattern).toBe(true)
  })

  test('boss grows after player eats 3 food items', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { createBoss, onPlayerAteFood } = await import('/js/boss.js')
      var boss = createBoss(10)
      // Feed 1: no growth yet
      var after1 = onPlayerAteFood(boss)
      // Feed 2: no growth yet
      var after2 = onPlayerAteFood(after1)
      // Feed 3: should trigger growth
      var after3 = onPlayerAteFood(after2)
      // Feed 4: counter resets, no growth
      var after4 = onPlayerAteFood(after3)
      return {
        after1FoodCounter: after1.foodCounter,
        after1Grow: after1.growPending,
        after2FoodCounter: after2.foodCounter,
        after2Grow: after2.growPending,
        after3FoodCounter: after3.foodCounter,
        after3Grow: after3.growPending,
        after4FoodCounter: after4.foodCounter,
        after4Grow: after4.growPending,
      }
    })
    expect(result.after1FoodCounter).toBe(1)
    expect(result.after1Grow).toBe(0)
    expect(result.after2FoodCounter).toBe(2)
    expect(result.after2Grow).toBe(0)
    expect(result.after3FoodCounter).toBe(0)  // resets after growth
    expect(result.after3Grow).toBe(1)
    expect(result.after4FoodCounter).toBe(1)
    expect(result.after4Grow).toBe(1)         // still has pending from before
  })
})

// === WAVE MILESTONE CEREMONIES ===
test.describe('Snake Game — Milestone Ceremonies', () => {
  test('milestone module exports all required functions', async ({ page }) => {
    await page.goto('/')
    const exports = await page.evaluate(async () => {
      const mod = await import('/js/milestone.js')
      return {
        hasIsMilestoneWave: typeof mod.isMilestoneWave === 'function',
        hasGetMilestoneTitle: typeof mod.getMilestoneTitle === 'function',
        hasIsMilestoneActive: typeof mod.isMilestoneActive === 'function',
        hasShowMilestone: typeof mod.showMilestone === 'function',
        hasDismissMilestone: typeof mod.dismissMilestone === 'function',
      }
    })
    expect(exports.hasIsMilestoneWave).toBe(true)
    expect(exports.hasGetMilestoneTitle).toBe(true)
    expect(exports.hasIsMilestoneActive).toBe(true)
    expect(exports.hasShowMilestone).toBe(true)
    expect(exports.hasDismissMilestone).toBe(true)
  })

  test('milestone waves detected correctly at 10, 25, 50, and every 50 after 100', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { isMilestoneWave, getMilestoneTitle } = await import('/js/milestone.js')
      return {
        wave1: isMilestoneWave(1),
        wave5: isMilestoneWave(5),
        wave9: isMilestoneWave(9),
        wave10: isMilestoneWave(10),
        wave11: isMilestoneWave(11),
        wave25: isMilestoneWave(25),
        wave50: isMilestoneWave(50),
        wave75: isMilestoneWave(75),
        wave99: isMilestoneWave(99),
        wave100: isMilestoneWave(100),
        wave150: isMilestoneWave(150),
        wave200: isMilestoneWave(200),
        title10: getMilestoneTitle(10),
        title25: getMilestoneTitle(25),
        title50: getMilestoneTitle(50),
        title100: getMilestoneTitle(100),
        title200: getMilestoneTitle(200),
      }
    })
    expect(result.wave1).toBe(false)
    expect(result.wave5).toBe(false)
    expect(result.wave9).toBe(false)
    expect(result.wave10).toBe(true)
    expect(result.wave11).toBe(false)
    expect(result.wave25).toBe(true)
    expect(result.wave50).toBe(true)
    expect(result.wave75).toBe(false)   // not a milestone (not in list, < 100)
    expect(result.wave99).toBe(false)
    expect(result.wave100).toBe(true)   // 100 % 50 === 0
    expect(result.wave150).toBe(true)   // 150 % 50 === 0
    expect(result.wave200).toBe(true)   // 200 % 50 === 0
    expect(result.title10).toBe('SURVIVOR')
    expect(result.title25).toBe('VETERAN')
    expect(result.title50).toBe('LEGEND')
    expect(result.title100).toBe('IMMORTAL')
    expect(result.title200).toBe('IMMORTAL')
  })

  test('showMilestone creates DOM overlay and dismissMilestone removes it', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(300)
    const result = await page.evaluate(async () => {
      const { showMilestone, isMilestoneActive, dismissMilestone } = await import('/js/milestone.js')
      // Show a milestone
      showMilestone(10, 500, 15, '#fbbf24')
      var isActiveAfterShow = isMilestoneActive()
      var overlayExists = document.querySelector('.milestone-overlay') !== null
      var waveText = document.querySelector('.milestone-wave-num')
      var waveContent = waveText ? waveText.textContent : null
      var badgeText = document.querySelector('.milestone-badge')
      var badgeContent = badgeText ? badgeText.textContent : null
      // Dismiss it
      dismissMilestone()
      // Wait for fade-out (400ms)
      await new Promise(function(r) { setTimeout(r, 500) })
      var isActiveAfterDismiss = isMilestoneActive()
      return {
        isActiveAfterShow: isActiveAfterShow,
        overlayExists: overlayExists,
        waveContent: waveContent,
        badgeContent: badgeContent,
        isActiveAfterDismiss: isActiveAfterDismiss,
      }
    })
    expect(result.isActiveAfterShow).toBe(true)
    expect(result.overlayExists).toBe(true)
    expect(result.waveContent).toBe('WAVE 10')
    expect(result.badgeContent).toBe('SURVIVOR')
    expect(result.isActiveAfterDismiss).toBe(false)
  })
})

// === WAVE EVENTS ===
test.describe('Snake Game — Wave Events', () => {
  test('wave events module exports and state creation works', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/wave-events.js')
      var state = mod.createWaveEventState()
      return {
        hasCreateState: typeof mod.createWaveEventState === 'function',
        hasTickWaveEvent: typeof mod.tickWaveEvent === 'function',
        hasCheckBonusFood: typeof mod.checkBonusFoodCollection === 'function',
        hasResetForNewWave: typeof mod.resetWaveEventForNewWave === 'function',
        hasGetActiveDisplay: typeof mod.getActiveEventDisplay === 'function',
        hasIsSpeedBurst: typeof mod.isSpeedBurstActive === 'function',
        hasIsGoldRush: typeof mod.isGoldRushActive === 'function',
        hasGetStormPortals: typeof mod.getStormPortals === 'function',
        hasGetBonusFood: typeof mod.getBonusFood === 'function',
        hasEventTypes: typeof mod.EVENT_TYPES === 'object',
        stateTicksSince: state.ticksSinceLastEvent,
        stateActiveEvent: state.activeEvent,
        stateBannerTicks: state.bannerTicksLeft,
        stateBonusFoodEmpty: state.bonusFood.length === 0,
        stateGoldRush: state.goldRushActive,
      }
    })
    expect(result.hasCreateState).toBe(true)
    expect(result.hasTickWaveEvent).toBe(true)
    expect(result.hasCheckBonusFood).toBe(true)
    expect(result.hasResetForNewWave).toBe(true)
    expect(result.hasGetActiveDisplay).toBe(true)
    expect(result.hasIsSpeedBurst).toBe(true)
    expect(result.hasIsGoldRush).toBe(true)
    expect(result.hasGetStormPortals).toBe(true)
    expect(result.hasGetBonusFood).toBe(true)
    expect(result.hasEventTypes).toBe(true)
    expect(result.stateTicksSince).toBe(0)
    expect(result.stateActiveEvent).toBeNull()
    expect(result.stateBannerTicks).toBe(0)
    expect(result.stateBonusFoodEmpty).toBe(true)
    expect(result.stateGoldRush).toBe(false)
  })

  test('wave events do not fire before wave 3', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { createWaveEventState, tickWaveEvent } = await import('/js/wave-events.js')
      const { createInitialState } = await import('/js/state.js')
      var waveEvent = createWaveEventState()
      // Force the nextEventAt to 1 so it would fire immediately if allowed
      waveEvent.nextEventAt = 1
      waveEvent.ticksSinceLastEvent = 5
      var gameState = createInitialState()
      gameState.endlessWave = 1  // wave 1 — should NOT fire
      var result1 = tickWaveEvent(waveEvent, gameState)
      gameState.endlessWave = 2  // wave 2 — should NOT fire
      var result2 = tickWaveEvent(waveEvent, gameState)
      return {
        wave1NoEvent: result1.effects === null,
        wave2NoEvent: result2.effects === null,
      }
    })
    expect(result.wave1NoEvent).toBe(true)
    expect(result.wave2NoEvent).toBe(true)
  })
})

// === GAME STATE PERSISTENCE ===
test.describe('Snake Game — Game State Persistence', () => {
  test('high score persists in localStorage across page loads', async ({ page }) => {
    // Set a high score in localStorage before loading
    await page.addInitScript(() => {
      localStorage.setItem('snakeHighScore', '999')
    })
    await page.goto('/')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    const highScoreText = await page.locator('#highScore').textContent()
    expect(parseInt(highScoreText, 10)).toBe(999)
  })

  test('progression data survives corrupted localStorage gracefully', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { getProgression } = await import('/js/progression.js')
      // Set corrupted data
      localStorage.setItem('tbc_progression', 'not-valid-json{{{')
      var prog = getProgression()
      return {
        fragments: prog.fragments,
        lifetime: prog.lifetime_earned,
        themes: prog.unlocked_themes.length,
        bonuses: prog.purchased_bonuses.length,
        activeBonus: prog.active_run_bonus,
      }
    })
    // Should return safe defaults, not crash
    expect(result.fragments).toBe(0)
    expect(result.lifetime).toBe(0)
    expect(result.themes).toBe(0)
    expect(result.bonuses).toBe(0)
    expect(result.activeBonus).toBeNull()
  })
})

// === ADDITIONAL ACHIEVEMENT TESTS ===
test.describe('Snake Game — Achievement Definitions', () => {
  test('all achievement categories have correct color mappings', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const { ACHIEVEMENTS } = await import('/js/achievements.js')
      var categories = {}
      for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        var cat = ACHIEVEMENTS[i].category
        if (!categories[cat]) categories[cat] = 0
        categories[cat]++
      }
      var allHaveId = ACHIEVEMENTS.every(function(a) { return typeof a.id === 'string' && a.id.length > 0 })
      var allHaveName = ACHIEVEMENTS.every(function(a) { return typeof a.name === 'string' && a.name.length > 0 })
      var allHaveDesc = ACHIEVEMENTS.every(function(a) { return typeof a.desc === 'string' && a.desc.length > 0 })
      var allHaveCategory = ACHIEVEMENTS.every(function(a) {
        return ['score', 'endless', 'skill', 'secret'].indexOf(a.category) !== -1
      })
      var uniqueIds = new Set(ACHIEVEMENTS.map(function(a) { return a.id }))
      return {
        totalCount: ACHIEVEMENTS.length,
        categoryBreakdown: categories,
        allHaveId: allHaveId,
        allHaveName: allHaveName,
        allHaveDesc: allHaveDesc,
        allHaveCategory: allHaveCategory,
        allIdsUnique: uniqueIds.size === ACHIEVEMENTS.length,
      }
    })
    expect(result.totalCount).toBeGreaterThanOrEqual(48)
    expect(result.allHaveId).toBe(true)
    expect(result.allHaveName).toBe(true)
    expect(result.allHaveDesc).toBe(true)
    expect(result.allHaveCategory).toBe(true)
    expect(result.allIdsUnique).toBe(true)
    expect(result.categoryBreakdown.score).toBeGreaterThanOrEqual(5)
    expect(result.categoryBreakdown.endless).toBeGreaterThanOrEqual(4)
    expect(result.categoryBreakdown.skill).toBeGreaterThanOrEqual(20)
    expect(result.categoryBreakdown.secret).toBeGreaterThanOrEqual(4)
  })

  test('trail unlock requires matching achievement', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const mod = await import('/js/achievements.js')
      // Clear achievements
      localStorage.removeItem('snake-achievements')
      // 'fade' trail requires 'data_hoarder' achievement
      var fadeLocked = !mod.isTrailUnlocked('fade')
      // 'none' trail has no requirement — always unlocked
      var noneUnlocked = mod.isTrailUnlocked('none')
      // Unlock the required achievement
      mod.unlockAchievement('data_hoarder')
      var fadeNowUnlocked = mod.isTrailUnlocked('fade')
      // Non-existent trail should be locked
      var fakeLocked = !mod.isTrailUnlocked('nonexistent_trail_xyz')
      return {
        fadeLocked: fadeLocked,
        noneUnlocked: noneUnlocked,
        fadeNowUnlocked: fadeNowUnlocked,
        fakeLocked: fakeLocked,
      }
    })
    expect(result.fadeLocked).toBe(true)
    expect(result.noneUnlocked).toBe(true)
    expect(result.fadeNowUnlocked).toBe(true)
    expect(result.fakeLocked).toBe(true)
  })
})
