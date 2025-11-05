import { renderToStaticMarkup } from 'react-dom/server'

let currentMarkup = ''

const findByTestId = (markup, testId) => {
  if (!markup) {
    return null
  }
  const pattern = new RegExp(`data-testid="${testId}"`, 'i')
  return pattern.test(markup) ? { testId } : null
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
  currentQueries = createQueries()
}

export { screen }
