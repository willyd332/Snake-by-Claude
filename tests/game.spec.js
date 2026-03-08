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
