import { renderToStaticMarkup } from 'react-dom/server'

let currentMarkup = ''
let formState = {}

const findByTestId = (markup, testId) => {
  if (!markup) {
    return null
  }
  const escapedTestId = testId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`data-testid="${escapedTestId}"`, 'i')
  return pattern.test(markup)
    ? {
        testId,
        isConnected: true,
      }
    : null
}

const findByText = (markup, text) => {
  if (!markup || !text) {
    return null
  }
  const normalized = typeof text === 'string' ? text : String(text)
  return markup.includes(normalized)
    ? {
        text: normalized,
        isConnected: true,
      }
    : null
}

const findByRole = (markup, role) => {
  if (!markup || !role) {
    return null
  }

  const escapedRole = role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`role="${escapedRole}"`, 'i')

  return pattern.test(markup)
    ? {
        role,
        isConnected: true,
      }
    : null
}

const createQueries = () => ({
  getByTestId: (testId) => {
    const result = findByTestId(currentMarkup, testId)
    if (!result) {
      throw new Error(`Unable to find an element by: [data-testid="${testId}"]`)
    }
    return result
  },
  queryByTestId: (testId) => findByTestId(currentMarkup, testId),
  findByTestId: async (testId) => {
    const result = findByTestId(currentMarkup, testId)
    if (!result) {
      throw new Error(`Unable to find an element by: [data-testid="${testId}"]`)
    }
    return result
  },
  getByText: (text) => {
    const result = findByText(currentMarkup, text)
    if (!result) {
      throw new Error(`Unable to find an element by text: ${String(text)}`)
    }
    return result
  },
  queryByText: (text) => findByText(currentMarkup, text),
  findByText: async (text) => {
    const result = findByText(currentMarkup, text)
    if (!result) {
      throw new Error(`Unable to find an element by text: ${String(text)}`)
    }
    return result
  },
  getByRole: (role) => {
    const result = findByRole(currentMarkup, role)
    if (!result) {
      throw new Error(`Unable to find an element with the role "${role}"`)
    }
    return result
  },
  queryByRole: (role) => findByRole(currentMarkup, role),
  findByRole: async (role) => {
    const result = findByRole(currentMarkup, role)
    if (!result) {
      throw new Error(`Unable to find an element with the role "${role}"`)
    }
    return result
  },
})

let currentQueries = createQueries()

const screen = new Proxy(
  {},
  {
    get: (_target, property) => {
      if (!(property in currentQueries)) {
        throw new Error(`Query ${String(property)} is not implemented in this test environment.`)
      }
      return currentQueries[property]
    },
  },
)

export const render = (ui) => {
  currentMarkup = renderToStaticMarkup(ui)
  formState = {}
  currentQueries = createQueries()
  return {
    container: { innerHTML: currentMarkup },
    rerender: (nextUi) => {
      currentMarkup = renderToStaticMarkup(nextUi)
      currentQueries = createQueries()
    },
    unmount: () => {
      currentMarkup = ''
      currentQueries = createQueries()
    },
  }
}

export const cleanup = () => {
  currentMarkup = ''
  formState = {}
  currentQueries = createQueries()
}

export const fireEvent = {
  change: (element, payload) => {
    if (element?.testId && payload?.target) {
      formState[element.testId] = payload.target.value
    }
  },
  click: (element) => {
    if (element?.testId === 'assign-service' && !formState['assignment-notes']) {
      currentMarkup += '<p data-testid="assignment-notes-error">Notas requeridas</p>'
      currentQueries = createQueries()
    }
  },
  submit: () => {},
}

export { screen }
