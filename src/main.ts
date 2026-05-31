import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'

const TASKS_KEY = 'routine_tasks_v1'
const STATE_KEY = 'routine_state_v1'
const CONTAINER_ID = 1

const DEFAULT_TASKS: ReadonlyArray<string> = [
  '朝のストレッチ',
  '水を1L飲む',
  '読書30分',
  '瞑想10分',
  '日記を書く',
  '散歩',
  '早寝(23時)',
]

interface State {
  date: string
  done: boolean[]
}

const today = (): string => {
  const d = new Date()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

let tasks: string[] = []
let state: State = { date: today(), done: [] }
let selectedIdx = 0

const bridge = await waitForEvenAppBridge()

const loadTasks = async (): Promise<string[]> => {
  try {
    const raw = await bridge.getLocalStorage(TASKS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
        return parsed as string[]
      }
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_TASKS]
}

const saveTasks = async (t: string[]): Promise<void> => {
  try {
    await bridge.setLocalStorage(TASKS_KEY, JSON.stringify(t))
  } catch {
    // ignore
  }
}

const loadState = async (taskCount: number): Promise<State> => {
  try {
    const raw = await bridge.getLocalStorage(STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as State
      if (
        parsed.date === today() &&
        Array.isArray(parsed.done) &&
        parsed.done.length === taskCount
      ) {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return { date: today(), done: new Array(taskCount).fill(false) }
}

const saveState = async (s: State): Promise<void> => {
  try {
    await bridge.setLocalStorage(STATE_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

const reload = async (): Promise<void> => {
  tasks = await loadTasks()
  state = await loadState(tasks.length)
  if (selectedIdx >= tasks.length) selectedIdx = Math.max(0, tasks.length - 1)
}

// ===== G2-side display =====

const buildContent = (): string => {
  if (tasks.length === 0) {
    return 'タスクがありません\n\nスマホで追加してください'
  }
  const doneCount = state.done.filter(Boolean).length
  const lines: string[] = [`${doneCount} / ${tasks.length}  完了`]
  tasks.forEach((name, i) => {
    const cursor = i === selectedIdx ? '▶' : ' '
    const check = state.done[i] ? '☑' : '☐'
    lines.push(`${cursor} ${check} ${name}`)
  })
  return lines.join('\n')
}

const buildTextContainer = (): TextContainerProperty =>
  new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    paddingLength: 4,
    containerID: CONTAINER_ID,
    containerName: 'main',
    isEventCapture: 1,
    content: buildContent(),
  })

const renderGlasses = async (): Promise<void> => {
  try {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({
        containerTotalNum: 1,
        textObject: [buildTextContainer()],
      }),
    )
  } catch {
    // ignore
  }
}

// ===== Phone-side editor =====

const renderEditor = (): void => {
  const list = document.getElementById('task-list')
  if (!list) return
  list.innerHTML = ''

  if (tasks.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'タスクがまだありません'
    list.appendChild(empty)
    return
  }

  tasks.forEach((name, i) => {
    const row = document.createElement('div')
    row.className = 'task-row'

    const input = document.createElement('input')
    input.type = 'text'
    input.value = name
    input.addEventListener('change', async () => {
      tasks[i] = input.value.trim() || `タスク${i + 1}`
      await saveTasks(tasks)
    })

    const up = document.createElement('button')
    up.className = 'order-btn'
    up.textContent = '▲'
    up.title = '上へ'
    up.disabled = i === 0
    up.addEventListener('click', async () => {
      if (i === 0) return
      ;[tasks[i - 1], tasks[i]] = [tasks[i], tasks[i - 1]]
      ;[state.done[i - 1], state.done[i]] = [state.done[i], state.done[i - 1]]
      await saveTasks(tasks)
      await saveState(state)
      renderEditor()
    })

    const down = document.createElement('button')
    down.className = 'order-btn'
    down.textContent = '▼'
    down.title = '下へ'
    down.disabled = i === tasks.length - 1
    down.addEventListener('click', async () => {
      if (i === tasks.length - 1) return
      ;[tasks[i + 1], tasks[i]] = [tasks[i], tasks[i + 1]]
      ;[state.done[i + 1], state.done[i]] = [state.done[i], state.done[i + 1]]
      await saveTasks(tasks)
      await saveState(state)
      renderEditor()
    })

    const del = document.createElement('button')
    del.className = 'delete-btn'
    del.textContent = '✕'
    del.title = 'タスクを削除'
    del.addEventListener('click', async () => {
      if (!confirm(`「${tasks[i]}」を削除しますか?`)) return
      tasks.splice(i, 1)
      state.done.splice(i, 1)
      await saveTasks(tasks)
      await saveState(state)
      renderEditor()
    })

    row.appendChild(input)
    row.appendChild(up)
    row.appendChild(down)
    row.appendChild(del)
    list.appendChild(row)
  })
}

const setupPhoneEditor = (): void => {
  renderEditor()
  document.getElementById('add-btn')?.addEventListener('click', async () => {
    tasks.push('新しいタスク')
    state.done.push(false)
    await saveTasks(tasks)
    await saveState(state)
    renderEditor()
  })
  document.getElementById('reset-btn')?.addEventListener('click', async () => {
    if (!confirm('今日のチェックをすべて未完了に戻しますか?')) return
    state.done = new Array(tasks.length).fill(false)
    state.date = today()
    await saveState(state)
  })
}

// ===== Init =====

await reload()
setupPhoneEditor()

await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [buildTextContainer()],
  }),
)

const isClick = (t: number | undefined): boolean => t === undefined || t === 0
const isDoubleClick = (t: number | undefined): boolean => t === 3

bridge.onEvenHubEvent(async (event) => {
  const sysType = event.sysEvent?.eventType
  const textType = event.textEvent?.eventType

  if (sysType === 4) {
    await reload()
    await renderGlasses()
    return
  }
  if (sysType === 5 || sysType === 6 || sysType === 7) {
    return
  }

  if ((event.sysEvent && isDoubleClick(sysType)) || (event.textEvent && isDoubleClick(textType))) {
    await bridge.shutDownPageContainer(1)
    return
  }

  if (tasks.length === 0) {
    return
  }

  if (textType === 1) {
    selectedIdx = (selectedIdx - 1 + tasks.length) % tasks.length
    await renderGlasses()
    return
  }
  if (textType === 2) {
    selectedIdx = (selectedIdx + 1) % tasks.length
    await renderGlasses()
    return
  }

  if ((event.sysEvent && isClick(sysType)) || (event.textEvent && isClick(textType))) {
    state.done[selectedIdx] = !state.done[selectedIdx]
    state.date = today()
    await saveState(state)
    await renderGlasses()
  }
})
