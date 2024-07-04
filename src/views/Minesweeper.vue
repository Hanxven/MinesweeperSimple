<template>
  <div id="container" @contextmenu.prevent @mouseup="resetInteractionState">
    <div
      id="board"
      :class="{
        win: gameStatus === GameStatus.WIN,
        lose: gameStatus === GameStatus.LOSE,
        initializing: gameMap.length === 0
      }"
      @mouseleave="clearCellInfo">
      <div class="row" v-for="(row, rowIndex) of gameMap" :key="rowIndex">
        <div
          class="cell"
          v-for="(cell, colIndex) of row"
          @mousedown.stop="handleMouseDown($event, rowIndex, colIndex)"
          @mouseup.stop="handleMouseUp($event, rowIndex, colIndex)"
          @mouseenter.stop="handleMouseEnter($event, rowIndex, colIndex)"
          :key="cell.id"
          :class="{
            unrevealed: !cell.revealed,
            [`cell-${cell.mineCount}`]: cell.revealed,
            'show-influence': cell.showInfluence,
            'wrong-flag': cell.wrongFlag,
            'can-flag': cell.canFlag,
            'to-reveal': cell.toReveal
          }">
          <template v-if="cell.revealed">
            <template
              v-if="cell.mineCount !== 0 && cell.mineCount !== MINE_NUMBER">
              {{ cell.mineCount }}
            </template>
            <template v-else-if="cell.mineCount === MINE_NUMBER">
              <Mine class="mine" />
            </template>
          </template>
          <template v-else-if="cell.flagged">
            <Flag class="flag" />
          </template>
          <Close v-if="cell.wrongFlag" class="wrong-flag-icon" />
        </div>
      </div>
      <div
        key="showing"
        v-show="
          gameStatus !== GameStatus.GAMING && gameStatus !== GameStatus.PRE_GAME
        "
        id="lock-mask"></div>
      <div v-if="gameMap.length === 0" id="initializing-mask">加载中...</div>
    </div>
    <div id="operations">
      <div class="game-params">
        <span>{{ `时间: ${formattedTime}` }}</span>
        <span>{{
          `${gameParams.rows} x ${gameParams.cols} · ${gameParams.mineCount} 雷`
        }}</span>
        <span>{{
          `(${(
            (gameParams.mineCount / (gameParams.rows * gameParams.cols)) *
            100
          ).toFixed(2)}% 覆盖率)`
        }}</span>
        <span>{{ `${flaggedCount} 已标记` }}</span>
        <span class="cheat-hint">{{
          cellInfoText ? `${cellInfoText}` : ''
        }}</span>
      </div>
      <div class="btn-group">
        <button type="button" class="btn" @click="restartGame">重新生成</button>
        <button type="button" class="btn" @click="reproduceGame">
          重试本局
        </button>
        <Checkbox
          title="保证第一次不是雷"
          :disabled="gameStatus === GameStatus.GAMING || isReproducedGame"
          v-model="config.avoidBadStart"
          >避免坏开局</Checkbox
        >
        <Checkbox
          v-if="false"
          :disabled="gameStatus === GameStatus.GAMING"
          v-model="config.enableProp"
          >Prop Enabled</Checkbox
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTimer } from '@/compositions/useTimer'
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  toRaw,
  watch
} from 'vue'
import Checkbox from '@/components/Checkbox.vue'
import Close from '@/components/Close.vue'
import Flag from '@/components/Flag.vue'
import Mine from '@/components/Mine.vue'

const enum CellProp {
  NONE = 0,
  REVEAL_RANDOM_ONE = 1,
  PEEK_ONE = 2
}

interface MapCell {
  // ID 可能没用，但先占着位置吧
  id: number
  mineCount: number
  cellProp: CellProp
  revealed: boolean
  flagged: boolean
  showInfluence: boolean
  wrongFlag: boolean
  toReveal: boolean
  canFlag: boolean
}

interface MapCellWithPosition extends Position {
  cell: MapCell
}

interface Position {
  row: number
  col: number
}

const enum PressingState {
  NONE = 0x0,
  LEFT = 0x1,
  RIGHT = 0x2,
  BOTH = 0x4
}

const enum GameStatus {
  NONE = 0x0,
  PRE_GAME = 0x1,
  GAMING = 0x2,
  LOSE = 0x4,
  WIN = 0x8
}

// 使用一个特殊的数字来代表雷
const MINE_NUMBER = 100

const config = reactive({
  avoidBadStart: true,
  enableProp: false
})

onMounted(() => {
  const configStr = localStorage.getItem('config')
  if (configStr) {
    try {
      const configObj = JSON.parse(configStr)
      if (!configObj) {
        return
      }
      if (
        typeof configObj.avoidBadStart !== 'undefined' &&
        typeof configObj.avoidBadStart === 'boolean'
      ) {
        config.avoidBadStart = configObj.avoidBadStart
      }
      if (
        typeof configObj.enableProp !== 'undefined' &&
        typeof configObj.enableProp === 'boolean'
      ) {
        config.enableProp = configObj.enableProp
      }
    } catch {
      /* ignore */
    }
  }
})

watch(config, (val) => {
  localStorage.setItem('config', JSON.stringify(toRaw(val)))
})

const gameMap = ref<MapCell[][]>([])
const gameStatus = ref<GameStatus>(GameStatus.PRE_GAME)
const isReproducedGame = ref(false)

const formatTime = (time: number) => {
  const h = (Math.floor(time / 3600000) % 60).toString().padStart(2, '0')
  const m = (Math.floor(time / 60000) % 60).toString().padStart(2, '0')
  const s = (Math.floor(time / 1000) % 60).toString().padStart(2, '0')
  const ss = (Math.floor(time) % 1000).toString().padStart(3, '0')
  return `${h}:${m}:${s}:${ss}`
}

const {
  time,
  reset: resetTimer,
  start: startTimer,
  stop: stopTimer
} = useTimer({
  fps: 15,
  immediate: false
})

const formattedTime = computed(() => {
  return formatTime(time.value)
})

const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const randomIntX = (min: number, max: number, power: number): number => {
  const diff = max - min
  const rand = Math.random() ** power
  return Math.floor(rand * diff) + min
}

const getCellsAround = (row: number, col: number) => {
  const aroundCells: MapCellWithPosition[] = []
  if (row - 1 >= 0) {
    aroundCells.push({
      row: row - 1,
      col,
      cell: gameMap.value[row - 1][col]
    })
  }
  if (col - 1 >= 0) {
    aroundCells.push({
      row,
      col: col - 1,
      cell: gameMap.value[row][col - 1]
    })
  }
  if (row + 1 < gameMap.value.length) {
    aroundCells.push({
      row: row + 1,
      col,
      cell: gameMap.value[row + 1][col]
    })
  }
  if (col + 1 < gameMap.value[0].length) {
    aroundCells.push({
      row,
      col: col + 1,
      cell: gameMap.value[row][col + 1]
    })
  }
  if (row - 1 >= 0 && col - 1 >= 0) {
    aroundCells.push({
      row: row - 1,
      col: col - 1,
      cell: gameMap.value[row - 1][col - 1]
    })
  }
  if (row - 1 >= 0 && col + 1 < gameMap.value[0].length) {
    aroundCells.push({
      row: row - 1,
      col: col + 1,
      cell: gameMap.value[row - 1][col + 1]
    })
  }
  if (row + 1 < gameMap.value.length && col - 1 >= 0) {
    aroundCells.push({
      row: row + 1,
      col: col - 1,
      cell: gameMap.value[row + 1][col - 1]
    })
  }
  if (row + 1 < gameMap.value.length && col + 1 < gameMap.value[0].length) {
    aroundCells.push({
      row: row + 1,
      col: col + 1,
      cell: gameMap.value[row + 1][col + 1]
    })
  }
  return aroundCells
}

const generateMap = (rowCount: number, colCount: number, mineCount: number) => {
  if (mineCount === 0) {
    mineCount = 1
  }
  if (rowCount * colCount === mineCount) {
    rowCount++
  }

  gameParams.rows = rowCount
  gameParams.cols = colCount
  gameParams.mineCount = mineCount

  const newGameMap: MapCell[][] = []

  for (let i = 0; i < rowCount; i++) {
    const row: MapCell[] = []
    for (let j = 0; j < colCount; j++) {
      row.push({
        id: i * rowCount + j,
        mineCount: 0,
        cellProp: CellProp.NONE,
        revealed: false,
        flagged: false,
        showInfluence: false,
        wrongFlag: false,
        canFlag: false,
        toReveal: false
      })
    }
    newGameMap.push(row)
  }

  // 选择埋雷的地方
  const candidatesArr: Position[] = []
  for (let i = 0; i < rowCount; i++) {
    for (let j = 0; j < colCount; j++) {
      candidatesArr.push({ row: i, col: j })
    }
  }

  let minePlaced = 0
  while (minePlaced < mineCount) {
    const index = randomInt(0, candidatesArr.length - 1)
    const pos = candidatesArr[index]
    candidatesArr.splice(index, 1)
    newGameMap[pos.row][pos.col].mineCount = MINE_NUMBER
    minePlaced++
  }

  gameMap.value = newGameMap

  // 填充数字
  for (let i = 0; i < rowCount; i++) {
    for (let j = 0; j < colCount; j++) {
      if (newGameMap[i][j].mineCount === MINE_NUMBER) {
        continue
      }

      const cell = gameMap.value[i][j]
      const mineCountAround = getCellsAround(i, j).reduce((p, c) => {
        return p + (c.cell.mineCount === MINE_NUMBER ? 1 : 0)
      }, 0)

      cell.mineCount = mineCountAround
    }
  }
}

const revealCellAndCheckWin = (row: number, col: number, isArea = false) => {
  if (
    gameStatus.value !== GameStatus.GAMING ||
    row < 0 ||
    row >= gameMap.value.length ||
    col < 0 ||
    col >= gameMap.value[0].length
  ) {
    return
  }

  const cell = gameMap.value[row][col]
  if (cell.revealed || cell.flagged) {
    return
  }
  if (cell.mineCount === MINE_NUMBER) {
    gameStatus.value = GameStatus.LOSE
    stopTimer()
    revealAll()
  } else if (cell.mineCount === 0) {
    revealArea(row, col)
  } else {
    cell.revealed = true
  }

  checkGameEndAndCleanup()
}

const checkGameEndAndCleanup = () => {
  if (gameStatus.value === GameStatus.GAMING && checkWin()) {
    gameStatus.value = GameStatus.WIN
    revealAll(true)
    stopTimer()
  }
}

const flaggedCount = ref(0)

const flag = (row: number, col: number) => {
  if (gameStatus.value !== GameStatus.GAMING) {
    return
  }
  const cell = gameMap.value[row][col]
  if (!cell.revealed) {
    cell.flagged = !cell.flagged
    if (cell.flagged) {
      flaggedCount.value++
    } else {
      flaggedCount.value--
    }
  }
}

const revealArea = (row: number, col: number) => {
  if (
    row < 0 ||
    row >= gameMap.value.length ||
    col < 0 ||
    col >= gameMap.value[0].length
  ) {
    return
  }

  const cell = gameMap.value[row][col]

  if (cell.revealed || cell.flagged) {
    return
  }

  cell.revealed = true

  if (cell.mineCount === 0) {
    getCellsAround(row, col).forEach((c) => revealArea(c.row, c.col))
  }
}

const relocateMineOnFirstClick = (row: number, col: number) => {
  const cell = gameMap.value[row][col]
  if (cell.mineCount === MINE_NUMBER) {
    let newRow: number
    let newCol: number
    let loopCount = 0
    while (true) {
      if (loopCount > 15) {
        for (let i = 0; i < gameMap.value.length; i++) {
          for (let j = 0; j < gameMap.value[0].length; j++) {
            if (gameMap.value[i][j].mineCount !== MINE_NUMBER) {
              newRow = i
              newCol = j
              break
            }
          }
        }
        newRow = 0
        newCol = 0
      } else {
        const r = randomInt(0, gameMap.value.length - 1)
        const c = randomInt(0, gameMap.value[0].length - 1)
        if (gameMap.value[r][c].mineCount !== MINE_NUMBER) {
          newRow = r
          newCol = c
          break
        }
      }
      loopCount++
    }

    let temp = gameMap.value[row][col]
    gameMap.value[row][col] = gameMap.value[newRow][newCol]
    gameMap.value[newRow][newCol] = temp

    const affectedCells = new Set<MapCellWithPosition>()
    affectedCells.add({
      row,
      col,
      cell: gameMap.value[row][col]
    })
    getCellsAround(row, col).forEach((c) => affectedCells.add(c))
    getCellsAround(newRow, newCol).forEach((c) => affectedCells.add(c))
    affectedCells.forEach((c) => {
      if (c.cell.mineCount === MINE_NUMBER) {
        return
      }

      const mineCountAround = getCellsAround(c.row, c.col).reduce((p, c) => {
        return p + (c.cell.mineCount === MINE_NUMBER ? 1 : 0)
      }, 0)

      c.cell.mineCount = mineCountAround
    })
  }
}

let pressingState: PressingState
let unrevealedCellsAround: MapCellWithPosition[]
let currentPos: Position | null
let keydownCallback: (this: HTMLElement, e: KeyboardEvent) => void
let keyupCallback: (this: HTMLElement, e: KeyboardEvent) => void
let isPressingZ = false
const cellInfoText = ref('')

const handleMouseDown = (e: MouseEvent, row: number, col: number) => {
  switch (e.buttons) {
    // 左
    case 1:
      pressingState = PressingState.LEFT
      break

    // 右
    case 2:
      pressingState = PressingState.RIGHT
      break

    // 左右 中键忽略
    case 3:
    case 4:
    case 7:
      pressingState = PressingState.BOTH
      showInfluence(row, col)
      break
  }
}

const handleMouseUp = (_: MouseEvent, row: number, col: number) => {
  switch (pressingState) {
    // 左
    case PressingState.LEFT:
      if (gameStatus.value === GameStatus.PRE_GAME) {
        gameStatus.value = GameStatus.GAMING
        startTimer()
        if (config.avoidBadStart) {
          relocateMineOnFirstClick(row, col)
        }
      }

      revealCellAndCheckWin(row, col)
      break

    // 右
    case PressingState.RIGHT:
      if (gameStatus.value === GameStatus.PRE_GAME) {
        gameStatus.value = GameStatus.GAMING
        startTimer()
      }
      flag(row, col)
      break

    // 左右
    case PressingState.BOTH:
      revealAreaIfFlaggedEnough(row, col)
      clearHighlight()
      pressingState = PressingState.NONE
      break

    // 其他的情况 (估计没有)
  }
}

const updateCellInfoOnHover = (show: boolean) => {
  if (!currentPos) {
    return
  }
  if (!show || !isPressingZ) {
    cellInfoText.value = ''
    return
  }
  const cell = gameMap.value[currentPos.row][currentPos.col]
  cellInfoText.value = `${
    cell.mineCount === MINE_NUMBER ? 'M' : cell.mineCount
  }`
}

onMounted(() => {
  document.body.addEventListener(
    'keydown',
    (keydownCallback = (e) => {
      if (e.repeat || e.key.toUpperCase() !== 'Z') {
        return
      }
      isPressingZ = true
      updateCellInfoOnHover(true)
    })
  )
  document.body.addEventListener(
    'keyup',
    (keyupCallback = (e) => {
      if (e.key.toUpperCase() !== 'Z') {
        return
      }
      isPressingZ = false
      updateCellInfoOnHover(false)
    })
  )
})

onUnmounted(() => {
  document.body.removeEventListener('keydown', keydownCallback)
  document.body.removeEventListener('keyup', keyupCallback)
})

const handleMouseEnter = (_: MouseEvent, row: number, col: number) => {
  currentPos = { row, col }
  updateCellInfoOnHover(true)
  if (pressingState === PressingState.BOTH) {
    clearHighlight()
    showInfluence(row, col)
  }
}

const clearHighlight = () => {
  if (unrevealedCellsAround) {
    unrevealedCellsAround.forEach((c) => {
      c.cell.showInfluence = false
      c.cell.toReveal = false
      c.cell.canFlag = false
    })
  }
}

const clearCellInfo = () => {
  updateCellInfoOnHover(false)
}

const resetInteractionState = () => {
  pressingState = PressingState.NONE
  currentPos = null
  clearHighlight()
}

const showInfluence = (row: number, col: number) => {
  if (gameMap.value[row][col].revealed) {
    const cells = getCellsAround(row, col).filter((c) => !c.cell.revealed)

    const restCells = cells.filter((c) => !c.cell.flagged)

    const flaggedCount = cells.reduce((p, c) => p + (c.cell.flagged ? 1 : 0), 0)

    if (flaggedCount >= gameMap.value[row][col].mineCount) {
      restCells.forEach((c) => {
        c.cell.toReveal = true
      })
    } else if (cells.length === gameMap.value[row][col].mineCount) {
      restCells.forEach((c) => {
        c.cell.canFlag = true
      })
    } else {
      restCells.forEach((c) => {
        c.cell.showInfluence = true
      })
    }

    unrevealedCellsAround = cells
  }
}

const revealAreaIfFlaggedEnough = (row: number, col: number) => {
  const cell = gameMap.value[row][col]

  if (!cell.revealed || cell.mineCount < 1 || cell.mineCount > 8) {
    return
  }

  const cells = getCellsAround(row, col)
  const flaggedCount = unrevealedCellsAround.reduce(
    (p, c) => p + (c.cell.flagged ? 1 : 0),
    0
  )

  if (flaggedCount >= gameMap.value[row][col].mineCount) {
    cells
      .filter((c) => !c.cell.revealed)
      .forEach((c) => revealCellAndCheckWin(c.row, c.col, true))
  }
}

const revealAll = (fillFlag = false) => {
  for (let i = 0; i < gameMap.value.length; i++) {
    for (let j = 0; j < gameMap.value[0].length; j++) {
      const cell = gameMap.value[i][j]
      if (!cell.revealed) {
        if (cell.mineCount === MINE_NUMBER && fillFlag) {
          if (!cell.flagged) {
            cell.flagged = true
            flaggedCount.value++
          }
        } else if (cell.mineCount !== MINE_NUMBER && cell.flagged) {
          cell.revealed = true
          cell.wrongFlag = true
        } else {
          cell.revealed = true
        }
      }
    }
  }
}

const gameParams = reactive({
  rows: 0,
  cols: 0,
  mineCount: 0
})

// const evaluateDeviceWidth = () => {
//   const width = document.body.clientWidth
//   const height = document.body.clientHeight

//   const maxRows = Math.floor(width / 26)
//   const maxCols = Math.floor(height / 26)

//   return {
//     maxRows,
//     maxCols
//   }
// }

const generateRandomSizeMap = () => {
  const rows = randomIntX(10, 40, 2)
  const cols = randomIntX(10, 60, 2)

  const mineCount = randomInt(
    Math.floor(rows * cols * 0.08),
    Math.floor(rows * cols * 0.2)
  )

  generateMap(rows, cols, mineCount)
}

const checkWin = () => {
  let flagged = 0
  let unrevealedAndNotFlagged = 0
  let mineCount = 0

  for (let i = 0; i < gameMap.value.length; i++) {
    for (let j = 0; j < gameMap.value[0].length; j++) {
      const cell = gameMap.value[i][j]
      if (cell.mineCount === MINE_NUMBER) {
        mineCount++
      }
      if (!cell.revealed && !cell.flagged) {
        unrevealedAndNotFlagged++
      } else if (cell.flagged) {
        flagged++
      }
    }
  }

  return flagged + unrevealedAndNotFlagged === mineCount
}

const restartGame = () => {
  gameStatus.value = GameStatus.PRE_GAME
  isReproducedGame.value = false
  flaggedCount.value = 0
  stopTimer()
  resetTimer()
  generateRandomSizeMap()
}

const reproduceGame = () => {
  gameStatus.value = GameStatus.PRE_GAME
  isReproducedGame.value = true
  flaggedCount.value = 0
  config.avoidBadStart = false
  stopTimer()
  resetTimer()
  for (let i = 0; i < gameMap.value.length; i++) {
    for (let j = 0; j < gameMap.value[0].length; j++) {
      gameMap.value[i][j] = {
        id: gameMap.value[i][j].id,
        mineCount: gameMap.value[i][j].mineCount,
        cellProp: CellProp.NONE,
        canFlag: false,
        flagged: false,
        revealed: false,
        showInfluence: false,
        toReveal: false,
        wrongFlag: false
      }
    }
  }
}

onMounted(() => {
  console.log(
    "Welcome to the Konata version of Minesweeper! You can play by pressing either the left, right, or both mouse buttons. Hold 'z' if you wish to cheat. Enjoy the game!"
  )
  generateRandomSizeMap()
})
</script>

<style lang="less" scoped>
#container {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-flow: column;
  min-height: 100%;
  min-width: max-content;
}

#board {
  display: flex;
  flex-flow: column;
  gap: 1px;
  position: relative;
  padding: 4px;
  border: 1px solid rgb(180, 180, 180);
  border-radius: 4px;
  box-shadow: 0 0 0px black;

  transition: border-color 0.3s ease, box-shadow 0.3s ease;

  &.win {
    border-color: rgb(2, 161, 2);
    box-shadow: 0 0 8px rgba(2, 161, 2, 0.284);
  }

  &.lose {
    border-color: rgb(169, 23, 23);
    box-shadow: 0 0 8px rgba(169, 23, 23, 0.284);
  }

  &.initializing {
    height: 200px;
    width: 200px;
    background-color: rgb(254, 254, 254);
  }
}

#lock-mask {
  position: absolute;
  inset: 0 0 0 0;
}

#initializing-mask {
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  inset: 0 0 0 0;
  font-size: 12px;
}

.row {
  display: flex;
  gap: 1px;
}

.cell {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 26px;
  width: 26px;
  border-radius: 4px;
  background-color: rgb(196, 244, 255);
  transition: all 0.2s ease;
  position: relative;
  box-sizing: border-box;

  font-size: 14px;

  user-select: none;

  &:hover:not(.cell-0) {
    filter: brightness(1.1);
  }

  &:active:not(.cell-0) {
    filter: brightness(0.8);
  }

  cursor: pointer;
}

#operations {
  display: flex;
  align-items: center;
  flex-flow: column;
  gap: 8px;
  margin-top: 8px;
}

.btn-group {
  display: flex;
  gap: 4px;
}

.btn {
  background-color: rgb(111, 111, 255);
  width: 80px;
  height: 30px;
  border-radius: 4px;
  border: none;
  color: white;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgb(80, 80, 255);
  }

  &:active {
    background-color: rgb(48, 48, 253);
    transform: scale(0.95);
  }

  cursor: pointer;
}

.unrevealed {
  background-color: rgb(158, 158, 158);
}

.cell-0 {
  background-color: rgb(242, 247, 255);
  border-color: rgb(255, 255, 255);
  cursor: default;
}

.cell-1 {
  background-color: rgb(202, 235, 198);
}

.cell-2 {
  background-color: rgb(239, 233, 221);
}

.cell-3 {
  background-color: rgb(197, 193, 235);
}

.cell-4 {
  background-color: rgb(236, 183, 235);
}

.cell-5 {
  background-color: rgb(236, 183, 200);
}

.cell-6 {
  background-color: rgb(241, 75, 53);
  color: white;
}

.cell-7 {
  background-color: rgb(184, 13, 231);
  color: white;
}

.cell-8 {
  background-color: rgb(47, 12, 46);
  color: white;
}

.cell-100 {
  background-color: rgb(180, 136, 136);
}

.mine {
  width: 22px;
  height: 22px;
  color: rgb(67, 33, 33);
}

.wrong-flag-icon {
  position: absolute;
  height: 22px;
  width: 22px;
  color: rgba(226, 44, 44, 0.605);
}

.flag {
  width: 22px;
  height: 22px;
  color: rgb(12, 42, 47);
}

.show-influence {
  border-radius: 50%;
  background-color: rgb(216, 199, 110);
}

.can-flag {
  background-color: rgb(121, 92, 208);
  border-radius: 75%;
}

.to-reveal {
  background-color: rgb(92, 208, 109);
  border-radius: 75%;
}

.game-params {
  font-size: 12px;

  span:not(:last-child) {
    margin-right: 8px;
  }
}

.cheat-hint {
  color: green;
}
</style>
import { reactive, onMounted, watch, toRaw, ref, computed, onUnmounted } from
'vue';
